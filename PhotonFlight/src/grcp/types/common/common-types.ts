export enum CoreState {
  CORE_STATE_UNSPECIFIED = 0,
  CORE_STATE_STARTING = 1,
  CORE_STATE_READY = 2,
  CORE_STATE_LOADING_DATASET = 3,
  CORE_STATE_SHUTTING_DOWN = 4,
  CORE_STATE_ERROR = 5,
}

export enum OperationState {
  OPERATION_STATE_UNSPECIFIED = 0,
  OPERATION_STATE_QUEUED = 1,
  OPERATION_STATE_RUNNING = 2,
  OPERATION_STATE_SUCCEEDED = 3,
  OPERATION_STATE_FAILED = 4,
  OPERATION_STATE_CANCELLED = 5,
}

export interface Coordinate3d {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3d {
  minimum: Coordinate3d;
  maximum: Coordinate3d;
}

export interface PointAttributes {
  has_rgb: boolean;
  has_intensity: boolean;
  has_classification: boolean;
}

export interface Dataset {
  id: string;
  revision: number | string;
  display_name: string;
  point_count: number | string;
  origin: Coordinate3d;
  bounds: Bounds3d;
  attributes: PointAttributes;
}

export interface Operation {
  id: string;
  state: OperationState;
  progress: number;
  message: string;
  error?: OperationError;
}

export interface OperationError {
  code: string;
  message: string;
}

export interface Annotation {
  id: string;
  dataset_id: string;
  position: Coordinate3d;
  text: string;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}
