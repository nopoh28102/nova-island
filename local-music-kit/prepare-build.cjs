// Makes the fork's build independent of the official application and update channel.
// Source base: NOVA-TECH-KIT/nova-island v1.6.0 (GPL-3.0-only).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const dir = __dirname;
const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (pkg.name !== 'nova-island' || pkg.version !== '1.6.0') {
  throw new Error('Expected Nova Island v1.6.0 source checkout');
}
if (!fs.existsSync(path.join(root, 'local-music.js'))) {
  throw new Error('Apply the local-music integration first');
}
function edit(name, fn) {
  const file = path.join(root, name);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error('No changes made to ' + name + ': upstream source likely changed');
  fs.writeFileSync(file, after);
}
function replaceRequired(src, find, replacement, label) {
  if (!src.includes(find)) throw new Error(`Missing ${label || find}`);
  return src.replaceAll(find, replacement);
}
edit('nova.js', src => {
  src = replaceRequired(src, "path.join(app.getPath('appData'), 'dynamic-nova')", "path.join(app.getPath('appData'), 'music-island-local')", 'user data separation');
  src = replaceRequired(src, "path.join(__dirname, 'build', 'icon.ico')", "path.join(__dirname, 'build', 'local-music.ico')", 'app icon');
  src = replaceRequired(src, '  migrateStartup();\n', '  // Do not import or edit the official application startup shortcuts.\n', 'startup migration');
  src = replaceRequired(src, 'updater.start(send, autoUpdate);', 'updater.start(send, false); // local fork: do not apply official updates', 'auto-update startup');
  src = replaceRequired(src, 'updater.setEnabled(autoUpdate);', 'updater.setEnabled(false); // local fork: avoid replacing modified build', 'auto-update toggle');
  src = src.replaceAll('Nova Island.lnk', 'Music Island Local.lnk');
  src = src.replaceAll("path.join(app.getPath('pictures'), 'Nova Island')", "path.join(app.getPath('pictures'), 'Music Island Local')");
  src = src.replaceAll("'Nova Island'", "'Music Island Local'");
  src = src.replaceAll('Nova Island setup -', 'Music Island Local setup -');
  src = src.replaceAll("tray.setToolTip('Nova Island')", "tray.setToolTip('Music Island Local')");
  return src;
});
edit('index.html', src => replaceRequired(src, '<title>Nova Island</title>', '<title>Music Island Local</title>', 'main title'));
edit('prefs/index.html', src => {
  src = replaceRequired(src, '<title>Nova Island Settings</title>', '<title>Music Island Local Settings</title>', 'settings title');
  src = src.replaceAll('Nova Island', 'Music Island Local');
  return src;
});
// Give the installer its own identifier, icon, filename and publishing target.
pkg.build.appId = 'dev.community.musicisland.local';
pkg.build.productName = 'Music Island Local';
pkg.build.win.executableName = 'Music Island Local';
pkg.build.win.icon = 'build/local-music.ico';
pkg.build.nsis.installerIcon = 'build/local-music.ico';
pkg.build.nsis.uninstallerIcon = 'build/local-music.ico';
pkg.build.nsis.shortcutName = 'Music Island Local';
pkg.build.nsis.artifactName = 'Music-Island-Local-Setup-${version}.${ext}';
pkg.build.portable.artifactName = 'Music-Island-Local-Portable-${version}.${ext}';
pkg.build.files = pkg.build.files.filter(x => x !== 'build/icon.png' && x !== 'build/icon.ico');
pkg.build.files.push('build/local-music.png', 'build/local-music.ico', '!build/icon.png', '!build/icon.ico');
delete pkg.build.publish;
pkg.description = 'An unofficial community build with local music playback (based on Nova Island)';
fs.copyFileSync(path.join(dir, 'build/local-music.ico'), path.join(root, 'build/local-music.ico'));
fs.copyFileSync(path.join(dir, 'build/local-music.png'), path.join(root, 'build/local-music.png'));
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Prepared Music Island Local: isolated userData, custom icons, no official updates.');
