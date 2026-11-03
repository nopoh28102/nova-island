'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('hub',{
  state:()=>invoke('hub-state'),
  find:q=>invoke('hub-find',q),
  execute:id=>invoke('hub-execute',id),
  pick:()=>invoke('hub-pick'),
  searchFolder:()=>invoke('hub-search-folder'),
  drop:type=>invoke('hub-drop-action',type),
  mode:value=>invoke('hub-mode',value),
  automate:enabled=>invoke('hub-automation-toggle',enabled),
  addRule:rule=>invoke('hub-rule-add',rule),
  removeRule:id=>invoke('hub-rule-remove',id),
  phoneStart:()=>invoke('hub-phone-start'),
  phoneStop:()=>invoke('hub-phone-stop'),
  onState:callback=>ipcRenderer.on('hub-state',(_event,data)=>callback(data))
});
