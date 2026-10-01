// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Remove listeners on cleanup
  onFileImported: (callback) => { const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('file-imported', handler);
    return () => ipcRenderer.removeListener('file-imported', handler);
  },
  onFileExported: (callback) => { const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('file-exported', handler);
    return () => ipcRenderer.removeListener('file-exported', handler);
  },
  // Request file system operations from main.js
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data)
});
