// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { exposeClerkBridge } from '@clerk/electron/preload';

exposeClerkBridge()

const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  core: {
    getStatus: () => ipcRenderer.invoke('core:get-status'),
    start: () => ipcRenderer.invoke('core:start'),
    stop: () => ipcRenderer.invoke('core:stop'),
    restart: () => ipcRenderer.invoke('core:restart'),
    loadDataSet: (filePath) => ipcRenderer.invoke('core:load-dataset', filePath),
    loadDatasetStream: (filePath) => ipcRenderer.invoke('core:load-dataset-stream', filePath),
    // { datasetId, revision (decimal string) }; streams that revision over the point-stream events
    streamDataset: (request) => ipcRenderer.invoke('core:stream-dataset', request),
    cancelPointStream: () => ipcRenderer.invoke('core:cancel-point-stream'),
    unloadDataset: (datasetId) => ipcRenderer.invoke('core:unload-dataset', datasetId),
    executeCommand: (command) => ipcRenderer.invoke('core:execute-command', command),
    getOperation: (request) => ipcRenderer.invoke('core:get-operation', request),
    getDataSet: (request) => ipcRenderer.invoke('core:get-dataset', request),
    getAnnotations: (request) => ipcRenderer.invoke('core:get-annotations', request),
    listProcessors: () => ipcRenderer.invoke('core:list-processors'),
    runProcessor: (request) => ipcRenderer.invoke('core:run-processor', request),
    cancelOperation: (operationId) => ipcRenderer.invoke('core:cancel-operation', operationId),
    onPointStreamStart: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('core:point-stream-start', handler);
      return () => ipcRenderer.removeListener('core:point-stream-start', handler);
    },
    onPointBatch: (callback) => {
      const handler = (_event, batch) => callback(batch);
      ipcRenderer.on('core:point-batch', handler);
      return () => ipcRenderer.removeListener('core:point-batch', handler);
    },
    onPointStreamEnd: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('core:point-stream-end', handler);
      return () => ipcRenderer.removeListener('core:point-stream-end', handler);
    },
    onPointStreamError: (callback) => {
      const handler = (_event, err) => callback(err);
      ipcRenderer.on('core:point-stream-error', handler);
      return () => ipcRenderer.removeListener('core:point-stream-error', handler);
    },
    // Core events (CoreSnapshot first, then live events). Resubscribing gives a fresh snapshot,
    // so listeners can rebuild their state from scratch. Returns an unsubscribe function.
    subscribeEvents: (callback) => {
      const handler = (_event, coreEvent) => callback(coreEvent);
      ipcRenderer.on('core:event', handler);
      ipcRenderer.invoke('core:resync-events').catch(() => {});
      return () => ipcRenderer.removeListener('core:event', handler);
    },
    onStatusChanged: (callback) => {
      const handler = (_event, status) => callback(status);
      ipcRenderer.on('core:status-changed', handler);
      return () => ipcRenderer.removeListener('core:status-changed', handler);
    },
  },
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
  onControlModeChanged: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on('control-mode-changed', handler);
    return () => ipcRenderer.removeListener('control-mode-changed', handler);
  },
  setControlMode: (mode) => ipcRenderer.invoke('controls:set-mode', mode),
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
listCorePlugins: () => ipcRenderer.invoke('plugins:list-core'),
importPlugin: () => ipcRenderer.invoke('plugins:import-core'),
setPluginEnabled: (id, enabled) => ipcRenderer.invoke('plugins:set-enabled', id, enabled)});