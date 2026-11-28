import { EventEmitter } from 'node:events';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { CoreRpcClient } from './client';
import type { ConnectionStatus } from './coreConnection';
import type { Event } from './types/application/app-types';

interface Connection extends EventEmitter {
  getConnectionStatus(): ConnectionStatus;
  getClients(): Promise<CoreRpcClient>;
}

type EventStream = ReturnType<CoreRpcClient['subscribeEvents']>;

/**
 * Keeps one SubscribeEvents stream open for each ready Core session and re-emits its events as
 * `event`. Every stream starts with a CoreSnapshot, so a listener that applies the snapshot and
 * then the live events always has Core's current state, including after a reconnection or `resync()`.
 * The stream closes when Core stops and reopens when the next session is ready.
 */
export class CoreEventBridge extends EventEmitter {
  private readonly connection: Connection;
  private readonly retryDelayMs: number;
  private stream?: EventStream;
  private session = 0;
  private retry?: NodeJS.Timeout;
  private disposed = false;

  constructor({ connection, retryDelayMs = 500 }: { connection: Connection; retryDelayMs?: number }) {
    super();
    this.connection = connection;
    this.retryDelayMs = retryDelayMs;
    connection.on('status', this.onStatus);
    this.onStatus(connection.getConnectionStatus());
  }

  /** Reopens the stream so listeners receive a fresh snapshot (e.g., after the window reloads). */
  resync(): void {
    if (this.disposed || this.connection.getConnectionStatus().state !== 'ready') return;
    this.open();
  }

  dispose(): void {
    this.disposed = true;
    this.connection.off('status', this.onStatus);
    this.close();
  }

  private readonly onStatus = (status: ConnectionStatus): void => {
    if (this.disposed) return;
    if (status.state === 'ready') {
      if (!this.stream) this.open();
    } else {
      this.close();
    }
  };

  private close(): void {
    this.session++;
    clearTimeout(this.retry);
    this.retry = undefined;
    const stream = this.stream;
    this.stream = undefined;
    stream?.cancel();
  }

  private open(): void {
    this.close();
    const session = this.session;
    this.connection.getClients().then((client) => {
      if (session !== this.session || this.disposed) return;
      const stream = client.subscribeEvents(true);
      this.stream = stream;
      const current = () => session === this.session && this.stream === stream;

      stream.on('data', (event: Event) => {
        if (current()) this.emit('event', event);
      });
      stream.on('error', (error: { code?: number; message?: string }) => {
        if (!current()) return;
        if (error.code !== GrpcStatus.CANCELLED) {
          console.error('[PhotonCore events] Stream failed; reconnecting:', error.message);
        }
        this.scheduleReopen(session);
      });
      stream.on('end', () => {
        if (current()) this.scheduleReopen(session);
      });
    }).catch((error) => {
      // Core went away before the stream opened; the next ready status reopens it.
      if (session === this.session && !this.disposed) {
        console.error('[PhotonCore events] Could not subscribe:', error instanceof Error ? error.message : error);
      }
    });
  }

  private scheduleReopen(session: number): void {
    this.stream = undefined;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => {
      if (session !== this.session || this.disposed) return;
      if (this.connection.getConnectionStatus().state === 'ready') this.open();
    }, this.retryDelayMs);
  }
}
