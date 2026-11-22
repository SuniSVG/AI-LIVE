'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Cầu nối cho sân khấu: chỉ nhận lệnh hiển thị và báo "đã đọc xong", không gửi lệnh điều khiển.
contextBridge.exposeInMainWorld('kurumi', {
  stage: {
    init: () => ipcRenderer.invoke('stage:init'),
    done: () => ipcRenderer.send('stage:done'),
    onSay: cb => ipcRenderer.on('stage:say', (_e, p) => cb(p)),
    onBoard: cb => ipcRenderer.on('stage:board', (_e, e) => cb(e)),
    onClear: cb => ipcRenderer.on('stage:clear', () => cb()),
    onConfig: cb => ipcRenderer.on('stage:config', (_e, c) => cb(c)),
    music: {
      list: () => ipcRenderer.invoke('stage:musicList'),
      onCmd: cb => ipcRenderer.on('stage:music', (_e, p) => cb(p))
    },
    onReading: cb => ipcRenderer.on('stage:reading', (_e, r) => cb(r)),
    // video quà tặng: nhận lệnh phát/dừng, báo độ dài và báo phát xong
    onVideoPlay: cb => ipcRenderer.on('stage:videoPlay', (_e, p) => cb(p)),
    onVideoStop: cb => ipcRenderer.on('stage:videoStop', () => cb()),
    videoMeta: (id, duration) => ipcRenderer.send('stage:videoMeta', { id, duration }),
    // hiệu ứng icon quà bùng nổ quanh nhân vật (tự biến mất sau durationMs)
    onGiftFx: cb => ipcRenderer.on('stage:giftFx', (_e, p) => cb(p)),
    videoDone: (id, ok = true) => ipcRenderer.send('stage:videoDone', { id, ok })
  }
});
