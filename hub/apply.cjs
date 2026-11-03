'use strict';
// Applies only to a Nova Island v1.6.0 source checkout after local-music integration.
// Keeps signed external plugin protections intact and does not run untrusted plugin code.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||'.');
function edit(filename,from,to,marker){
  const file=path.join(root,filename);
  let source=fs.readFileSync(file,'utf8');
  if(source.includes(marker)){console.log('Already integrated:',filename);return;}
  if(!source.includes(from))throw Error('Missing patch anchor in '+filename+': '+from.slice(0,70));
  source=source.replace(from,to);
  fs.writeFileSync(file,source);
  console.log('Integrated:',filename);
}
const p=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(p.version!=='1.6.0')throw Error('Expected Nova Island 1.6.0');
edit('nova.js',"const plugins = require('./plugins');","const plugins = require('./plugins');\nconst hub = require('./hub/main.cjs');","const hub = require('./hub/main.cjs');");
edit('nova.js','  createWindow();','  createWindow();\n  hub.start();','  hub.start();');
edit('nova.js',"        send('media', data);","        send('media', data);\n        hub.onMedia(data);","        hub.onMedia(data);");
edit('preload.js',"  openSettings: () => ipcRenderer.send('open-settings'),","  openSettings: () => ipcRenderer.send('open-settings'),\n  openHub: () => ipcRenderer.send('hub-open'),","  openHub: () => ipcRenderer.send('hub-open'),");
edit('index.html','            <button class="gear" id="open-settings"','            <button class="gear" id="open-hub" title="Productivity Hub" aria-label="Open Nova Productivity Hub">✦</button>\n            <button class="gear" id="open-settings"','id="open-hub"');
edit('renderer.js',"$('#open-settings').addEventListener('click', () => bridge.openSettings());","$('#open-settings').addEventListener('click', () => bridge.openSettings());\n$('#open-hub').addEventListener('click', () => bridge.openHub());","$('#open-hub').addEventListener");
console.log('Productivity Hub integrated. Shortcut Ctrl+Shift+Space.');
