'use strict';
// An opt-in LAN-only phone companion. Disabled until the user clicks Start.
// HTTP has no transport encryption: only use on a trusted private Wi-Fi network.
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {privateIPv4, safeFileName} = require('./logic.cjs');
const MAX_UPLOAD = 20 * 1024 * 1024;
const MAX_NOTE = 4000;
function page() {
  return '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Music Island Phone</title>'+
  '<style>body{font:16px system-ui;background:#0e1220;color:white;max-width:500px;margin:30px auto;padding:18px}h1{color:#a3b9ff}section{background:#1b2033;padding:18px;border-radius:16px;margin:15px 0}input,textarea,button{box-sizing:border-box;width:100%;background:#282e45;border:1px solid #424d72;border-radius:9px;padding:12px;color:white;margin:8px 0;font:inherit}button{background:#536cff;cursor:pointer}small{color:#aab2d0}#connected{display:none}</style>'+
  '<h1>📱 Music Island Phone</h1><small>اتصال محلي فقط. استخدم شبكة Wi-Fi موثوقة.</small>'+
  '<section id="pair"><label>رمز الاقتران المعروض على الكمبيوتر</label><input id="code" inputmode="numeric" maxlength="8" placeholder="8 أرقام"><button id="login">اتصال</button></section>'+
  '<section id="connected"><h3>متصل بالكمبيوتر ✓</h3><label>إرسال ملف إلى الكمبيوتر (20MB كحد أقصى)</label><input type="file" id="file"><button id="upload">إرسال الملف</button><label>إرسال نص إلى حافظة الكمبيوتر</label><textarea id="note" maxlength="4000"></textarea><button id="send">إرسال النص</button></section><p id="result" aria-live="polite"></p>'+
  '<script>const el=x=>document.getElementById(x);function msg(s){el("result").textContent=s}async function ask(u,o){let r=await fetch(u,o);let j=await r.json();if(!r.ok)throw Error(j.error||"فشل الطلب");return j}'+
  'el("login").onclick=async()=>{try{await ask("/pair",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:el("code").value})});el("pair").style.display="none";el("connected").style.display="block";msg("تم الاقتران")}catch(e){msg(e.message)}};'+
  'el("upload").onclick=async()=>{const f=el("file").files[0];if(!f)return msg("اختر ملفًا");if(f.size>20971520)return msg("الملف أكبر من 20MB");try{const r=await ask("/upload",{method:"POST",headers:{"x-file-name":encodeURIComponent(f.name)},body:f});msg("تم حفظ: "+r.name)}catch(e){msg(e.message)}};'+
  'el("send").onclick=async()=>{try{await ask("/note",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:el("note").value})});msg("تم نسخ النص إلى الحافظة")}catch(e){msg(e.message)}};</script></html>';
}
function discoverIP() {
  for (const addrs of Object.values(os.networkInterfaces())) for (const info of addrs || []) {
    if (info.family === 'IPv4' && !info.internal && privateIPv4(info.address)) return info.address;
  }
  return '';
}
function makePhone({downloads, clipboard, onActivity, addressOverride}) {
  let server = null, address = '', port = 0, code = '', codeUntil = 0;
  const sessions = new Map(), tries = new Map();
  const info = () => ({
    running: !!server, url: server ? 'http://' + address + ':' + port : '',
    code: server ? code : '', codeUntil, paired: sessions.size,
    warning: 'HTTP on private LAN only — do not use public or untrusted Wi-Fi.'
  });
  const json = (res, status, data, cookie) => {
    res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff',...(cookie ? {'set-cookie':cookie} : {})});
    res.end(JSON.stringify(data));
  };
  function readJson(req, limit = 6000) {
    return new Promise((resolve, reject) => {
      let n = 0, body = '';
      req.on('data', chunk => { n += chunk.length; if (n > limit) { reject(Error('Too large')); req.destroy(); } else body += chunk; });
      req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(Error('Bad JSON')); } });
      req.on('error', reject);
    });
  }
  function authorized(req) {
    const raw = /(?:^|;\s*)nova_phone=([a-f0-9]{64})(?:;|$)/.exec(String(req.headers.cookie || ''));
    const expires = raw ? sessions.get(raw[1]) : 0;
    if (!expires || expires < Date.now()) { if (raw) sessions.delete(raw[1]); return false; }
    return true;
  }
  function handler(req, res) {
    const local = req.socket.remoteAddress || '';
    if (!privateIPv4(local)) return json(res, 403, {error:'Private LAN only'});
    const target = 'http://' + address + ':' + port;
    if (req.headers.host !== address + ':' + port || (req.headers.origin && req.headers.origin !== target)) return json(res, 403, {error:'Host rejected'});
    res.setHeader('x-frame-options','DENY');
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store',
        'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"});
      return res.end(page());
    }
    if (req.method === 'POST' && req.url === '/pair') {
      const record = tries.get(local) || {count:0,until:Date.now()+60000};
      if (record.until < Date.now()) { record.count=0; record.until=Date.now()+60000; }
      if (++record.count > 5) { tries.set(local,record); return json(res,429,{error:'Wait one minute'}); }
      tries.set(local,record);
      return readJson(req).then(body => {
        if (typeof body.code !== 'string' || body.code !== code || Date.now() > codeUntil) return json(res,403,{error:'رمز غير صحيح أو منتهي'});
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, Date.now()+30*60*1000);
        code = String(crypto.randomInt(10000000,99999999)); codeUntil = Date.now()+5*60*1000;
        onActivity('phone','تم اقتران هاتف جديد');
        return json(res,200,{ok:true},'nova_phone='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800');
      }).catch(()=>json(res,400,{error:'Invalid request'}));
    }
    if (!authorized(req)) return json(res,401,{error:'افتح صفحة الاقتران مرة أخرى'});
    if (req.method === 'POST' && req.url === '/note') {
      return readJson(req).then(body => {
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > MAX_NOTE) return json(res,400,{error:'Bad note'});
        clipboard.writeText(body.text);
        onActivity('phone','نص من الهاتف نُسخ إلى الحافظة');
        return json(res,200,{ok:true});
      }).catch(()=>json(res,400,{error:'Bad note'}));
    }
    if (req.method === 'POST' && req.url === '/upload') {
      const decoded = (()=>{try{return decodeURIComponent(String(req.headers['x-file-name']||''));}catch{return 'file';}})();
      const filename = safeFileName(path.basename(decoded));
      const base = path.join(downloads,'Music Island Phone');
      fs.mkdirSync(base,{recursive:true});
      const name = Date.now()+'-'+crypto.randomBytes(5).toString('hex')+'-'+filename;
      const dest = path.join(base,name);
      let size = 0, aborted = false;
      const out = fs.createWriteStream(dest,{flags:'wx',mode:0o600});
      req.on('data', chunk=>{size+=chunk.length;if(size>MAX_UPLOAD){aborted=true;req.destroy();out.destroy();}});
      req.on('aborted',()=>{aborted=true;out.destroy();});
      req.on('error',()=>{aborted=true;out.destroy();});
      out.on('error',()=>{aborted=true;if(!res.headersSent)json(res,500,{error:'Failed to save'});});
      out.on('close',()=>{if(aborted)fs.rm(dest,{force:true},()=>{});});
      out.on('finish',()=>{if(aborted)return;onActivity('phone','تم استقبال '+filename);json(res,200,{ok:true,name});});
      return req.pipe(out);
    }
    return json(res,404,{error:'Not found'});
  }
  async function start() {
    if (server) return info();
    address = addressOverride || discoverIP();
    if (!privateIPv4(address)) return {...info(),error:'No private IPv4 Wi-Fi/LAN address found'};
    code = String(crypto.randomInt(10000000,99999999));
    codeUntil = Date.now()+5*60*1000;
    const s = http.createServer(handler);
    s.requestTimeout = 2*60*1000;
    s.headersTimeout = 20000;
    try {
      await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,address,resolve);});
      server=s;port=s.address().port;
      onActivity('phone','تم تشغيل المشاركة على شبكة LAN');
      return info();
    } catch(e){s.close();return {...info(),error:String(e.message)};}
  }
  function stop() {
    if (server) server.closeAllConnections && server.closeAllConnections();
    if (server) server.close();
    server=null;address='';port=0;code='';codeUntil=0;sessions.clear();tries.clear();
    onActivity('phone','تم إيقاف مشاركة الهاتف');
    return info();
  }
  return {start,stop,info};
}
module.exports = {makePhone};
