import { GrpcObject } from "@grpc/grpc-js";
import { CoreStatus, GetStatusRequest, LoadDatasetRequest, LoadDatasetResponse, ShutdownRequest, ShutdownResponse, SubscribeEventsRequest, UnloadDatasetRequest, UnloadDatasetResponse } from "./types/application/app-types"
import { Command, CommandResult } from "./types/command/command-types"
import { Event } from "./types/events/events-types"
import * as grpc from "@grpc/grpc-js"
import { app } from "electron";
const path = require('path');
const protoLoader = require('@grpc/proto-loader');

const protoPath = app.isPackaged
  ? path.join(process.resourcesPath, "proto")
  : path.join(app.getAppPath(), "resources", "proto");


const packageDefinition = protoLoader.loadSync(
    path.join("application", "application.proto"), 
    { 
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
        includeDirs: [protoPath],
    }
);

const deadline = (ms = 5000) => new Date(Date.now() + ms);

const proto = (grpc.loadPackageDefinition(packageDefinition) as any).photonflight.application.v1

export const CoreControlService = new proto.CoreControlService(
    '127.0.0.1:34309',
    grpc.credentials.createInsecure()
);

export const PointCloudService = new proto.PointCloudService(
    '127.0.0.1:34309',
    grpc.credentials.createInsecure()
);

// helper that standardizes all calls made to the server return a promise with either and error resolve the resolution
// takes in a type of request and defines a type of response (generics)
function  unary<Req, Res>(client: any, method: string, req: Req, ms = 10000): Promise<Res> {
  return new Promise((resolve, reject) => {
    client[method](req, { deadline: deadline(ms) }, (err: grpc.ServiceError | null, res: Res) => {
      if (err) {
        console.error(`[gRPC] ${method} failed:`, err.code, err.details);
        return reject(err);
      }
      console.log(`[gRPC] ${method} resolved:`, res);
       resolve(res);
    });
  });
}
export const client = {
  getStatus: async () =>  unary<GetStatusRequest, CoreStatus>(CoreControlService, "GetStatus", {}),
  shutdown: () => unary<ShutdownRequest, ShutdownResponse>(CoreControlService, "Shutdown", {grace_period_ms: 10000}),
  loadDataSet: async (dataset: string) => unary<LoadDatasetRequest, LoadDatasetResponse>(CoreControlService, "LoadDataset", {path: dataset}),
  unloadDataset: async (dataId: string) => unary<UnloadDatasetRequest, UnloadDatasetResponse>(CoreControlService, "UnloadDataset", {dataset_id: dataId}),
  executeCommand: async (command: Command) => unary<Command, CommandResult>(CoreControlService, "ExecuteCommand", {request_id: command.request_id, payload: command.payload}),
  subscribeEvents: (snapShot: boolean) => unary<SubscribeEventsRequest, Event>(CoreControlService, "SubscribeEvents", {include_snapshot: snapShot}),
  


  close: () => {
    CoreControlService.close();
    PointCloudService.close();
  },
};
