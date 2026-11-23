import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { ProtoGrpcType } from './generated/application';
import type { CoreControlServiceClient } from './generated/photonflight/application/v1/CoreControlService';
import type { PointCloudServiceClient } from './generated/photonflight/application/v1/PointCloudService';
import type { CoreStatus__Output } from './generated/photonflight/application/v1/CoreStatus';
import type {
  LoadDatasetRequest, LoadDatasetResponse, UnloadDatasetRequest, UnloadDatasetResponse,
  ShutdownRequest, ShutdownResponse, SubscribeEventsRequest, Command, CommandResult, Event, GetOperationRequest, Operation,
  GetDatasetRequest,
  GetAnnotationsRequest,
  StreamPointsRequest
} from './types/application/app-types';
import type { Dataset } from './types/common/common-types';
import { GetAnnotationsResponse } from './generated/photonflight/application/v1/GetAnnotationsResponse';
import { StreamPointsRequest__Output } from './generated/photonflight/application/v1/StreamPointsRequest';

export const SUPPORTED_CORE_API_VERSION = '1';

export function coreProtoRoot({ appPath, resourcesPath, isPackaged }: {
  appPath: string; resourcesPath: string; isPackaged: boolean;
}): string {
  return isPackaged ? resourcesPath : path.join(appPath, 'proto');
}

// Standardizes unary calls: one deadline, one logged failure path, a Promise result.
function unary<Req, Res>(client: grpc.Client, method: string, req: Req, ms = 10_000): Promise<Res> {
  return new Promise((resolve, reject) => {
    (client as unknown as Record<string, Function>)[method](req, { deadline: new Date(Date.now() + ms) },
      (error: grpc.ServiceError | null, result: Res) => {
        if (error) {
          console.error(`[gRPC] ${method} failed:`, error.code, error.details);
          reject(error);
        } else {
          console.log(result)
          resolve(result)
        };
      });
  });
}

export function createCoreRpcClient({ host, port, protoRoot }: { host: string; port: number; protoRoot: string }) {
  if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Core requires a valid IPv4 loopback endpoint');
  }
  const definition = protoLoader.loadSync(path.join(protoRoot, 'application/application.proto'), {
    includeDirs: [protoRoot], keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
  });
  const api = (grpc.loadPackageDefinition(definition) as unknown as ProtoGrpcType).photonflight.application.v1;
  const control: CoreControlServiceClient = new api.CoreControlService(`${host}:${port}`, grpc.credentials.createInsecure());
  // Both services use the same transport and connection lifetime.
  const points: PointCloudServiceClient = new api.PointCloudService(`${host}:${port}`, grpc.credentials.createInsecure(), {
    channelOverride: control.getChannel(),
  });

  const waitForReady = (deadline: Date): Promise<void> =>
    new Promise((resolve, reject) => control.waitForReady(deadline,
      error => error ? reject(error) : resolve()));

  const getStatus = (deadline = new Date(Date.now() + 5000), signal?: AbortSignal): Promise<CoreStatus__Output> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const abort = () => { call.cancel(); reject(signal?.reason); };
      const call = control.getStatus({}, { deadline }, (error, result) => {
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else if (!result) reject(new Error('Core returned an empty GetStatus response'));
        else resolve(result);
      });
      signal?.addEventListener('abort', abort, { once: true });
    });

  const shutdown = (gracePeriodMs = 10_000) =>
    unary<ShutdownRequest, ShutdownResponse>(control, 'Shutdown', { grace_period_ms: gracePeriodMs });
  const loadDataSet = (dataset: string) =>
    unary<LoadDatasetRequest, LoadDatasetResponse>(control, 'LoadDataset', { path: dataset });
  const unloadDataset = (datasetId: string) =>
    unary<UnloadDatasetRequest, UnloadDatasetResponse>(control, 'UnloadDataset', { dataset_id: datasetId });
  const executeCommand = (command: Command) =>
    unary<Command, CommandResult>(control, 'ExecuteCommand', command);
  // SubscribeEvents is a server stream, so callers get the stream rather than a Promise.
  const subscribeEvents = (includeSnapshot: boolean) =>
    control.subscribeEvents({ include_snapshot: includeSnapshot } satisfies SubscribeEventsRequest);
  const getOperation = (getOperation: GetOperationRequest) => 
    unary<GetOperationRequest, Operation>(control, 'GetOperation', getOperation)
  const getDataSet = (dataset: GetDatasetRequest) =>
    unary<GetDatasetRequest, Dataset>(points, "GetDataset", dataset)
  const getAnnotations = (annotations: GetAnnotationsRequest) => 
    unary<GetAnnotationsRequest, GetAnnotationsResponse>(points, "GetAnnotations", annotations)
  // StreamPoints is a server stream, so callers get the stream rather than a Promise.
  const streamPoints = (pointreq: StreamPointsRequest) => points.streamPoints(pointreq)
  // Closing the shared channel cancels in-flight RPCs on both service clients.
  const close = (): void => {
    control.close()
    points.close()
  }

  return {
    control, points, waitForReady, getStatus, shutdown, loadDataSet, unloadDataset, executeCommand,
    subscribeEvents, close, getOperation, getDataSet, getAnnotations, streamPoints
  };
}

export type CoreRpcClient = ReturnType<typeof createCoreRpcClient>;
