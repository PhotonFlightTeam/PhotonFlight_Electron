const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

export const CoreControlService = new protoLoader.CoreControlService(
    'localhost:50051', //placeholder for port to communicate via grpc now
    grpc.credentials.CreateInsecure()
);

export const PointCloudService = new protoLoader.PointCloudService(
    'localhost:50051', //placeholder 
    grpc.credentials.CreateInsecure()
);

/*export const shutdown = () =>
  unary<{}, { accepted: boolean; message: string }>(lifecycleClient, 'Shutdown', {}); */

/*NEW COMMENT*/