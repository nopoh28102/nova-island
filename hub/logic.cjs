'use strict';

// Pure validation and math helpers shared by Command Center, Automation and Phone Connect.
const net = require('node:net');
function calculate(input) {
  const s = String(input || '').trim().replace(/^=/, '');
  if (s.length > 96 || !s || !/^[\d\s.+*/()%\-]+$/.test(s)) return null;
  let i = 0;
  const ws = () => { while (s[i] === ' ') i++; };
  function number() {
    ws();
    if (s[i] === '+' || s[i] === '-') {
      const sign = s[i++] === '-' ? -1 : 1;
      return sign * number();
    }
    if (s[i] === '(') {
      i++; const n = expression(); ws();
      if (s[i++] !== ')') throw Error('parenthesis');
      return n;
    }
    const m = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) throw Error('number');
    i += m[0].length;
    return Number(m[0]);
  }
  function term() {
    let n = number(); ws();
    while ('*/%'.includes(s[i]) && i < s.length) {
      const op = s[i++], r = number();
      n = op === '*' ? n * r : op === '/' ? n / r : n % r;
      ws();
    }
    return n;
  }
  function expression() {
    let n = term(); ws();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++], r = term();
      n = op === '+' ? n + r : n - r; ws();
    }
    return n;
  }
  try {
    const n = expression(); ws();
    if (i !== s.length || !Number.isFinite(n) || Math.abs(n) > 1e14) return null;
    return String(Number(n.toFixed(10)));
  } catch { return null; }
}
const MODES = Object.freeze(['normal', 'work', 'focus', 'gaming']);
function cleanRule(input) {
  if (!input || typeof input !== 'object' || !['app', 'time'].includes(input.trigger) || !MODES.includes(input.mode)) return null;
  const value = String(input.value || '').trim();
  if (input.trigger === 'app' ? !/^[\w .-]{2,50}$/.test(value) : !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return { id: /^[a-f0-9]{12}$/.test(input.id || '') ? input.id : '',
    trigger: input.trigger, value, mode: input.mode, enabled: input.enabled !== false };
}
function ruleMatches(rule, context) {
  if (!rule || !rule.enabled) return false;
  if (rule.trigger === 'app') {
    return typeof context.app === 'string' && context.app.toLowerCase().includes(rule.value.toLowerCase());
  }
  return rule.trigger === 'time' && context.time === rule.value;
}
function privateIPv4(ip) {
  if (typeof ip !== 'string') return false;
  const cleaned = ip.replace(/^::ffff:/i, '');
  if (net.isIP(cleaned) !== 4) return false;
  const n = cleaned.split('.').map(Number);
  return n[0] === 10 || n[0] === 127 || (n[0] === 192 && n[1] === 168) ||
    (n[0] === 172 && n[1] >= 16 && n[1] <= 31);
}
function safeFileName(value) {
  return String(value || '').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'phone-file';
}
module.exports = { calculate, cleanRule, ruleMatches, privateIPv4, safeFileName, MODES };
