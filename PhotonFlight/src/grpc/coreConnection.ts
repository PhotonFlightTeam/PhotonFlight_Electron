import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { createCoreRpcClient, SUPPORTED_CORE_API_VERSION, type CoreRpcClient } from './client';
import type { CoreStatus__Output } from './generated/photonflight/application/v1/CoreStatus';

interface ProcessStatus {
  state: string;
  generation: number;
  host: string | null;
  port: number | null;
  error: string | null;
}

interface Supervisor extends EventEmitter { getStatus(): ProcessStatus; }

export interface ConnectionStatus {
  state: 'disconnected' | 'connecting' | 'ready' | 'failed';
  generation: number;
  host: string | null;
  port: number | null;
  coreInstanceId: string | null;
  apiVersion: string | null;
  coreVersion: string | null;
  error: string | null;
}

interface Announcement {
  type: 'photoncore.grpc.ready';
  host: string;
  port: number;
  core_instance_id: string;
  api_version: string;
}

/** Owns typed clients and their startup handshake. Process status remains separate. */
export class CoreConnection extends EventEmitter {
  private readonly supervisor: Supervisor;
  private readonly protoRoot: string;
  private readonly startupTimeoutMs: number;
  private readonly rpcTimeoutMs: number;
  private readonly supportedApiVersion: string;
  private attempt?: AbortController;
  private client?: CoreRpcClient;
  private announcement?: Announcement;
  private stdout = '';
  private disposed = false;
  private status: ConnectionStatus = {
    state: 'disconnected', generation: 0, host: null, port: null,
    coreInstanceId: null, apiVersion: null, coreVersion: null, error: null,
  };

  constructor({ supervisor, protoRoot, startupTimeoutMs = 30_000, rpcTimeoutMs = 2000,
    supportedApiVersion = SUPPORTED_CORE_API_VERSION }: {
    supervisor: Supervisor; protoRoot: string; startupTimeoutMs?: number;
    rpcTimeoutMs?: number; supportedApiVersion?: string;
  }) {
    super();
    this.supervisor = supervisor;
    this.protoRoot = protoRoot;
    this.startupTimeoutMs = startupTimeoutMs;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.supportedApiVersion = supportedApiVersion;
    supervisor.on('status', this.onProcessStatus);
    supervisor.on('log', this.onLog);
    this.onProcessStatus(supervisor.getStatus());
  }

  getProcessStatus(): ProcessStatus { return this.supervisor.getStatus(); }
  getConnectionStatus(): ConnectionStatus { return { ...this.status }; }

  getClients(): CoreRpcClient {
    if (this.status.state !== 'ready' || !this.client) throw new Error('PhotonCore gRPC is not ready');
    return this.client;
  }

  async getCoreStatus(): Promise<CoreStatus__Output> {
    const client = this.getClients();
    const attempt = this.attempt!;
    const result = await client.getStatus(new Date(Date.now() + this.rpcTimeoutMs), attempt.signal);
    if (this.attempt !== attempt || attempt.signal.aborted) throw new Error('Core session changed during GetStatus');
    try { this.validateIdentity(result); }
    catch (error) { this.fail(error); throw error; }
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.supervisor.off('status', this.onProcessStatus);
    this.supervisor.off('log', this.onLog);
    this.reset();
    this.update({ state: 'disconnected', host: null, port: null, error: null });
  }

