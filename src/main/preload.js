const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('get-state'),
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  startAuth: () => ipcRenderer.invoke('start-auth'),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  saveFolders: (folders) => ipcRenderer.invoke('save-folders', folders),
  saveSchedule: (opts) => ipcRenderer.invoke('save-schedule', opts),
  runBackup: () => ipcRenderer.invoke('run-backup'),
  onAuthComplete: (cb) => ipcRenderer.on('auth-complete', (_, data) => cb(data)),
  onBackupProgress: (cb) => ipcRenderer.on('backup-progress', (_, data) => cb(data)),
});
