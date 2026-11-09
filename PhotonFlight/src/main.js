import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import fs from 'node:fs/promises';
import { registerPluginHandlers } from './pluginManager';
import { createClerkBridge } from '@clerk/electron';
import { storage } from '@clerk/electron/storage';
import { spawn } from 'node:child_process'
import { setupApplicationMenu } from './applicationMenu';

let themeMode = 'dark';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const clerk = createClerkBridge({
  storage: storage(),
  renderer: { scheme: 'photonflight', host: 'renderer' },
})

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
    backendPath = path.join(backendDirectory,
      'venv',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'uvicorn.exe' : 'uvicorn');
    args = ['app.main:app', '--host', '127.0.0.1', '--port', '8000'];
  } else {

    backendPath = path.join(process.resourcesPath, 'backend_dist', 'main');
    if (process.platform === 'win32') backendPath += '.exe';
  }

  pythonProcess = spawn(backendPath, args, {
    cwd: isDev ? path.join(app.getAppPath(), 'src', 'backend') : undefined,
    env: { ...process.env }
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

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  
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


  let databaseMenuEnabled = false;
  ipcMain.on('database-menu-enabled', (_event, enabled) => {
    if (typeof enabled !== 'boolean') return;
    
    databaseMenuEnabled = enabled;
    const item = Menu.getApplicationMenu()?.getMenuItemById('database');
    if (item) item.enabled = enabled;
  });

  registerPluginHandlers();

  ipcMain.handle('theme:get-mode', () => themeMode);
  ipcMain.handle('theme:set-mode', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return themeMode;
    themeMode = mode;
    setupApplicationMenu(themeMode, databaseMenuEnabled);
    return themeMode;
  });
  ipcMain.on('theme-mode-changed', (_event, mode) => {
    if (mode !== 'dark' && mode !== 'light') return;
    themeMode = mode;
    setupApplicationMenu(themeMode, databaseMenuEnabled);
  });

  setupApplicationMenu(themeMode, databaseMenuEnabled);

  createWindow();
  startPythonBackend(); // Start the Python backend when the app is ready

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    clerk.cleanup();
    app.quit();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
