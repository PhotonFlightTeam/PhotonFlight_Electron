// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { exposeClerkBridge } from '@clerk/electron/preload';

exposeClerkBridge()

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
  onSignOutRequested: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('user-signed-out', handler);
    return () => ipcRenderer.removeListener('user-signed-out', handler);
  },
  onSettingsOpened: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('settings-opened', handler);
    return () => ipcRenderer.removeListener('settings-opened', handler);
  },
  onThemeModeChanged: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('theme-mode-changed', handler);
    return () => ipcRenderer.removeListener('theme-mode-changed', handler);
  },
  getThemeMode: () => ipcRenderer.invoke('theme:get-mode'),
  setThemeMode: (mode) => ipcRenderer.invoke('theme:set-mode', mode),
  setDatabaseMenuEnabled: (enabled) => ipcRenderer.send('database-menu-enabled', enabled),
  onOpenDatabaseBrowser: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-database-browser', handler);
    return () => ipcRenderer.removeListener('open-database-browser', handler);
  },
  // Request file system operations from main.js
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
  // Plugin menu events

  onOpenPluginLibrary: (callback) => { const handler = () => callback();
    ipcRenderer.on('open-plugin-library', handler);
    return () => ipcRenderer.removeListener('open-plugin-library', handler);
  },
  onPluginsChanged: (callback) => { const handler = () => callback();
  ipcRenderer.on('plugins-changed', handler);
  return () => ipcRenderer.removeListener('plugins-changed', handler);
},

// Plugin management (check pluginManager.js for details)
listPlugins: () => ipcRenderer.invoke('plugins:list'), 
importPlugin: () => ipcRenderer.invoke('plugins:import'),
removePlugin:(id) => ipcRenderer.invoke('plugins:remove', id),
setPluginEnabled: (id, enabled) => ipcRenderer.invoke('plugins:set-enabled', id, enabled)});