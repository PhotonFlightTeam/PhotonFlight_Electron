import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import type { ProtoGrpcType } from './generated/application';
import type { CoreControlServiceClient } from './generated/photonflight/application/v1/CoreControlService';
import type { PointCloudServiceClient } from './generated/photonflight/application/v1/PointCloudService';
import type { CoreStatus__Output } from './generated/photonflight/application/v1/CoreStatus';

export const SUPPORTED_CORE_API_VERSION = '1';

export function coreProtoRoot({ appPath, resourcesPath, isPackaged }: {
  appPath: string; resourcesPath: string; isPackaged: boolean;
}): string {
  return isPackaged ? resourcesPath : path.join(appPath, 'proto');
}

export class CoreRpcClient {
  readonly control: CoreControlServiceClient;
  readonly points: PointCloudServiceClient;

  constructor({ host, port, protoRoot }: { host: string; port: number; protoRoot: string }) {
    if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Core requires a valid IPv4 loopback endpoint');
    }
    const definition = protoLoader.loadSync(path.join(protoRoot, 'application/application.proto'), {
      includeDirs: [protoRoot], keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const api = (grpc.loadPackageDefinition(definition) as unknown as ProtoGrpcType).photonflight.application.v1;
    this.control = new api.CoreControlService(`${host}:${port}`, grpc.credentials.createInsecure());
    // Both services use the same transport and connection lifetime.
    this.points = new api.PointCloudService(`${host}:${port}`, grpc.credentials.createInsecure(), {
      channelOverride: this.control.getChannel(),
    });
  }

  waitForReady(deadline: Date): Promise<void> {
    return new Promise((resolve, reject) => this.control.waitForReady(deadline,
      error => error ? reject(error) : resolve()));
  }

  getStatus(deadline = new Date(Date.now() + 5000), signal?: AbortSignal): Promise<CoreStatus__Output> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }
      const abort = () => { call.cancel(); reject(signal?.reason); };
      const call = this.control.getStatus({}, { deadline }, (error, result) => {
        signal?.removeEventListener('abort', abort);
        if (error) reject(error);
        else if (!result) reject(new Error('Core returned an empty GetStatus response'));
        else resolve(result);
      });
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  close(): void {
    // Closing the shared channel cancels in-flight RPCs on both service clients.
    this.control.close();
  }
}