  private update(patch: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getConnectionStatus());
  }

  private reset(): void {
    this.attempt?.abort(new Error('Core connection superseded or closed'));
    this.attempt = undefined;
    this.client?.close();
    this.client = undefined;
    this.announcement = undefined;
    this.stdout = '';
    this.status = { ...this.status, coreInstanceId: null, apiVersion: null, coreVersion: null };
  }

  private fail(error: unknown): void {
    this.reset();
    this.update({ state: 'failed', error: error instanceof Error ? error.message : String(error) });
  }

  private readonly onProcessStatus = (process: ProcessStatus): void => {
    if (this.disposed) return;
    if (process.generation !== this.status.generation) {
      this.reset();
      this.update({ generation: process.generation, state: 'connecting', error: null });
    }
    if (process.state !== 'starting' && process.state !== 'running') {
      this.reset();
      this.update({ state: process.state === 'failed' ? 'failed' : 'disconnected',
        host: null, port: null, error: process.error });
      return;
    }
    this.update({ host: process.host, port: process.port });
    if (process.state !== 'running' || this.attempt || this.status.state === 'failed') return;
    const attempt = new AbortController();
    this.attempt = attempt;
    void this.connect(process, attempt).catch(error => {
      if (this.attempt === attempt && !attempt.signal.aborted) this.fail(error);
    });
  };

  private readonly onLog = ({ stream, text }: { stream: string; text: string }): void => {
    if (stream !== 'stdout' || this.disposed || this.status.state !== 'connecting') return;
    this.stdout += text;
    let end;
    while ((end = this.stdout.indexOf('\n')) >= 0) {
      const line = this.stdout.slice(0, end).trim();
      this.stdout = this.stdout.slice(end + 1);
      if (line.length > 16_384 || !line.startsWith('{')) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message?.type !== 'photoncore.grpc.ready') continue;
      if (message.host !== this.status.host || message.port !== this.status.port
          || typeof message.core_instance_id !== 'string' || !message.core_instance_id.trim()
          || message.api_version !== this.supportedApiVersion) {
        this.fail(new Error('Core readiness announcement has an incompatible API, identity, or endpoint'));
        return;
      }
      this.announcement = message;
    }
    // Ignore oversized non-protocol log lines without retaining unbounded output.
    if (this.stdout.length > 16_384) this.stdout = '';
  };

  private validateIdentity(status: CoreStatus__Output): void {
    if (status.api_version !== this.supportedApiVersion) throw new Error(
      `Unsupported Core API version ${JSON.stringify(status.api_version)}; expected ${this.supportedApiVersion}`);
    if (!status.core_instance_id.trim()) throw new Error('Core did not return an instance ID');
    if (this.announcement && status.core_instance_id !== this.announcement.core_instance_id) {
      throw new Error('gRPC instance ID does not match the launched Core process');
    }
  }

  private async connect(process: ProcessStatus, attempt: AbortController): Promise<void> {
    if (!process.host || !process.port) throw new Error('Core supervisor did not provide an endpoint');
    const deadline = Date.now() + this.startupTimeoutMs;
    const client = createCoreRpcClient({ host: process.host, port: process.port, protoRoot: this.protoRoot });
    this.client = client;
    await client.waitForReady(new Date(deadline));
    while (!attempt.signal.aborted && this.attempt === attempt && Date.now() < deadline) {
      let result: CoreStatus__Output;
      try {
        result = await client.getStatus(new Date(Math.min(deadline, Date.now() + this.rpcTimeoutMs)), attempt.signal);
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== GrpcStatus.UNAVAILABLE && code !== GrpcStatus.DEADLINE_EXCEEDED) throw error;
        await delay(100, undefined, { signal: attempt.signal });
        continue;
      }
      if (attempt.signal.aborted || this.attempt !== attempt) return;
      this.validateIdentity(result);
      if (result.state === 'CORE_STATE_ERROR' || result.state === 'CORE_STATE_SHUTTING_DOWN') {
        throw new Error(`Core cannot accept a connection in state ${result.state}`);
      }
      // The port is selected by JS; the stdout line verifies which child owns it.
      if (result.state === 'CORE_STATE_READY' && this.announcement) {
        this.update({ state: 'ready', coreInstanceId: result.core_instance_id,
          apiVersion: result.api_version, coreVersion: result.core_version, error: null });
        return;
      }
      await delay(100, undefined, { signal: attempt.signal });
    }
    if (!attempt.signal.aborted) throw new Error('Timed out waiting for Core readiness and process identity');
  }
}
