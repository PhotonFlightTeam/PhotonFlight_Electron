import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';

const CORE_HOST = '127.0.0.1';

export function probeCorePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen({ host: CORE_HOST, port: 0, exclusive: true }, () => {
      const { port } = probe.address();
      // Release the listener so the JVM can bind the selected port. Another process
      // can claim it during this window; readiness must still be checked over gRPC.
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

export function coreLaunchOptions({ appPath, resourcesPath, isPackaged, env = process.env }) {
  const jar = isPackaged
    ? path.join(resourcesPath, 'core', 'photoncore.jar')
    : path.join(appPath, 'resources', 'core', 'photoncore.jar');
  const java = env.PHOTON_CORE_JAVA || (env.JAVA_HOME
    ? path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : 'java');
  const args = ['-jar', jar];
  return {
    command: java,
    args,
    cwd: path.dirname(jar),
    validate: async () => {
      try { await access(jar); }
      catch { throw new Error(`Bundled PhotonCore JAR is missing: ${jar}. Run npm run prepare:core or rebuild the application.`); }
    },
    prepare: async () => {
      const port = await probeCorePort();
      return { args: [...args, `PHOTON_CORE_PORT=${port}`], host: CORE_HOST, port };
    },
  };
}

export class CoreSupervisor extends EventEmitter {
  constructor({ launch, spawnProcess = spawn, stopTimeoutMs = 5000, killTimeoutMs = 5000 }) {
    super();
    this.launch = launch;
    this.spawnProcess = spawnProcess;
    this.stopTimeoutMs = stopTimeoutMs;
    this.killTimeoutMs = killTimeoutMs;
    this.child = null;
    this.closed = null;
    this.queue = Promise.resolve();
    this.disposed = false;
    this.status = { state: 'stopped', pid: null, host: null, port: null, generation: 0, exitCode: null, signal: null, error: null };
  }

  getStatus() { return { ...this.status }; }

  update(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.getStatus());
  }

  enqueue(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }

  start() {
    return this.enqueue(() => this.startProcess());
  }

  stop() {
    return this.enqueue(() => this.stopProcess());
  }

  restart() {
    return this.enqueue(async () => {
      await this.stopProcess();
      return this.startProcess();
    });
  }

  dispose() {
    this.disposed = true;
    return this.stop();
  }

  async startProcess() {
    if (this.disposed) throw new Error('PhotonCore supervisor is shutting down.');
    if (this.child) return this.getStatus();
    this.update({ state: 'starting', pid: null, host: null, port: null, generation: this.status.generation + 1,
      exitCode: null, signal: null, error: null });
    try {
      await this.launch.validate?.();
      const prepared = await this.launch.prepare?.();
      if (this.disposed) throw new Error('PhotonCore supervisor is shutting down.');
      this.update({ host: prepared?.host ?? null, port: prepared?.port ?? null });
      const child = this.spawnProcess(this.launch.command, prepared?.args ?? this.launch.args, {
        cwd: this.launch.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.child = child;
      let processError = null;
      this.closed = new Promise((resolve) => {
        child.once('close', (exitCode, signal) => {
          const expected = this.status.state === 'stopping';
          this.child = null;
          this.update({ state: expected && !processError ? 'stopped' : 'failed', pid: null, host: null, port: null,
            exitCode, signal, error: processError?.message || (expected ? null : 'PhotonCore exited unexpectedly.') });
          resolve();
        });
      });
      child.on('error', (error) => {
        processError = error;
        this.update({ state: 'failed', error: error.message });
      });
      // Keep draining both pipes, including when there is no log subscriber.
      child.stdout?.on('data', (data) => this.emit('log', { stream: 'stdout', text: data.toString() }));
      child.stderr?.on('data', (data) => this.emit('log', { stream: 'stderr', text: data.toString() }));
      await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      this.update({ state: 'running', pid: child.pid });
      return this.getStatus();
    } catch (error) {
      // A failed spawn can emit close after error; drain it before another launch.
      if (this.child) await this.closed;
      this.update({ state: 'failed', pid: null, host: null, port: null, error: error.message });
      throw error;
    }
  }

  async waitForClose(timeoutMs) {
    let timer;
    try {
      return await Promise.race([
        this.closed.then(() => true),
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async stopProcess() {
    if (!this.child) return this.getStatus();
    const child = this.child;
    this.update({ state: 'stopping' });
    // Until Shutdown RPC exists, using OS termination
    child.kill('SIGTERM');
    if (!await this.waitForClose(this.stopTimeoutMs)) {
      child.kill('SIGKILL');
      if (!await this.waitForClose(this.killTimeoutMs)) {
        const error = 'PhotonCore did not exit after forced termination.';
        this.update({ state: 'failed', error });
        throw new Error(error);
      }
    }
    return this.getStatus();
  }
}
