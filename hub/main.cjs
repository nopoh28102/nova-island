'use strict';
// Nova Productivity Hub: trusted main-process functionality, no arbitrary shell execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {app, BrowserWindow, ipcMain, dialog, shell, clipboard, globalShortcut} = require('electron');
const settings = require('../settings');
const apps = require('../apps');
const features = require('../features');
const {calculate,cleanRule,ruleMatches,MODES} = require('./logic.cjs');
const {makePhone} = require('./phone.cjs');
const SAVE = 'nova-productivity-hub.json';
const stored = settings.load(SAVE,{});
let rules = (Array.isArray(stored.rules) ? stored.rules : []).map(cleanRule).filter(Boolean).slice(0,25);
let automationOn = stored.automationOn === true;
let win = null, activityId = 0, activeMode = 'normal', baseline = null, ruleOwner = false;
let selected = [], indexed = [], searchFolder = '', lastForeground = '', lastTick = '';
const activities = [];
let downloadRows = [];
const downloadStatus = new Map();
function onDownloads(payload) {
  const items = Array.isArray(payload?.items) ? payload.items.slice(0,25) : [];
  const rows = items.map(d => ({
    name: String(d.name||'Download').slice(0,100),
    status: String(d.status||'').slice(0,35),
    percent: Number.isFinite(d.progress) ? Math.round(d.progress*100) : null
  }));
  const signature = JSON.stringify(rows);
  if (signature === JSON.stringify(downloadRows)) return;
  for(const d of items) {
    const id = String(d.id||d.path||d.name||'');
    if (!id) continue;
    const prev = downloadStatus.get(id);
    if (prev && prev !== d.status && ['complete','completed','done','finished'].includes(String(d.status))) {
      log('download','اكتمل تحميل: '+String(d.name||'file').slice(0,90));
    }
    downloadStatus.set(id,d.status);
  }
  if(downloadStatus.size>150)downloadStatus.clear();
  downloadRows=rows;update();
}
let phone;
const save = () => settings.save(SAVE,{rules,automationOn});
function log(type,title,status='done') {
  const entry = {id:++activityId,type,title:String(title).slice(0,140),status,at:Date.now()};
  activities.unshift(entry);if(activities.length>35)activities.length=35;
  update();return entry;
}
function update() {
  if(win && !win.isDestroyed() && !win.webContents.isLoading()) win.webContents.send('hub-state',snapshot());
}
function snapshot() {
  return {mode:activeMode,automationOn,rules:rules.slice(),activities:activities.slice(),
    drop:selected.filter(p=>fs.existsSync(p)).map(p=>({name:path.basename(p),kind:fs.statSync(p).isDirectory()?'folder':'file'})),
    downloads:downloadRows.slice(0,10),
    searchFolder,searchCount:indexed.length,phone:phone ? phone.info() : {running:false}};
}
function modeSet(mode,origin='manual') {
  if(!MODES.includes(mode))return snapshot();
  if(mode==='normal') {
    if(baseline) features.set(baseline);
    baseline=null;
  } else {
    if(!baseline) {
      const f=features.get();
      baseline={reminders:f.reminders,news:f.news,dlToasts:f.dlToasts,noBlur:f.noBlur,noAnimations:f.noAnimations};
    }
    const p={...baseline};
    if(mode==='focus')Object.assign(p,{reminders:false,news:false,dlToasts:false});
    if(mode==='gaming')Object.assign(p,{reminders:false,news:false,dlToasts:false,noBlur:true,noAnimations:true});
    if(mode==='work')Object.assign(p,{news:false});
    features.set(p);
  }
  if(origin==='manual')ruleOwner=false;
  if(origin==='rule')ruleOwner=true;
  if(activeMode!==mode){activeMode=mode;log('mode','الوضع الحالي: '+mode+' ('+origin+')');}
  update();return snapshot();
}
function onMedia(data) {
  if(!data || typeof data.fgProc!=='string')return;
  const appName=data.fgProc.toLowerCase();
  if(appName===lastForeground)return;
  lastForeground=appName;
  if(!automationOn)return;
  const match=rules.find(r=>r.trigger==='app' && ruleMatches(r,{app:appName}));
  if(match)modeSet(match.mode,'rule');
  else if(ruleOwner)modeSet('normal','rule');
}
function tick() {
  if(!automationOn)return;
  const now=new Date(), today=now.toLocaleDateString('en-CA');
  const hh=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const key=today+' '+hh;
  if(lastTick===key)return;
  lastTick=key;
  const r=rules.find(rule=>rule.trigger==='time' && ruleMatches(rule,{time:hh}));
  if(r){modeSet(r.mode,'rule');log('automation','قاعدة مجدولة: '+hh);}
}
function rescan(folder) {
  const found=[],seen=new Set(),stack=[{folder,depth:0}];
  while(stack.length && found.length<1600) {
    const cur=stack.pop(); if(cur.depth>4)continue;
    let entries;try{entries=fs.readdirSync(cur.folder,{withFileTypes:true});}catch{continue;}
    for(const item of entries) {
      const full=path.join(cur.folder,item.name);
      if(item.isDirectory())stack.push({folder:full,depth:cur.depth+1});
      if(item.isFile()) {
        const key=full.toLowerCase();
        if(!seen.has(key)){seen.add(key);found.push({name:item.name,path:full});}
      }
      if(found.length>=1600)break;
    }
  }
  indexed=found;
  update();
}
let appCatalog=[];
async function find(query) {
  const q=String(query||'').trim().slice(0,120);
  const items=[];
  const calc=calculate(q);
  if(calc!==null) items.push({id:'calc:'+calc,title:'الحاسبة: '+calc,sub:'انسخ النتيجة',type:'calc'});
  const builtin=[
    ['hub:files','Magic Drop','اختيار ملفات لضغطها أو نسخها أو فتحها'],
    ['hub:folder','بحث الملفات','اختيار مجلد للبحث داخله'],
    ['hub:phone','Phone Connect','الاتصال بالموبايل عبر شبكة LAN'],
    ['hub:work','Work Mode','وضع العمل'],
    ['hub:focus','Focus Mode','وضع التركيز'],
    ['hub:gaming','Gaming Mode','وضع الألعاب'],
    ['hub:normal','Normal Mode','الوضع الطبيعي'],
    ['hub:settings','إعدادات Nova','فتح الإعدادات'],
  ];
  for(const [id,title,sub] of builtin)
    if(!q || (title+' '+sub).toLowerCase().includes(q.toLowerCase()))
      items.push({id,title,sub,type:'command'});
  if(q) {
    for(const a of appCatalog) {
      if(a.name.toLowerCase().includes(q.toLowerCase()))items.push({id:'app:'+a.id,title:a.name,sub:'افتح التطبيق',type:'app'});
      if(items.length>48)break;
    }
    for(const f of indexed) {
      if(f.name.toLowerCase().includes(q.toLowerCase()))items.push({id:'file:'+f.path,title:f.name,sub:'افتح الملف من المجلد المحدد',type:'file'});
      if(items.length>55)break;
    }
  }
  return items.slice(0,55);
}
async function execute(id) {
  if(typeof id!=='string'||id.length>1100)return {ok:false};
  if(id.startsWith('calc:')) {
    const n=id.slice(5); if(calculate(n)!==n)return {ok:false};
    clipboard.writeText(n);log('command','نسخ نتيجة: '+n);return {ok:true};
  }
  if(id.startsWith('app:')) {
    const a=appCatalog.find(a=>'app:'+a.id===id);
    if(!a)return {ok:false};
    await apps.launch(a.id);log('command','فتح '+a.name);return {ok:true};
  }
  if(id.startsWith('file:')) {
    const p=id.slice(5);
    if(!indexed.some(f=>f.path===p))return {ok:false};
    const result=await shell.openPath(p);
    if(result)return {ok:false,error:result};
    log('command','فتح '+path.basename(p));return {ok:true};
  }
  const cmds={
    'hub:files':()=>pickDrop(),
    'hub:folder':()=>pickSearch(),
    'hub:phone':()=>{show();return {ok:true,tab:'phone'};},
    'hub:settings':()=>{require('../prefs-window').open();return {ok:true};},
    'hub:work':()=>modeSet('work'),
    'hub:focus':()=>modeSet('focus'),
    'hub:gaming':()=>modeSet('gaming'),
    'hub:normal':()=>modeSet('normal'),
  };
  const fn=cmds[id];if(!fn)return {ok:false};
  const res=await fn();return res||{ok:true};
}
async function pickSearch() {
  const chosen=await dialog.showOpenDialog(win,{title:'اختر مجلدًا للبحث',properties:['openDirectory']});
  if(chosen.canceled||!chosen.filePaths[0])return snapshot();
  searchFolder=chosen.filePaths[0];rescan(searchFolder);
  log('search','تم فهرسة '+indexed.length+' ملف');return snapshot();
}
async function pickDrop() {
  const choice=await dialog.showOpenDialog(win,{title:'Magic Drop — اختر الملفات أو المجلدات',properties:['openFile','multiSelections']});
  if(!choice.canceled)selected=choice.filePaths.filter(p=>fs.existsSync(p)).slice(0,60);
  update();return snapshot();
}
async function dropAction(type) {
  if(!selected.length)return {ok:false,error:'اختر الملفات أولًا'};
  if(type==='paths') {
    clipboard.writeText(selected.join('\n'));log('files','تم نسخ مسارات '+selected.length+' ملف');return {ok:true};
  }
  if(type==='reveal') {
    shell.showItemInFolder(selected[0]);return {ok:true};
  }
  if(type==='zip') {
    if(new Set(selected.map(p=>path.dirname(p).toLowerCase())).size!==1)
      return {ok:false,error:'اختر ملفات من مجلد واحد للأرشفة'};
    const target=await dialog.showSaveDialog(win,{title:'احفظ الأرشيف',defaultPath:path.join(app.getPath('downloads'),'Nova-Archive.zip'),filters:[{name:'ZIP',extensions:['zip']}]});
    if(target.canceled||!target.filePath)return {ok:false,error:'أُلغي الحفظ'};
    const destination=target.filePath.toLowerCase().endsWith('.zip')?target.filePath:target.filePath+'.zip';
    if(selected.some(p=>p.toLowerCase()===destination.toLowerCase()))return {ok:false,error:'اختر ملف إخراج مختلف'};
    const activity=log('zip','جاري ضغط '+selected.length+' عنصر','running');
    const args=['-a','-c','-f',destination,'-C',path.dirname(selected[0]),...selected.map(p=>'./'+path.basename(p))];
    try{
      await new Promise((resolve,reject)=>{
        const p=spawn('tar.exe',args,{windowsHide:true,shell:false,stdio:'ignore'});
        p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error('tar exit '+code)));
      });
      activity.status='done';activity.title='تم إنشاء: '+path.basename(destination);
      update();return {ok:true};
    }catch(e){
      activity.status='failed';activity.title='فشل ضغط الملفات: '+String(e.message).slice(0,65);
      update();return {ok:false,error:activity.title};
    }
  }
  if(type==='copy') {
    const choice=await dialog.showOpenDialog(win,{title:'اختر مجلد الوجهة',properties:['openDirectory']});
    if(choice.canceled||!choice.filePaths[0])return {ok:false,error:'أُلغي الاختيار'};
    const destination=choice.filePaths[0];
    const activity=log('files','نسخ '+selected.length+' ملف','running');
    try{
      for(const p of selected) {
        if(!fs.statSync(p).isFile())throw Error('النسخ يدعم الملفات فقط');
        const target=path.join(destination,path.basename(p));
        if(fs.existsSync(target))throw Error('ملف بنفس الاسم موجود في الوجهة');
        await fs.promises.copyFile(p,target,fs.constants.COPYFILE_EXCL);
      }
      activity.status='done';activity.title='اكتمل نسخ الملفات';update();return {ok:true};
    }catch(e){activity.status='failed';update();return {ok:false,error:String(e.message)};}
  }
  return {ok:false,error:'أمر غير مدعوم'};
}
function show() {
  if(win && !win.isDestroyed()) {win.show();win.focus();return;}
  win=new BrowserWindow({width:850,height:680,minWidth:670,minHeight:550,backgroundColor:'#0c1020',
    title:'Nova Productivity Hub',icon:path.join(__dirname,'..','build','icon.ico'),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'index.html'));
  win.on('closed',()=>{win=null;});
  win.webContents.on('did-finish-load',update);
}
function trusted(e){return win && !win.isDestroyed() && e.sender===win.webContents;}
function guard(fn){return (e,...args)=>trusted(e)?fn(...args):{ok:false,error:'Forbidden'};}
function start() {
  phone=makePhone({downloads:app.getPath('downloads'),clipboard,onActivity:log});
  ipcMain.on('hub-open',()=>show());
  ipcMain.handle('hub-state',guard(()=>snapshot()));
  ipcMain.handle('hub-find',guard(q=>find(q)));
  ipcMain.handle('hub-execute',guard(id=>execute(id)));
  ipcMain.handle('hub-pick',guard(()=>pickDrop()));
  ipcMain.handle('hub-drag-files',guard(paths=>{
    if(!Array.isArray(paths))return {ok:false,error:'Invalid files'};
    selected=paths.filter(p=>typeof p==='string' && path.isAbsolute(p) && fs.existsSync(p)).slice(0,60);
    if(selected.length)log('files','أُضيف '+selected.length+' ملف عبر السحب');
    return snapshot();
  }));
  ipcMain.handle('hub-search-folder',guard(()=>pickSearch()));
  ipcMain.handle('hub-drop-action',guard(type=>dropAction(type)));
  ipcMain.handle('hub-mode',guard(mode=>modeSet(mode)));
  ipcMain.handle('hub-automation-toggle',guard(v=>{automationOn=v===true;save();update();return snapshot();}));
  ipcMain.handle('hub-rule-add',guard(raw=>{
    const clean=cleanRule(raw);if(!clean||rules.length>=25)return {ok:false,error:'قاعدة غير صالحة'};
    clean.id=crypto.randomBytes(6).toString('hex');rules.push(clean);save();update();return snapshot();
  }));
  ipcMain.handle('hub-rule-remove',guard(id=>{rules=rules.filter(r=>r.id!==id);save();update();return snapshot();}));
  ipcMain.handle('hub-phone-start',guard(async()=>{const result=await phone.start();update();return result;}));
  ipcMain.handle('hub-phone-stop',guard(()=>{const result=phone.stop();update();return result;}));
  setInterval(tick,15*1000).unref();
  globalShortcut.register('CommandOrControl+Shift+Space',show);
  // Start-app catalog scan without delaying island launch.
  setTimeout(()=>apps.all().then(list=>{appCatalog=list.map(a=>({id:a.id,name:a.name}));}).catch(()=>{}),2500);
  app.on('before-quit',()=>phone && phone.stop());
}
module.exports={start,show,onMedia,onDownloads};
