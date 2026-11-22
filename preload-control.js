'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Cầu nối cho bảng điều khiển. Không có key API ở đây: key chỉ nằm trong main process.
contextBridge.exposeInMainWorld('kurumi', {
  control: {
    get: () => ipcRenderer.invoke('ctl:get'),
    connect: user => ipcRenderer.invoke('ctl:connect', user),
    disconnect: () => ipcRenderer.invoke('ctl:disconnect'),
    saveSettings: patch => ipcRenderer.invoke('ctl:settings', patch),
    musicNext: () => ipcRenderer.invoke('ctl:musicNext'),
    saveKey: key => ipcRenderer.invoke('ctl:key', key),
    togglePause: () => ipcRenderer.invoke('ctl:pause'),
    clearQueue: () => ipcRenderer.invoke('ctl:clearQueue'),
    pick: id => ipcRenderer.invoke('ctl:pick', id),
    demo: on => ipcRenderer.invoke('ctl:demo', on),
    test: p => ipcRenderer.invoke('ctl:test', p),
    voiceTest: () => ipcRenderer.invoke('ctl:voiceTest'),
    toggleStage: () => ipcRenderer.invoke('ctl:stage'),
    clearStage: () => ipcRenderer.invoke('ctl:clearStage'),
    // video quà tặng
    pickVideo: () => ipcRenderer.invoke('ctl:pickVideo'),
    videoSkip: () => ipcRenderer.invoke('ctl:videoSkip'),
    videoClear: () => ipcRenderer.invoke('ctl:videoClear'),
    videoTest: id => ipcRenderer.invoke('ctl:videoTest', id),
    formReset: () => ipcRenderer.invoke('ctl:formReset'),
    onState: cb => ipcRenderer.on('ctl:state', (_e, s) => cb(s))
  }
});
