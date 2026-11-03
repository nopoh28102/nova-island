'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {calculate, cleanRule, ruleMatches, privateIPv4, safeFileName} = require('./logic.cjs');

test('calculator handles precedence, parentheses, negatives, and malicious inputs', () => {
  assert.equal(calculate('=2 + 3 * (4-1)'), '11');
  assert.equal(calculate('-(2 + 3)/2'), '-2.5');
  assert.equal(calculate('7/0'), null);
  assert.equal(calculate('process.exit(1)'), null);
  assert.equal(calculate('1+2garbage'), null);
  assert.equal(calculate('1+'), null);
});
test('automations are validated against a fixed mode allowlist', () => {
  const rule = cleanRule({trigger:'app',value:'Code.exe',mode:'work',enabled:true});
  assert.equal(ruleMatches(rule,{app:'Code.exe'}), true);
  assert.equal(ruleMatches(rule,{app:'chrome.exe'}), false);
  assert.equal(cleanRule({trigger:'app',value:'',mode:'work'}), null);
  assert.equal(cleanRule({trigger:'time',value:'25:99',mode:'work'}), null);
  assert.equal(cleanRule({trigger:'time',value:'18:30',mode:'shutdown'}), null);
});
test('phone server admits private LAN addresses only', () => {
  for (const ip of ['192.168.1.5','10.3.2.4','172.16.0.1','172.31.4.2','127.0.0.1','::ffff:192.168.0.4']) assert.equal(privateIPv4(ip), true);
  for (const ip of ['8.8.8.8','172.32.1.2','169.254.1.1','::1','evil.example']) assert.equal(privateIPv4(ip), false);
});
test('incoming file names cannot escape the download directory', () => {
  assert.equal(safeFileName('../evil.exe'), '_evil.exe');
  assert.ok(!safeFileName('a\\b/c?.txt').includes('/'));
});
