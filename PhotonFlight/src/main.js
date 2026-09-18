import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import fs from 'node:fs/promises';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
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

  const template = [
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
              // Send the destination path to the renderer process to handle saving
              browserWindow.webContents.send('file-exported', filePath);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    // TODO: other menus (Edit, View, Window, etc.)
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();

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
