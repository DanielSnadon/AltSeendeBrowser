const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('alt',{command:(a,d)=>ipcRenderer.invoke('command',a,d),onState:fn=>ipcRenderer.on('state',(_e,s)=>fn(s)),onShortcut:fn=>ipcRenderer.on('shortcut',(_e,a)=>fn(a)),onReader:fn=>ipcRenderer.on('reader',(_e,t)=>fn(t))});
