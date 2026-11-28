import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { registerPluginHandlers } from './pluginManager';
import { createClerkBridge } from '@clerk/electron';
import { storage } from '@clerk/electron/storage';
import { CoreSupervisor, coreLaunchOptions } from './coreSupervisor';
import { spawn } from 'node:child_process';
import { setupApplicationMenu } from './applicationMenu';
import { coreProtoRoot } from './grpc/client';
import { CoreConnection } from './grpc/coreConnection';
import { CoreEventBridge } from './grpc/coreEvents';
import { loadDataset, streamDataset } from './datasetStreams';
 

const coreSupervisor = new CoreSupervisor({
  launch: coreLaunchOptions({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged }),
});

const coreConnection = new CoreConnection({
  supervisor: coreSupervisor,
  protoRoot: coreProtoRoot({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged }),
});

coreConnection.on('status', (status) => {
  if (status.state === 'ready') {
    console.info(`[PhotonCore gRPC] Ready at ${status.host}:${status.port}; API ${status.apiVersion}; instance ${status.coreInstanceId}`);
  } else if (status.state === 'failed') {
   console.error("PhotonCore is not ready!")
  }
}); 

// One long-lived SubscribeEvents stream per Core session; each (re)open starts with a snapshot.
const coreEvents = new CoreEventBridge({ connection: coreConnection });
coreEvents.on('event', (coreEvent) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('core:event', coreEvent);
  }
});

coreSupervisor.on('status', (status) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('core:status-changed', status);
  }
});

coreSupervisor.on('log', ({ stream, text }) => {
  (stream === 'stderr' ? console.error : console.log)(`[PhotonCore] ${text.trimEnd()}`);
});



let themeMode = 'dark';
let databaseMenuEnabled = false;

const refreshApplicationMenu = () => setupApplicationMenu(themeMode, {
  databaseMenuEnabled,
}, controlMode);
let controlMode = 'position';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const clerk = createClerkBridge({
  storage: storage(),
  renderer: { scheme: 'photonflight', host: 'renderer' },
});

let quitAfterCoreStops = false;
let quitInProgress = false;
app.on('before-quit', (event) => {
  if (quitAfterCoreStops || started) return;
  event.preventDefault();
  if (quitInProgress) return;
  quitInProgress = true;
  coreEvents.dispose();
  coreConnection.dispose();
  coreSupervisor.dispose().then(() => {
    clerk.cleanup();
    quitAfterCoreStops = true;
    console.log("PhotonCore has successfully stopped")
    app.quit();
  }).catch((error) => {
    quitInProgress = false;
    console.error('Failed to stop PhotonCore:', error);
    dialog.showErrorBox('PhotonCore could not stop', error.message);
  });
});

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('photonflight', process.execPath, [path.resolve(process.argv[1])]);
}


let pythonProcess = null;
const isDev = !app.isPackaged;

if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland') {
  app.commandLine.appendSwitch('disable-vulkan');
}

