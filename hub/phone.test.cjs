'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {makePhone}=require('./phone.cjs');

test('Phone Connect is opt-in, paired, restricted, and receives a file without exposing computer files',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nova-phone-test-'));
  const clips=[],activities=[];
  const phone=makePhone({
    addressOverride:'127.0.0.1',downloads:temp,
    clipboard:{writeText:v=>clips.push(v)},
    onActivity:(...x)=>activities.push(x)
  });
  try {
    assert.equal(phone.info().running,false);
    const active=await phone.start();
    assert.equal(active.running,true);
    assert.match(active.code,/^\d{8}$/);
    const url=active.url;

    const noAuth=await fetch(url+'/note',{method:'POST',headers:{'content-type':'application/json'},body:'{"text":"no"}'});
    assert.equal(noAuth.status,401);
    const badOrigin=await fetch(url+'/pair',{method:'POST',
      headers:{origin:'http://evil.example','content-type':'application/json'},body:JSON.stringify({code:active.code})});
    assert.equal(badOrigin.status,403);
    const invalid=await fetch(url+'/pair',{method:'POST',
      headers:{'content-type':'application/json'},body:'{"code":"00000000"}'});
    assert.equal(invalid.status,403);

    const pair=await fetch(url+'/pair',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify({code:active.code})});
    assert.equal(pair.status,200);
    const cookie=pair.headers.get('set-cookie').split(';')[0];
    assert.match(cookie,/^nova_phone=[a-f0-9]{64}$/);
    assert.notEqual(phone.info().code,active.code);

    const note=await fetch(url+'/note',{method:'POST',
      headers:{'content-type':'application/json',cookie},body:JSON.stringify({text:'مرحبا من الموبايل'})});
    assert.equal(note.status,200);
    assert.deepEqual(clips,['مرحبا من الموبايل']);

    const sent=await fetch(url+'/upload',{method:'POST',
      headers:{'x-file-name':encodeURIComponent('test-note.txt'),cookie},body:Buffer.from('hello from phone')});
    assert.equal(sent.status,200);
    const result=await sent.json();
    assert.equal(result.ok,true);
    const diskPath=path.join(temp,'Music Island Phone',result.name);
    assert.equal(fs.readFileSync(diskPath,'utf8'),'hello from phone');
    assert.ok(activities.length>=2);
  } finally {
    phone.stop();
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
