import { GrpcObject } from "@grpc/grpc-js";
import { CoreStatus } from "./types/application/app-types"
import * as grpc from "@grpc/grpc-js"

const path = require('path');
const protoLoader = require('@grpc/proto-loader');



export const CoreControlService = new protoLoader.CoreControlService(
    'localhost:50051', //placeholder for port to communicate via grpc now
    grpc.credentials.createInsecure()
);

export const PointCloudService = new protoLoader.PointCloudService(
    'localhost:50051', //placeholder 
    grpc.credentials.createInsecure()
);

/*export const shutdown = () =>
  unary<{}, { accepted: boolean; message: string }>(lifecycleClient, 'Shutdown', {}); */

const packageDefinition = protoLoader.loadSync(
    path.join(__dirname, 'proto', 'photoncore.proto'), 
    { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
);

const proto = (grpc.loadPackageDefinition(packageDefinition) as any).photoncore.v1

export const  getStatus = (): Promise<CoreStatus>  => {
   return new Promise((resolve, reject) => {
        const deadline = new Date(Date.now() + 5000);
        CoreControlService.getStatus({}, {deadline}, (err: grpc.ServiceError | null, res: CoreStatus) => {
            if (err) return reject(err);
            resolve(res)
        })
    })
} 

