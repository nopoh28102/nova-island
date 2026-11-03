'use strict';
const api=window.hub;
const el=id=>document.getElementById(id);
let state={mode:'normal',automationOn:false,rules:[],activities:[],drop:[],searchFolder:'',phone:{running:false}};
let activeTab='command';
function toast(message){el('toast').textContent=String(message||'');}
function showTab(tab) {
  activeTab=tab;
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+tab));
  if(tab==='command')el('command').focus();
}
for(const b of document.querySelectorAll('.nav'))b.addEventListener('click',()=>showTab(b.dataset.tab));
function row(parent,title,subtitle,action,buttonText) {
  const d=document.createElement('div');d.className='entry';
  const text=document.createElement('strong');text.textContent=title;
  const small=document.createElement('small');small.textContent=subtitle;
  d.append(text,small);
  if(action){const b=document.createElement('button');b.textContent=buttonText||'فتح';b.addEventListener('click',action);d.append(b);}
  parent.append(d);return d;
}
function showState(s) {
  if(!s || !s.mode)return;
  state=s;
  el('search-state').textContent=s.searchFolder ? s.searchFolder+' ('+s.searchCount+' ملف)' : 'اختر مجلدًا للفهرسة';
  el('drop-list').replaceChildren();
  el('drop-list').classList.toggle('empty',!s.drop.length);
  if(!s.drop.length)el('drop-list').textContent='لم يتم اختيار ملفات بعد';
  for(const f of s.drop)row(el('drop-list'),f.name,f.kind==='folder'?'مجلد':'ملف');
  el('current-mode').textContent=s.mode;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===s.mode));
  const acts=el('activity-list');acts.replaceChildren();
  for(const d of s.downloads||[]) {
    row(acts,'تحميل: '+d.name,d.status+(d.percent===null?'':' · '+d.percent+'%'));
  }
  for(const a of s.activities) {
    row(acts,a.title,new Date(a.at).toLocaleString('ar-EG')+' • '+(a.status==='running'?'جارٍ التنفيذ':a.status==='failed'?'فشل':'تم'));
  }
  if(!s.activities.length)acts.textContent='لا توجد أنشطة بعد';
  const p=s.phone;
  el('phone-url').textContent=p.url||'غير نشط';
  el('phone-code').textContent=p.running?p.code:'—';
  el('phone-state').textContent=p.running?'الهواتف المتصلة: '+p.paired+' · الرمز يتغير بعد الاقتران وينتهي خلال 5 دقائق':'المشاركة متوقفة';
  el('phone-start').disabled=!!p.running;
  el('phone-stop').disabled=!p.running;
  el('auto-on').checked=s.automationOn;
  const rules=el('rule-list');rules.replaceChildren();
  for(const r of s.rules)row(rules,(r.trigger==='app'?'تطبيق: ':'وقت: ')+r.value,'تفعيل الوضع '+r.mode,
    async()=>{try{showState(await api.removeRule(r.id));toast('تم حذف القاعدة');}catch(e){toast(e.message)}},'حذف');
  if(!s.rules.length)rules.textContent='لم تُضف قواعد أتمتة بعد';
}
api.onState(showState);
async function refresh(){try{showState(await api.state());}catch(e){toast('تعذّر جلب الحالة')}}
refresh();
setInterval(refresh,5000);
let querySeq=0;
async function doSearch(){
  const seq=++querySeq;
  const q=el('command').value;
  try {
    const results=await api.find(q);
    if(seq!==querySeq)return;
    const parent=el('results');parent.replaceChildren();
    for(const result of results){
      const b=document.createElement('button');b.className='item';
      const label=document.createElement('strong');label.textContent=result.title;
      const small=document.createElement('small');small.textContent=result.sub||result.type;
      b.append(label,small);
      b.addEventListener('click',async()=>{
        try {
          const reply=await api.execute(result.id);
          if(reply && reply.error)toast(reply.error);
          else {
            if(result.id==='hub:phone')showTab('phone');
            if(result.id==='hub:files')showTab('drop');
            toast('تم تنفيذ الأمر');
          }
          refresh();
        }catch(e){toast(e.message)}
      });parent.append(b);
    }
    if(!results.length)parent.textContent='لا توجد نتائج';
  }catch(e){toast('تعذّر البحث')}
}
el('command').addEventListener('input',doSearch);
el('command').addEventListener('keydown',e=>{if(e.key==='Enter'){const first=el('results').querySelector('button');if(first)first.click();}});
doSearch();
el('index-folder').addEventListener('click',async()=>{showState(await api.searchFolder());doSearch();});
el('drop-pick').addEventListener('click',async()=>{try{showState(await api.pick());}catch(e){toast(e.message)}});
document.querySelectorAll('[data-drop]').forEach(b=>b.addEventListener('click',async()=>{
  b.disabled=true;toast('تنفيذ العملية...');
  try{const r=await api.drop(b.dataset.drop);if(r && r.ok)toast('تمت العملية بنجاح');else toast((r&&r.error)||'فشلت العملية');await refresh();}
  catch(e){toast(e.message)}finally{b.disabled=false;}
}));
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',async()=>{try{showState(await api.mode(b.dataset.mode));}catch(e){toast(e.message)}}));
el('auto-on').addEventListener('change',async e=>{try{showState(await api.automate(e.target.checked));}catch(err){toast(err.message)}});
el('rule-add').addEventListener('click',async()=>{
  const raw={trigger:el('rule-type').value,value:el('rule-value').value,mode:el('rule-mode').value,enabled:true};
  try{const r=await api.addRule(raw);if(r.ok===false)return toast(r.error);showState(r);el('rule-value').value='';toast('أُضيفت القاعدة');}
  catch(e){toast(e.message)}
});
el('phone-start').addEventListener('click',async()=>{try{const p=await api.phoneStart();if(p.error)toast(p.error);else toast('المشاركة مفعّلة — افتح الرابط من الهاتف');refresh();}catch(e){toast(e.message)}});
el('phone-stop').addEventListener('click',async()=>{try{await api.phoneStop();refresh();toast('تم إيقاف الاتصال');}catch(e){toast(e.message)}});

document.addEventListener('dragover',e=>{if(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'))e.preventDefault();});
document.addEventListener('drop',async e=>{
  if(!e.dataTransfer || !e.dataTransfer.files.length)return;
  e.preventDefault();
  try{showState(await api.dropped(e.dataTransfer.files));showTab('drop');toast('أضيفت الملفات إلى Magic Drop');}
  catch(err){toast(err.message)}
});
