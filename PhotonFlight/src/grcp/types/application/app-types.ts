export enum CoreState {
  CORE_STATE_UNSPECIFIED = 0,
  IDLE = 1,
  LOADING = 2,
  READY = 3,
  SHUTTING_DOWN = 4,
}

export interface CoreControlService {
  GetStatus(request: GetStatusRequest): Promise<CoreStatus>;
  LoadDataset(request: LoadDatasetRequest): Promise<LoadDatasetResponse>;
  UnloadDataset(request: UnloadDatasetRequest): Promise<UnloadDatasetResponse>;
  ExecuteCommand(command: Command): Promise<CommandResult>;
  SubscribeEvents(request: SubscribeEventsRequest): AsyncIterable<Event>;
  Shutdown(request: ShutdownRequest): Promise<ShutdownResponse>;
}

export interface PointCloudService {
  GetDataset(request: GetDatasetRequest): Promise<Dataset>;
  StreamPoints(request: StreamPointsRequest): AsyncIterable<PointBatch>;
}

export interface GetStatusRequest {}

export interface CoreStatus {
  core_instance_id: string;
  api_version: string;
  core_version: string;
  state: CoreState;
  uptime_ms: number | string;
  active_dataset?: Dataset;
}

export interface LoadDatasetRequest {
  path: string;
}

export interface LoadDatasetResponse {
  operation?: Operation;
}

export interface UnloadDatasetRequest {
  dataset_id: string;
}

export interface UnloadDatasetResponse {
  operation?: Operation;
}

export interface SubscribeEventsRequest {
  include_snapshot: boolean;
}

export interface ShutdownRequest {
  grace_period_ms: number;
}

export interface ShutdownResponse {
  accepted: boolean;
}

export interface GetDatasetRequest {
  dataset_id: string;
}

export interface StreamPointsRequest {
  dataset_id: string;
  revision: number | string;
  preferred_batch_points: number;
}

export interface PointBatch {
  dataset_id: string;
  revision: number | string;
  point_offset: number | string;
  point_count: number;
  positions_f32_le: Uint8Array;
  colors_rgb_u8: Uint8Array;
  intensities_u16_le: Uint8Array;
  classifications_u8: Uint8Array;
}

export interface Dataset {}
export interface Operation {}
export interface Command {}
export interface CommandResult {}
export interface Event {}




