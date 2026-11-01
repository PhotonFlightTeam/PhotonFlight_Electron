import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import fs from 'node:fs/promises';
import { registerPluginHandlers } from './pluginManager';
import { createClerkBridge } from '@clerk/electron';
import { storage } from '@clerk/electron/storage';
import { CoreSupervisor, coreLaunchOptions } from './coreSupervisor';

const coreSupervisor = new CoreSupervisor({
  launch: coreLaunchOptions({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged }),
});

coreSupervisor.on('status', (status) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('core:status-changed', status);
  }
});
coreSupervisor.on('log', ({ stream, text }) => {
  (stream === 'stderr' ? console.error : console.log)(`[PhotonCore] ${text.trimEnd()}`);
});

let quitAfterCoreStops = false;
app.on('before-quit', (event) => {
  if (quitAfterCoreStops) return;
  event.preventDefault();
  coreSupervisor.dispose().then(() => {
    clerk.cleanup();
    quitAfterCoreStops = true;
    app.quit();
  }).catch((error) => {
    console.error('Failed to stop PhotonCore:', error);
    dialog.showErrorBox('PhotonCore could not stop', error.message);
  });
});


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
  const assertCoreSender = (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Core controls are only available to an application window.');
    }
  };
  ipcMain.handle('core:get-status', (event) => {
    assertCoreSender(event);
    return coreSupervisor.getStatus();
  });
  for (const action of ['start', 'stop', 'restart']) {
    ipcMain.handle(`core:${action}`, (event) => {
      assertCoreSender(event);
      return coreSupervisor[action]();
    });
  }
  
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

  registerPluginHandlers();

  const template = [
    {
      label: 'Core',
      submenu: ['start', 'stop', 'restart'].map((action) => ({
        label: `${action[0].toUpperCase()}${action.slice(1)} PhotonCore`,
        click: () => coreSupervisor[action]().catch((error) => {
          dialog.showErrorBox('PhotonCore process error', error.message);
        }),
      })),
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Import',
          click: async (menuItem, browserWindow) => {
            if (!browserWindow) return;
            const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'LAS/LAZ Files', extensions: ['las', 'laz'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!canceled && filePaths.length > 0) {
              // Send the selected file path to the renderer process
              browserWindow.webContents.send('file-imported', filePaths[0]);
            }
          }
        },
        {
          label: 'Export',
          click: async (menuItem, browserWindow) => {
            if (!browserWindow) return;
            const { canceled, filePath } = await dialog.showSaveDialog(browserWindow, {
              filters: [
                { name: 'LAS File', extensions: ['las'] },
                { name: 'LAZ File', extensions: ['laz'] }
              ]
            });
            if (!canceled && filePath) {
              // TODO: Send the destination path to the renderer process to handle saving
              browserWindow.webContents.send('file-exported', filePath);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },

    {
      label: 'Plugins',
      submenu: [
        {
          label: 'Library',
          click: (menuItem, browserWindow) => {
            browserWindow?.webContents.send('open-plugin-library');
          }
        },
        {
          label: 'Import...',
          click: async (menuItem, browserWindow) => {
            if (!browserWindow) return;
            try {
              const id = await importPlugins(browserWindow);
              if (id) {
                // Refresh the library and show it so user sees the new plugin
                browserWindow.webContents.send('plugins-changed');
                browserWindow.webContents.send('open-plugin-library');
              }
            } catch (error) {
              dialog.showErrorBox('Plugin import failed', error.message);
            }
          }
        }
      ]
    },

    {
      label: 'Account',
      submenu: [
        {
          label: 'Sign Out',
          click: (menuItem, browserWindow) => {
            // Optionally, you can also refresh the renderer to reflect the sign-out state
            browserWindow?.webContents.send('user-signed-out');
          }
        }
      ] 

    },
    {
      label: 'Options', 
      submenu: [
        {
          label: 'Settings',
          click: (menuItem, browserWindow) => {
            // Optionally, you can also refresh the renderer to reflect the sign-out state
            browserWindow?.webContents.send('settings-opened');
          }
        }
      ]
    }
    // TODO: other menus (Edit, View, Window, etc.)
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();
  if (!started) coreSupervisor.start().catch((error) => {
    console.error('PhotonCore startup failed:', error);
    dialog.showErrorBox('PhotonCore startup failed', `${error.message}\n\nBuild Core with gradlew.bat installDist or set PHOTON_CORE_HOME to an installed distribution.`);
  });

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
    app.quit();
  }
});
