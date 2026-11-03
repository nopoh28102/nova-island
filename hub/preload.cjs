'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('hub',{
  state:()=>invoke('hub-state'),
  find:q=>invoke('hub-find',q),
  execute:id=>invoke('hub-execute',id),
  pick:()=>invoke('hub-pick'),
  dropped:files=>{
    const paths=Array.from(files||[]).map(f=>{try{return webUtils.getPathForFile(f);}catch{return ''}}).filter(Boolean);
    return invoke('hub-drag-files',paths);
  },
  searchFolder:()=>invoke('hub-search-folder'),
  drop:type=>invoke('hub-drop-action',type),
  mode:value=>invoke('hub-mode',value),
  automate:enabled=>invoke('hub-automation-toggle',enabled),
  addRule:rule=>invoke('hub-rule-add',rule),
  removeRule:id=>invoke('hub-rule-remove',id),
  phoneStart:()=>invoke('hub-phone-start'),
  phoneStop:()=>invoke('hub-phone-stop'),
  shareFile:()=>invoke('hub-phone-share-file'),
  shareClipboard:()=>invoke('hub-phone-share-clipboard'),
  onState:callback=>ipcRenderer.on('hub-state',(_event,data)=>callback(data))
});
