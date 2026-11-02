// Local music player, runs within Nova Island's existing secure renderer.
(() => {
  'use strict';
  const api = bridge.localMusic;
  const audio = new Audio();
  audio.preload = 'metadata';
  const el = (id) => document.getElementById(id);
  const songsEl = el('lm-list');
  let library = { tracks: [], folders: [], filesCount: 0, settings: { volume: 70, shuffle: false, repeat: 'all', pauseAtPrayer: false } };
  let current = -1;
  let wanted = false;
  let failures = 0;
  let history = [];
  let shuffled = new Set();

  const status = (message) => { el('lm-status').textContent = message; };
  const clock = (time) => {
    if (!Number.isFinite(time)) return '0:00';
    const t = Math.floor(Math.max(0, time));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  function updateControls() {
    el('lm-play').textContent = wanted && !audio.paused ? '⏸' : '▶';
    el('lm-shuffle').classList.toggle('active', library.settings.shuffle);
    el('lm-repeat').textContent = library.settings.repeat === 'one' ? '🔂' : library.settings.repeat === 'all' ? '🔁' : '↪';
    el('lm-repeat').title = `تكرار: ${library.settings.repeat}`;
    el('lm-volume').value = library.settings.volume;
    el('lm-volume-text').textContent = `${library.settings.volume}%`;
    el('lm-prayer').checked = library.settings.pauseAtPrayer;
  }
  function renderList() {
    songsEl.replaceChildren();
    const term = el('lm-search').value.trim().toLocaleLowerCase();
    let count = 0;
    for (let i = 0; i < library.tracks.length; i++) {
      const song = library.tracks[i];
      if (term && !song.name.toLocaleLowerCase().includes(term)) continue;
      if (++count > 120) break;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `lm-song${i === current ? ' selected' : ''}`;
      const num = document.createElement('span'); num.className = 'lm-number'; num.textContent = i === current ? '♫' : String(i + 1);
      const title = document.createElement('span'); title.className = 'lm-song-title'; title.dir = 'auto'; title.textContent = song.name;
      row.append(num, title);
      row.addEventListener('click', () => playIndex(i, true));
      songsEl.append(row);
    }
    if (!count) {
      const empty = document.createElement('div'); empty.className = 'lm-empty';
      empty.textContent = term ? 'لا توجد أغاني تطابق البحث' : 'اختر مجلدًا أو ملفات لإضافة الأغاني'; songsEl.append(empty);
    }
    el('lm-count').textContent = `${library.tracks.length} أغنية`;
  }
  function apply(data) {
    if (!data || !Array.isArray(data.tracks)) return;
    const selectedPath = library.tracks[current]?.path;
    library = data;
    current = selectedPath ? data.tracks.findIndex(t => t.path === selectedPath) : -1;
    if (current < 0 && audio.src) { audio.pause(); audio.removeAttribute('src'); wanted = false; }
    shuffled = new Set([...shuffled].filter(i => i >= 0 && i < data.tracks.length));
    el('lm-sources').textContent = `${data.folders.length} مجلد · ${data.filesCount} ملف مُضاف`;
    audio.volume = data.settings.volume / 100;
    updateControls(); renderList();
  }
  async function playIndex(index, recordHistory = false) {
    if (index < 0 || index >= library.tracks.length) return;
    if (recordHistory && current >= 0 && current !== index) history.push(current);
    current = index;
    if (library.settings.shuffle) shuffled.add(index);
    wanted = true;
    const song = library.tracks[index];
    audio.pause();
    audio.src = song.url;
    audio.load();
    el('lm-current').textContent = song.name;
    el('lm-current').title = song.name;
    status('جارٍ التشغيل…');
    renderList(); updateControls();
    try { await audio.play(); failures = 0; status('يعمل الآن'); }
    catch (err) { if (wanted && current === index) { status('تعذّر تشغيل الملف: ' + (err?.message || 'صيغة غير مدعومة')); updateControls(); } }
  }
  function next(fromEnd = false) {
    const n = library.tracks.length;
    if (!n) { status('أضف أغاني أولًا'); return; }
    if (fromEnd && library.settings.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    if (fromEnd && library.settings.repeat === 'off' && current === n - 1 && !library.settings.shuffle) {
      wanted = false; audio.pause(); status('انتهت قائمة التشغيل'); updateControls(); return;
    }
    let index = (current + 1) % n;
    if (library.settings.shuffle && n > 1) {
      if (shuffled.size >= n) {
        if (fromEnd && library.settings.repeat === 'off') {
          wanted = false; audio.pause(); status('انتهت قائمة التشغيل'); updateControls(); return;
        }
        shuffled.clear(); shuffled.add(current);
      }
      const choices = Array.from({ length: n }, (_, i) => i).filter(i => i !== current && !shuffled.has(i));
      index = choices.length ? choices[Math.floor(Math.random() * choices.length)] : (current + 1) % n;
    }
    playIndex(index, true);
  }
  function prev() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const index = history.length ? history.pop() : (current - 1 + library.tracks.length) % library.tracks.length;
    if (Number.isFinite(index)) playIndex(index);
  }
  function toggle() {
    if (!library.tracks.length) { status('اختَر مجلدًا أو ملفات موسيقى أولًا'); return; }
    if (current < 0) { playIndex(0); return; }
    if (!audio.paused) { audio.pause(); wanted = false; status('متوقف مؤقتًا'); }
    else { wanted = true; audio.play().catch(() => status('تعذّر تشغيل الملف')); }
    updateControls();
  }
  async function load(kind) {
    try {
      const res = await (kind === 'folder' ? api.addFolder() : kind === 'files' ? api.addFiles() : kind === 'clear' ? api.clear() : api.refresh());
      apply(res);
      status(library.tracks.length ? 'القائمة جاهزة للتشغيل' : 'لا توجد ملفات صوتية مدعومة');
    } catch (e) { status('حدث خطأ أثناء قراءة الملفات'); }
  }
  el('lm-folder').addEventListener('click', () => load('folder'));
  el('lm-files').addEventListener('click', () => load('files'));
  el('lm-refresh').addEventListener('click', () => load('refresh'));
  el('lm-clear').addEventListener('click', () => {
    audio.pause(); audio.removeAttribute('src'); wanted = false; current = -1; history = []; shuffled.clear();
    el('lm-current').textContent = 'اختر أغنية'; load('clear');
  });
  el('lm-play').addEventListener('click', toggle);
  el('lm-next').addEventListener('click', () => next(false));
  el('lm-prev').addEventListener('click', prev);
  el('lm-search').addEventListener('input', renderList);
  el('lm-shuffle').addEventListener('click', async () => { library.settings.shuffle = !library.settings.shuffle; history = []; shuffled = new Set(current >= 0 ? [current] : []); apply(await api.config({ shuffle: library.settings.shuffle })); });
  el('lm-repeat').addEventListener('click', async () => {
    const modes = ['all', 'one', 'off'];
    library.settings.repeat = modes[(modes.indexOf(library.settings.repeat) + 1) % modes.length];
    apply(await api.config({ repeat: library.settings.repeat }));
  });
  el('lm-prayer').addEventListener('change', async (e) => { apply(await api.config({ pauseAtPrayer: e.target.checked })); });
  el('lm-volume').addEventListener('input', (e) => {
    library.settings.volume = Number(e.target.value); audio.volume = library.settings.volume / 100;
    el('lm-volume-text').textContent = `${library.settings.volume}%`;
  });
  el('lm-volume').addEventListener('change', async () => apply(await api.config({ volume: library.settings.volume })));
  el('lm-seek').addEventListener('input', (e) => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = audio.duration * Number(e.target.value) / 1000;
  });
  audio.addEventListener('timeupdate', () => {
    el('lm-position').textContent = clock(audio.currentTime);
    el('lm-seek').value = Number.isFinite(audio.duration) && audio.duration > 0 ? String(Math.round(audio.currentTime / audio.duration * 1000)) : '0';
  });
  audio.addEventListener('loadedmetadata', () => { el('lm-duration').textContent = clock(audio.duration); });
  audio.addEventListener('play', updateControls);
  audio.addEventListener('pause', updateControls);
  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('error', () => {
    if (!wanted) return;
    status('ملف غير مدعوم أو غير موجود');
    if (++failures < library.tracks.length) next(true);
    else { wanted = false; updateControls(); status('تعذّر تشغيل الملفات في القائمة'); }
  });
  window.addEventListener('island:adhan', () => {
    if (!audio.paused && library.settings.pauseAtPrayer) {
      wanted = false; audio.pause(); status('متوقفة لوقت الصلاة'); updateControls();
    }
  });
  api.snapshot().then(apply).catch(() => status('تعذّر تحميل القائمة'));
})();
