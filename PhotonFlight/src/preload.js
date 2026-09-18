// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Listen for menu clicks
  onFileImported: (callback) => ipcRenderer.on('file-imported', (_event, filePath) => callback(filePath)),
  onFileExported: (callback) => ipcRenderer.on('file-exported', (_event, filePath) => callback(filePath)),
  
  // Request file system operations from main.js
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data)
});
