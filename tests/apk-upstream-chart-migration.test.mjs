// SPDX-License-Identifier: GPL-3.0-or-later
// APK intentionally keeps every valid legacy choice: old saves lack a reliable
// signal distinguishing an explicit choice from the former default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ROOT } from './helpers/browser-data.mjs';
const core = fs.readFileSync(`${ROOT}/js/core.js`, 'utf8');
const main = fs.readFileSync(`${ROOT}/js/main.js`, 'utf8');
const lines = core.match(/chartGenChosen:[^\n]*\n\s*chartGen:[^\n]*/)?.[0];
test('chart default is B for fresh/invalid settings and preserves all valid old selections', () => {
  assert.ok(lines);
  const resolve = prefs => vm.runInNewContext(`({${lines}\n})`, {prefs, pick:(v, items, fallback) => items.includes(v) ? v : fallback});
  assert.equal(resolve({}).chartGen, '4');
  assert.equal(resolve({chartGen:'invalid'}).chartGen, '4');
  for (const value of ['1','2','3','4']) {
    assert.equal(resolve({chartGen:value}).chartGen, value);
    assert.equal(resolve({chartGen:value,chartGenChosen:true}).chartGen, value);
  }
});
test('explicit selection is remembered and reset restores the new default', () => {
  assert.match(main, /core\.settings\.chartGenChosen = true/);
  assert.match(core, /settings\.chartGen = "4"; settings\.chartGenChosen = false/);
});
