// Applies the local-music source extension to an unpacked Nova Island v1.6.0 checkout.
// Does NOT modify installed executable or weaken Nova's plugin signatures.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const addon = __dirname;
const expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (expected.name !== 'nova-island' || expected.version !== '1.6.0') {
  console.error('Expected a Nova Island v1.6.0 source checkout. Found', expected.name, expected.version);
  process.exit(1);
}
function patch(file, from, to, check) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, 'utf8');
  if (check && s.includes(check)) { console.log('Already applied:', file, check); return; }
  if (!s.includes(from)) throw new Error(`Missing insertion point in ${file}: ${from.slice(0,70)}`);
  s = s.replace(from, to);
  fs.writeFileSync(p, s, 'utf8');
  console.log('Patched', file);
}
function copy(file) {
  const src = path.join(addon, file), dst = path.join(root, file);
  fs.mkdirSync(path.dirname(dst), {recursive:true});
  fs.copyFileSync(src, dst);
  console.log('Copied', file);
}
const nav = `            <button role="tab" data-tab="localmusic" class="tab" aria-label="Local Music">
              <svg class="s" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>My Music</span>
            </button>
`;
const panel = `        <!-- LOCAL MUSIC (source extension): offline songs chosen by the user -->
        <section id="v-localmusic" class="view" role="tabpanel">
          <div class="lm-wrap">
            <div class="lm-main">
              <div class="lm-heading">🎵 موسيقاي على الجزيرة</div>
              <div id="lm-current" class="lm-current" dir="auto">اختر أغنية</div>
              <div id="lm-status" class="lm-meta">كل الملفات تظل على جهازك</div>
              <div class="lm-actions">
                <button id="lm-folder" class="lm-btn">📁 مجلد</button>
                <button id="lm-files" class="lm-btn">＋ ملفات</button>
                <button id="lm-refresh" class="lm-btn" title="إعادة فحص المجلد">↻</button>
                <button id="lm-clear" class="lm-btn" title="مسح القائمة دون حذف ملفات الموسيقى">مسح</button>
              </div>
              <div class="lm-player">
                <button id="lm-shuffle" class="lm-btn" title="تشغيل عشوائي">⤨</button>
                <button id="lm-prev" class="lm-btn" title="السابق">⏮</button>
                <button id="lm-play" class="lm-btn" title="تشغيل / إيقاف">▶</button>
                <button id="lm-next" class="lm-btn" title="التالي">⏭</button>
                <button id="lm-repeat" class="lm-btn" title="التكرار">🔁</button>
              </div>
              <div class="lm-seek"><span id="lm-position">0:00</span><input id="lm-seek" type="range" min="0" max="1000" value="0" aria-label="تقديم الأغنية"><span id="lm-duration">0:00</span></div>
              <div class="lm-bottom"><label>الصوت <input id="lm-volume" type="range" min="0" max="100" value="70" aria-label="الصوت"><span id="lm-volume-text">70%</span></label><label><input id="lm-prayer" type="checkbox"> إيقاف عند الأذان</label></div>
            </div>
            <div class="lm-side">
              <input id="lm-search" type="search" placeholder="ابحث في الأغاني…" aria-label="بحث في الأغاني">
              <div id="lm-list" class="lm-list"></div>
              <div id="lm-count" class="lm-count">0 أغنية</div>
              <div id="lm-sources" class="lm-meta">0 مجلد · 0 ملف مُضاف</div>
            </div>
          </div>
        </section>

`;
// Ensure exact insertion points before making any writes.
const anchors = [
  ['nova.js', "const plugins = require('./plugins');"],
  ['preload.js', "  onPlugins: on('plugins'),"],
  ['index.html', '<button role="tab" data-tab="radio"'],
  ['index.html', '        <!-- QURAN RADIO (plugin): its own tab, only while the plugin is installed and on -->'],
  ['index.html', '  <script src="views/radio.js"></script>'],
  ['index.html', '  <link rel="stylesheet" href="style.css">'],
  ['index.html', 'media-src https://*.radiojar.com'],
];
for (const [file, needle] of anchors) {
  const content = fs.readFileSync(path.join(root,file),'utf8');
  if (!content.includes(needle) && !content.includes('local-music.js')) throw new Error(`Unexpected ${file}: ${needle}`);
}
copy('local-music.js'); copy('views/local-music.js'); copy('local-music.css');
patch('nova.js', "const plugins = require('./plugins');", "const plugins = require('./plugins');\nrequire('./local-music').register();", "require('./local-music').register()");
patch('preload.js', "  onPlugins: on('plugins'),", `  localMusic: {
    snapshot: () => ipcRenderer.invoke('local-music-snapshot'),
    addFolder: () => ipcRenderer.invoke('local-music-add-folder'),
    addFiles: () => ipcRenderer.invoke('local-music-add-files'),
    refresh: () => ipcRenderer.invoke('local-music-refresh'),
    clear: () => ipcRenderer.invoke('local-music-clear'),
    config: (patch) => ipcRenderer.invoke('local-music-config', patch),
  },
  onPlugins: on('plugins'),`, '  localMusic: {');
patch('index.html', '            <button role="tab" data-tab="radio"', nav + '            <button role="tab" data-tab="radio"', 'data-tab="localmusic"');
patch('index.html', '        <!-- QURAN RADIO (plugin): its own tab, only while the plugin is installed and on -->', panel+'        <!-- QURAN RADIO (plugin): its own tab, only while the plugin is installed and on -->', 'id="v-localmusic"');
patch('index.html', '  <script src="views/radio.js"></script>', '  <script src="views/local-music.js"></script>\n  <script src="views/radio.js"></script>', 'src="views/local-music.js"');
patch('index.html', '  <link rel="stylesheet" href="style.css">', '  <link rel="stylesheet" href="style.css">\n  <link rel="stylesheet" href="local-music.css">', 'href="local-music.css"');
patch('index.html', 'media-src https://*.radiojar.com', 'media-src file: https://*.radiojar.com', 'media-src file:');
console.log('\n✓ Local Music source extension successfully integrated. Run npm ci && npm start.');
