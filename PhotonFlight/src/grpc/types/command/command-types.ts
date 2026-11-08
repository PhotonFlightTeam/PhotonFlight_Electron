export interface Command {
  request_id: string;
  payload: AddAnnotationPayload | RemoveAnnotationPayload | SetPluginEnabledPayload;
}

export interface AddAnnotationPayload {
  kind: "add_annotation";
  add_annotation: AddAnnotationCommand;
}

export interface RemoveAnnotationPayload {
  kind: "remove_annotation";
  remove_annotation: RemoveAnnotationCommand;
}

export interface SetPluginEnabledPayload {
  kind: "set_plugin_enabled";
  set_plugin_enabled: SetPluginEnabledCommand;
}

export interface CommandResult {
  request_id: string;
  resulting_revision: number | string;
  payload: AddAnnotationResultPayload | RemoveAnnotationResultPayload | SetPluginEnabledResultPayload;
}

export interface AddAnnotationResultPayload {
  kind: "add_annotation";
  add_annotation: AddAnnotationResult;
}

export interface RemoveAnnotationResultPayload {
  kind: "remove_annotation";
  remove_annotation: RemoveAnnotationResult;
}

export interface SetPluginEnabledResultPayload {
  kind: "set_plugin_enabled";
  set_plugin_enabled: SetPluginEnabledResult;
}

export interface AddAnnotationCommand {
  dataset_id: string;
  expected_revision: number | string;
  position: Coordinate3d;
  text: string;
}

export interface AddAnnotationResult {
  annotation: Annotation;
}

export interface RemoveAnnotationCommand {
  dataset_id: string;
  expected_revision: number | string;
  annotation_id: string;
}

export interface RemoveAnnotationResult {
  annotation_id: string;
}

export interface SetPluginEnabledCommand {
  plugin_id: string;
  enabled: boolean;
}

export interface SetPluginEnabledResult {
  plugin: Plugin;
  restart_required: boolean;
}

export interface Coordinate3d {
  x: number;
  y: number;
  z: number;
}

export interface Annotation {}
export interface Plugin {}
