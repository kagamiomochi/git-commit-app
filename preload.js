const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitAPI', {
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  chooseCloneParent: () => ipcRenderer.invoke('choose-clone-parent'),
  cloneRepo: (url, dest) => ipcRenderer.invoke('clone-repo', url, dest),
  getRepoPath: () => ipcRenderer.invoke('get-repo-path'),
  getStatus: () => ipcRenderer.invoke('git-status'),
  stageFiles: (files) => ipcRenderer.invoke('git-stage', files),
  unstageFiles: (files) => ipcRenderer.invoke('git-unstage', files),
  commit: (message) => ipcRenderer.invoke('git-commit', message),
  push: () => ipcRenderer.invoke('git-push'),
  pull: () => ipcRenderer.invoke('git-pull'),
  getLog: () => ipcRenderer.invoke('git-log'),
  getDiff: (filePath, category) => ipcRenderer.invoke('git-diff', filePath, category),
  translate: (text) => ipcRenderer.invoke('translate-text', text),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openRepoFolder: () => ipcRenderer.invoke('open-repo-folder'),
});
