// Local Music for Nova Island: only files picked by the user, never network access.
// Source-code extension. The official v1.6.0 .nvp API cannot load executable plugins.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { ipcMain, dialog } = require('electron');
const settings = require('./settings');

const STORE = 'local-music.json';
const FORMATS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.webm']);
const MAX_TRACKS = 5000;
const MAX_DEPTH = 12;
let data = settings.load(STORE, {});
if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
data.folders = Array.isArray(data.folders) ? data.folders.filter(s => typeof s === 'string') : [];
data.files = Array.isArray(data.files) ? data.files.filter(s => typeof s === 'string') : [];
data.volume = Number.isFinite(data.volume) ? Math.max(0, Math.min(100, data.volume)) : 70;
data.shuffle = data.shuffle === true;
data.repeat = ['all', 'one', 'off'].includes(data.repeat) ? data.repeat : 'all';
data.pauseAtPrayer = data.pauseAtPrayer === true;

function audioFile(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || !FORMATS.has(path.extname(p).toLowerCase())) return false;
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function scan(folder, output, seen, depth = 0) {
  if (depth > MAX_DEPTH || output.length >= MAX_TRACKS) return;
  let entries;
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
  for (const ent of entries) {
    if (output.length >= MAX_TRACKS) break;
    // Symlinks are intentionally ignored (avoids loops and leaving the chosen directory).
    const file = path.join(folder, ent.name);
    if (ent.isDirectory()) scan(file, output, seen, depth + 1);
    else if (ent.isFile() && audioFile(file)) {
      const key = path.normalize(file).toLowerCase();
      if (!seen.has(key)) { seen.add(key); output.push(file); }
    }
  }
}
function collect() {
  const out = [], seen = new Set();
  for (const folder of data.folders) scan(folder, out, seen);
  for (const file of data.files) {
    if (out.length >= MAX_TRACKS) break;
    const key = path.normalize(file).toLowerCase();
    if (audioFile(file) && !seen.has(key)) { seen.add(key); out.push(file); }
  }
  return out;
}
let tracks = collect();
function save() { settings.save(STORE, data); }
function snapshot() {
  return {
    folders: data.folders.slice(),
    filesCount: data.files.length,
    tracks: tracks.map(p => ({ path: p, name: path.basename(p, path.extname(p)), url: pathToFileURL(p).href })),
    settings: { volume: data.volume, shuffle: data.shuffle, repeat: data.repeat, pauseAtPrayer: data.pauseAtPrayer },
    limit: MAX_TRACKS,
  };
}
function refresh() { tracks = collect(); return snapshot(); }
function uniquePush(arr, paths) {
  const keys = new Set(arr.map(p => path.normalize(p).toLowerCase()));
  for (const p of paths) {
    const k = path.normalize(p).toLowerCase();
    if (!keys.has(k)) { arr.push(p); keys.add(k); }
  }
}
function register() {
  ipcMain.handle('local-music-snapshot', () => snapshot());
  ipcMain.handle('local-music-add-folder', async () => {
    const picked = await dialog.showOpenDialog({ title: 'اختيار مجلد الأغاني', properties: ['openDirectory'] });
    if (!picked.canceled && picked.filePaths[0]) {
      const folder = picked.filePaths[0];
      try { if (fs.statSync(folder).isDirectory()) uniquePush(data.folders, [folder]); } catch {}
      save(); refresh();
    }
    return snapshot();
  });
  ipcMain.handle('local-music-add-files', async () => {
    const picked = await dialog.showOpenDialog({ title: 'اختيار ملفات موسيقى', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: [...FORMATS].map(x => x.slice(1)) }] });
    if (!picked.canceled) {
      uniquePush(data.files, picked.filePaths.filter(audioFile));
      save(); refresh();
    }
    return snapshot();
  });
  ipcMain.handle('local-music-refresh', () => refresh());
  ipcMain.handle('local-music-clear', () => {
    data.files = []; data.folders = []; save(); return refresh();
  });
  ipcMain.handle('local-music-remove', (_event, songPath) => {
    // Only remove a selected, existing track. Removing an item sourced from a folder
    // excludes it from this session only; rescan will add it again.
    if (typeof songPath !== 'string' || !tracks.includes(songPath)) return snapshot();
    data.files = data.files.filter(p => p !== songPath);
    const normalized = path.normalize(songPath).toLowerCase();
    tracks = tracks.filter(p => path.normalize(p).toLowerCase() !== normalized);
    save(); return snapshotFromTracks();
  });
  ipcMain.handle('local-music-config', (_event, patch) => {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return snapshot();
    if (typeof patch.volume === 'number' && Number.isFinite(patch.volume)) data.volume = Math.max(0, Math.min(100, Math.round(patch.volume)));
    if (typeof patch.shuffle === 'boolean') data.shuffle = patch.shuffle;
    if (['all', 'one', 'off'].includes(patch.repeat)) data.repeat = patch.repeat;
    if (typeof patch.pauseAtPrayer === 'boolean') data.pauseAtPrayer = patch.pauseAtPrayer;
    save(); return snapshot();
  });
}
function snapshotFromTracks() {
  // For a temporarily excluded folder song, keep the filtered runtime list until rescan.
  const base = snapshot();
  return base;
}
module.exports = { register };
