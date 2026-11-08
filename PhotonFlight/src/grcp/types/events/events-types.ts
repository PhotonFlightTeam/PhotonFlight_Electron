export interface Event {
  timestamp_ms: number | string;
  payload: CoreSnapshotPayload | CoreStateChangedPayload | OperationProgressPayload | DatasetLoadedPayload | DatasetUnloadedPayload | DatasetChangedPayload | PluginStateChangedPayload;
}

export interface CoreSnapshotPayload {
  kind: "core_snapshot";
  core_snapshot: CoreSnapshot;
}

export interface CoreStateChangedPayload {
  kind: "core_state_changed";
  core_state_changed: CoreStateChanged;
}

export interface OperationProgressPayload {
  kind: "operation_progress";
  operation_progress: OperationProgress;
}

export interface DatasetLoadedPayload {
  kind: "dataset_loaded";
  dataset_loaded: DatasetLoaded;
}

export interface DatasetUnloadedPayload {
  kind: "dataset_unloaded";
  dataset_unloaded: DatasetUnloaded;
}

export interface DatasetChangedPayload {
  kind: "dataset_changed";
  dataset_changed: DatasetChanged;
}

export interface PluginStateChangedPayload {
  kind: "plugin_state_changed";
  plugin_state_changed: PluginStateChanged;
}

export interface CoreSnapshot {
  state: CoreState;
  active_dataset?: Dataset;
  plugins: Plugin[];
}

export interface CoreStateChanged {
  state: CoreState;
  message: string;
}

export interface OperationProgress {
  operation: Operation;
}

export interface DatasetLoaded {
  operation_id: string;
  dataset: Dataset;
}

export interface DatasetUnloaded {
  operation_id: string;
  dataset_id: string;
}

export interface DatasetChanged {
  dataset_id: string;
  revision: number | string;
}

export interface PluginStateChanged {
  plugin: Plugin;
  restart_required: boolean;
}

export enum CoreState {
  CORE_STATE_UNSPECIFIED = 0,
  CORE_STATE_STARTING = 1,
  CORE_STATE_READY = 2,
  CORE_STATE_LOADING_DATASET = 3,
  CORE_STATE_SHUTTING_DOWN = 4,
  CORE_STATE_ERROR = 5,
}

export interface Dataset {}
export interface Plugin {}
export interface Operation {}
