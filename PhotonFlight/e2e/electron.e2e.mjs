import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importFile = path.join(projectRoot, 'scans', '3D_Flight_Point.laz');
let forgeProcess;
let profileDirectory;
let browser;
let page;
let inspector;
let forgeOutput = '';
const pageErrors = [];
const alerts = [];

function appendForgeOutput(chunk) {
  forgeOutput = `${forgeOutput}${chunk}`.slice(-12000);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

async function waitForInspector(timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const url = forgeOutput.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/\S+)/)?.[1];
    if (url) return url;
    if (forgeProcess.exitCode !== null || forgeProcess.signalCode !== null) break;
    await delay(100);
  }
  throw new Error(`Electron main-process inspector did not start.\n${forgeOutput}`);
}

async function waitForCdp(port, timeout = 120000) {
  const url = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (forgeProcess.exitCode !== null || forgeProcess.signalCode !== null) break;
    try {
      const response = await fetch(url);
      if (response.ok) return `http://127.0.0.1:${port}`;
    } catch {}
    await delay(100);
  }
  throw new Error(`Electron renderer debugging endpoint did not start.\n${forgeOutput}`);
}

async function findAppPage(timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        try {
          if (await candidate.title() === 'Photon Flight') return candidate;
        } catch {
          // A window can close while Electron is initializing.
        }
      }
    }
    await delay(100);
  }
  throw new Error(`Photon Flight renderer window did not appear.\n${forgeOutput}`);
}

class InspectorClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      pending.resolve(message);
    });
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  async evaluate(expression) {
    const id = ++this.nextId;
    const responsePromise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      },
    }));
    const response = await responsePromise;
    if (response.result.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description
        ?? response.result.exceptionDetails.text);
    }
    return response.result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function invokeMenu(menuLabel, itemLabel, dialogMethod, result) {
  const resultLiteral = JSON.stringify(result);
  const expression = `(async () => {
    const Module = process.getBuiltinModule('module');
    const path = process.getBuiltinModule('path');
    const { BrowserWindow, Menu, dialog } = Module.createRequire(
      path.join(process.cwd(), 'package.json')
    )('electron');
    const window = BrowserWindow.getAllWindows().find(
      candidate => !candidate.webContents.getURL().startsWith('devtools://')
    );
    const menu = Menu.getApplicationMenu().items.find(item => item.label === ${JSON.stringify(menuLabel)});
    const item = menu?.submenu?.items.find(entry => entry.label === ${JSON.stringify(itemLabel)});
    if (!window || !item || typeof item.click !== 'function') {
      throw new Error('Could not find menu item: ${menuLabel} > ${itemLabel}');
    }
    const originalDialog = dialog.${dialogMethod};
    dialog.${dialogMethod} = async () => (${resultLiteral});
    try {
      await item.click(item, window);
    } finally {
      dialog.${dialogMethod} = originalDialog;
    }
  })()`;
  await inspector.evaluate(expression);
}

async function sendRendererEvent(channel) {
  const expression = `(() => {
    const Module = process.getBuiltinModule('module');
    const path = process.getBuiltinModule('path');
    const { BrowserWindow } = Module.createRequire(
      path.join(process.cwd(), 'package.json')
    )('electron');
    const window = BrowserWindow.getAllWindows().find(
      candidate => !candidate.webContents.getURL().startsWith('devtools://')
    );
    if (!window) throw new Error('Photon Flight window is not available.');
    window.webContents.send(${JSON.stringify(channel)});
  })()`;
  await inspector.evaluate(expression);
}

async function waitForFile(filePath, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      return await stat(filePath);
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Expected output file was not written: ${filePath}\nAlerts: ${alerts.join(' | ')}`);
}

before(async () => {
  const remoteDebuggingPort = await reservePort();
  profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'photonflight-e2e-'));
  const forgeCli = path.join(
    projectRoot,
    'node_modules',
    '@electron-forge',
    'cli',
    'dist',
    'electron-forge.js',
  );
  forgeProcess = spawn(process.execPath, [
    forgeCli,
    'start',
    '--inspect-electron',
    '--',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${profileDirectory}`,
    '--enable-unsafe-swiftshader',
  ], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  forgeProcess.stdout.on('data', appendForgeOutput);
  forgeProcess.stderr.on('data', appendForgeOutput);

  inspector = new InspectorClient(await waitForInspector());
  await inspector.connect();
  browser = await chromium.connectOverCDP(await waitForCdp(remoteDebuggingPort));
  page = await findAppPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message());
    await dialog.dismiss();
  });
}, { timeout: 150000 });

after(async () => {
  if (page && !page.isClosed()) await page.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (inspector) inspector.close();
  if (forgeProcess && forgeProcess.exitCode === null) {
    await Promise.race([
      once(forgeProcess, 'exit'),
      delay(10000),
    ]);
    if (forgeProcess.exitCode === null) forgeProcess.kill();
  }
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true });
  }
});

test('Electron guest point-cloud workflow', { timeout: 240000 }, async (t) => {
  await t.test('offers signed-out choices and enters offline mode', async () => {
    await page.getByRole('heading', { name: 'Photon Flight' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Sign In' }).count(), 1);
    await page.getByRole('button', { name: 'Offline Mode' }).click();

    await page.locator('.las-viewer').waitFor();
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Measure' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Pin' }).count(), 1);
  });

  await t.test('changes view color and respects the maximum zoom', async () => {
    const viewSelect = page.getByRole('combobox');
    await viewSelect.click();
    await page.getByRole('option', { name: 'Height' }).click();
    assert.match(await viewSelect.textContent(), /Height/);

    const zoom = page.getByRole('slider', { name: 'Camera Zoom' });
    await page.getByText('+', { exact: true }).click();
    await page.getByText('+', { exact: true }).click();
    await page.getByText('+', { exact: true }).click();
    assert.equal(await zoom.getAttribute('aria-valuenow'), '200');
  });

  await t.test('opens and closes the plugin sidebar from the native menu', async () => {
    await invokeMenu('Plugins', 'Library');
    await page.getByText('PLUGINS', { exact: true }).waitFor();
    assert.equal(await page.getByText('No plugins installed.').count(), 1);
    await page.getByRole('button', { name: 'Close plugins panel' }).click();
    await page.getByText('PLUGINS', { exact: true }).waitFor({ state: 'detached' });
  });

  await t.test('imports LAZ and exports a valid uncompressed LAS file', async () => {
    await invokeMenu('File', 'Import', 'showOpenDialog', {
      canceled: false,
      filePaths: [importFile],
    });
    await sendRendererEvent('open-database-browser');
    const databaseDialog = page.getByRole('dialog', { name: 'Lidar Database' });
    await databaseDialog.getByText('3D_Flight_Point.laz').waitFor();
    await databaseDialog.getByRole('button', { name: 'Close' }).click();

    const exportPath = path.join(profileDirectory, 'roundtrip.las');
    await invokeMenu('File', 'Export', 'showSaveDialog', {
      canceled: false,
      filePath: exportPath,
    });
    await waitForFile(exportPath);

    const exported = await readFile(exportPath);
    assert.equal(exported.toString('ascii', 0, 4), 'LASF');
    assert.equal(exported.readUInt8(24), 1);
    assert.equal(exported.readUInt8(25), 2);
    assert.equal(exported.readUInt8(104) & 0xc0, 0);
    assert.ok(exported.readUInt32LE(107) > 0);
  });

  await t.test('does not raise uncaught renderer errors during the workflow', () => {
    assert.deepEqual(pageErrors, []);
  });
});
