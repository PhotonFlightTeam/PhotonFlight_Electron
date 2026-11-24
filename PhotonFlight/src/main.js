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
import { lazConverterOptions, convertLasToLaz } from './lazConverter';
import { coreProtoRoot } from './grpc/client';
import { CoreConnection } from './grpc/coreConnection';
 

const start_plugin_server = async () => {
  await coreSupervisor.startProcess()
}

const coreSupervisor = new CoreSupervisor({
  launch: coreLaunchOptions({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged }),
});

const coreConnection = new CoreConnection({
  supervisor: coreSupervisor,
  protoRoot: coreProtoRoot({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged }),
});

start_plugin_server()

coreConnection.on('status', (status) => {
  if (status.state === 'ready') {
    console.info(`[PhotonCore gRPC] Ready at ${status.host}:${status.port}; API ${status.apiVersion}; instance ${status.coreInstanceId}`);
  } else if (status.state === 'failed') {
   console.error("PhotonCore is not ready!")
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

const lazConverter = lazConverterOptions({
  appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged,
  cacheRoot: app.getPath('userData'),
});

const refreshApplicationMenu = () => setupApplicationMenu(themeMode, {
  databaseMenuEnabled,
  prepareImport: (filePath) => convertLasToLaz(filePath, lazConverter),
});
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
    args = [ '-m', 'uvicorn', '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'];
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
  if (started || quitInProgress || quitAfterCoreStops) return;
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
    setupApplicationMenu();
  });
  
  registerPluginHandlers();
  
  ipcMain.handle('theme:get-mode', () => themeMode);
  ipcMain.handle('theme:set-mode', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return themeMode;
    themeMode = mode;
    setupApplicationMenu(themeMode,databaseMenuEnabled,controlMode);
    return themeMode;
  });
  ipcMain.on('theme-mode-changed', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return;
    themeMode = mode;
    setupApplicationMenu(themeMode, databaseMenuEnabled, controlMode);
  });

  ipcMain.handle('controls:set-mode', (_event, mode) => {
    if (mode !== 'flight' && mode !== 'position') return controlMode;
    controlMode = mode;
    setupApplicationMenu(themeMode, databaseMenuEnabled, controlMode);
    return controlMode;
  });

  setupApplicationMenu(themeMode, databaseMenuEnabled, controlMode);

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
