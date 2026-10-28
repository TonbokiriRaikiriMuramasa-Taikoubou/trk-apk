// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("../js/core.js", import.meta.url), "utf8");
const synth = fs.readFileSync(new URL("../js/synth-mode.js", import.meta.url), "utf8");

test("missing synth preference defaults off, explicit legacy values are retained", () => {
  const match = core.match(/^\s*synthModeDisabled:\s*([^,]+),/m);
  assert.ok(match, "actual synth preference initializer exists");
  const evaluate = prefs => vm.runInNewContext(match[1], { prefs });
  assert.equal(evaluate({}), true);
  assert.equal(evaluate({ synthModeDisabled:false }), false);
  assert.equal(evaluate({ synthModeDisabled:true }), true);
  assert.equal(evaluate({ synthModeDisabled:null }), true);
  assert.match(core, /settings\.synthModeDisabled = true; settings\.synthModeFastStart = false/);
  assert.match(core, /out\.synthModeDisabled = settings\.synthModeDisabled/);
});

test("synth opt-in checkbox is translated and guarded at both launch boundaries", () => {
  assert.equal((synth.match(/instEnableOption:"/g) || []).length, 4);
  assert.match(synth, /synthEnableInput\.checked = !core\.settings\.synthModeDisabled/);
  assert.match(synth, /core\.settings\.synthModeDisabled = !synthEnableInput\.checked/);
  assert.match(synth, /function openSynth\(\)\s*\{\s*if \(core\.settings\.synthModeDisabled/);
  assert.ok(synth.includes("if (core.settings.synthModeDisabled) return;"));
});