const startPythonBackend = () => {
  let backendPath;
  let args = [];
  
  if (isDev) {
    const backendDirectory = path.join(app.getAppPath(),
    'src',
    'backend');
    const executableDirectory = process.platform === 'win32' ? 'Scripts' : 'bin';
    const executableName = process.platform === 'win32' ? 'python.exe' : 'python';
    const virtualEnvironment = ['venv', '.venv']
    .map((directory) => path.join(backendDirectory, directory))
    .find((directory) => existsSync(path.join(directory, executableDirectory, executableName)))
    ?? path.join(backendDirectory, 'venv');
    backendPath = path.join(virtualEnvironment, executableDirectory, executableName);
    args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'];
  } else {
    
    const backendExecutable = process.platform === 'win32' ? 'main.exe' : 'main';
    backendPath = path.join(process.resourcesPath, 'run', backendExecutable);
  }
  
  pythonProcess = spawn(backendPath, args, {
    cwd: isDev ? path.join(app.getAppPath(), 'src', 'backend') : undefined,
    env: { ...process.env },
    windowsHide: true,
    shell: false
  });
  
  const child = pythonProcess;
  child.on('close', () => {
    if (pythonProcess === child) pythonProcess = null;
  });
  
  pythonProcess.on('error', (error) => {
    console.error(`Failed to start Python backend at ${backendPath}:`, error);
  });
  
  // Log backend outputs to Electron's terminal
  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Python Stdout]: ${data}`);
  });
  
  pythonProcess.stderr.on('data', (data) => {
    console.error(`[Python Stderr]: ${data}`);
  });
}


const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`[Renderer:${event.level}] ${event.message}`);
  });
  
  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  
  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};
 // shutdown grpc server

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  if (!clerk.isPrimaryInstance || started || quitInProgress || quitAfterCoreStops) return;
  const assertCoreSender = (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Core controls are only available to an application window.');
    }
  };
  ipcMain.handle('core:get-status', (event) => {
    assertCoreSender(event);
    return coreConnection.getProcessStatus();
  });
  for (const action of ['start', 'stop', 'restart']) {
    ipcMain.handle(`core:${action}`, (event) => {
      assertCoreSender(event);
      return coreSupervisor[action]();
    });
  }
  // Unary Core RPCs: sender-checked, waits for the gRPC client, rejects on bad input.
  const isRequest = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isId = (value) => typeof value === 'string' && value.length > 0;
  const handleCore = (channel, validate, call) => {
    ipcMain.handle(channel, async (event, arg) => {
      assertCoreSender(event);
      if (!validate(arg)) throw new Error(`Invalid argument for ${channel}.`);
      return call(await coreConnection.getClients(), arg);
    });
  };
  handleCore('core:load-dataset', isId, (client, filePath) => client.loadDataSet(filePath));
  handleCore('core:unload-dataset', isId, (client, datasetId) => client.unloadDataset(datasetId));
  handleCore('core:execute-command', isRequest, (client, command) => client.executeCommand(command));
  handleCore('core:get-operation', isRequest, (client, request) => client.getOperation(request));
  handleCore('core:get-dataset', isRequest, (client, request) => client.getDataSet(request));
  handleCore('core:get-annotations', isRequest, (client, request) => client.getAnnotations(request));
  // The renderer calls this after attaching its listener to get a snapshot, then live events.
  ipcMain.handle('core:resync-events', (event) => {
    assertCoreSender(event);
    coreEvents.resync();
  });
  handleCore('core:list-processors', () => true, (client) => client.listProcessors());
  handleCore('core:cancel-operation', isId, (client, operationId) => client.cancelOperation(operationId));
  const isRevision = (value) => typeof value === 'string' && /^\d+$/.test(value);
  const isParameters = (value) => value === undefined
    || (isRequest(value) && Object.values(value).every((entry) => typeof entry === 'string'));
  handleCore('core:run-processor',
    (request) => isRequest(request) && isId(request.processorId) && isId(request.datasetId)
      && isRevision(request.expectedRevision) && isParameters(request.parameters),
    (client, { processorId, datasetId, expectedRevision, parameters }) =>
      client.runProcessor({ processorId, datasetId, expectedRevision, parameters }));

  // One point stream at a time: starting another (or core:cancel-point-stream) aborts the active one.
  // Every message to the renderer carries the streamId the starting call resolves with.
  let nextStreamId = 0;
  let activePointStream = null;

  ipcMain.handle('core:cancel-point-stream', (event) => {
    assertCoreSender(event);
    activePointStream?.abort();
  });

  const runPointStream = async (event, produce) => {
    activePointStream?.abort();
    const controller = new AbortController();
    activePointStream = controller;
    const streamId = ++nextStreamId;
    const send = (channel, payload) => {
      if (controller.signal.aborted) return;
      // A closed window can't receive the rest, so stop pulling points from Core.
      if (event.sender.isDestroyed()) controller.abort();
      else event.sender.send(channel, { streamId, ...payload });
    };
    try {
      const client = await coreConnection.getClients();
      if (controller.signal.aborted) return null;
      const dataset = await produce(client, controller.signal);
      if (!dataset || controller.signal.aborted) return null;
      await streamDataset({ client, dataset, send, signal: controller.signal });
      return controller.signal.aborted ? null : { streamId, dataset };
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return null;
      throw error;
    } finally {
      if (activePointStream === controller) activePointStream = null;
    }
  };

  // Imports a file into Core, then streams the loaded revision.
  ipcMain.handle('core:load-dataset-stream', (event, filePath) => {
    assertCoreSender(event);
    if (!isId(filePath)) throw new Error('Invalid argument for core:load-dataset-stream.');
    return runPointStream(event, (client, signal) => loadDataset({ client, events: coreEvents, filePath, signal }));
  });

  // Streams a revision of a dataset that Core already holds, e.g., after DatasetChanged.
  ipcMain.handle('core:stream-dataset', (event, request) => {
    assertCoreSender(event);
    if (!isRequest(request) || !isId(request.datasetId) || !isRevision(request.revision)) {
      throw new Error('Invalid argument for core:stream-dataset.');
    }
    return runPointStream(event, async (client) => {
      const dataset = await client.getDataSet({ dataset_id: request.datasetId });
      if (dataset.revision !== request.revision) {
        throw new Error(`Dataset revision ${request.revision} is no longer current (now ${dataset.revision}).`);
      }
      return dataset;
    });
  });
  
  // Setup File System IPC handlers for Read/Write Processes
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      console.error("Failed to read file:", error);
      return null;
    }
  });
  
  ipcMain.handle('save-file', async (event, filePath, data) => {
    try {
      await fs.writeFile(filePath, data);
      return true;
    } catch (error) {
      console.error("Failed to save file:", error);
      return false;
    }
  });
  
  
  ipcMain.on('database-menu-enabled', (_event, enabled) => {
    if (typeof enabled !== 'boolean') return;
    
    databaseMenuEnabled = enabled;
    refreshApplicationMenu();
  });
  
  registerPluginHandlers();
  
  ipcMain.handle('theme:get-mode', () => themeMode);
  ipcMain.handle('theme:set-mode', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return themeMode;
    themeMode = mode;
    refreshApplicationMenu();
    return themeMode;
  });
  ipcMain.on('theme-mode-changed', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return;
    themeMode = mode;
    refreshApplicationMenu();
  });

  ipcMain.handle('controls:set-mode', (_event, mode) => {
    if (mode !== 'flight' && mode !== 'position') return controlMode;
    controlMode = mode;
    refreshApplicationMenu();
    return controlMode;
  });

  refreshApplicationMenu();

  createWindow();
  startPythonBackend(); // Start the Python backend when the app is ready
  if (!started) coreSupervisor.start().catch((error) => {
    console.error('PhotonCore startup failed:', error);
    dialog.showErrorBox('PhotonCore startup failed', `${error.message}\n\nCore launches from the bundled JAR. Check that Java 21 is available and the Core asset was prepared.`);
  });
  
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error('Application startup failed:', error);
  dialog.showErrorBox('Application startup failed', error.message);
  app.quit();
});



// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
