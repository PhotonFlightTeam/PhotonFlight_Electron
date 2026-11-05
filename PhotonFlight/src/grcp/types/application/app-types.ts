export interface GetStatusRequest {}

export interface CoreStatus {
    core_instance_id: string,
    api_version: string, 
    core_version: string,
    state: CoreState,
    uptime_ms: number
}