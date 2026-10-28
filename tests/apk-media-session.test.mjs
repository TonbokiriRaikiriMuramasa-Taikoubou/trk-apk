// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/media-player-mode.js", import.meta.url), "utf8");
const match = source.match(/function installMediaSession\(\) \{[\s\S]*?\n\}/);
assert.ok(match, "test the real Media Session handler installer");
function setup(active = true) {
  const handlers = {}, calls = [], state = {active, reverse:false, loading:false};
  const video = {paused:true, ended:false, play() { calls.push("play"); this.paused = false; return Promise.resolve(); }, pause() { calls.push("pause"); this.paused = true; }};
  const core = {phase:"title", video, videoReady:true};
  const window = {Trk:{play:{resumeGame:() => calls.push("resume-game"), pauseGame:() => calls.push("pause-game")}}};
  const sandbox = {navigator:{mediaSession:{setActionHandler:(action, fn) => {handlers[action] = fn;}}}, core, window,
    mediaActive:() => state.active, playPause() { calls.push("toggle"); if (state.reverse || state.loading) { state.reverse = false; state.loading = false; video.paused = false; } else video.paused = !video.paused; },
    stepMedia:dir => calls.push(dir), sessionSong:dir => calls.push(`session:${dir}`), seekBy(){},
    stopReverse(resume) { calls.push(`stop-reverse:${resume}`); state.reverse = false; state.loading = false; if (resume) video.paused = false; }, renderMedia(){}, Number,
  };
  Object.defineProperty(sandbox, "reverseActive", {get:() => state.reverse});
  Object.defineProperty(sandbox, "reverseLoading", {get:() => state.loading});
  vm.runInNewContext(`${match[0]}\ninstallMediaSession();`, sandbox);
  return {handlers, calls, state, video, core, window};
}
test("system play and pause commands are idempotent in the media player", () => {
  const x = setup();
  x.handlers.play(); x.handlers.play(); assert.deepEqual(x.calls, ["toggle"]); assert.equal(x.video.paused, false);
  x.handlers.pause(); x.handlers.pause(); assert.deepEqual(x.calls, ["toggle", "toggle"]); assert.equal(x.video.paused, true);
  x.state.reverse = true; x.handlers.play(); assert.equal(x.state.reverse, true, "play must not stop reverse playback");
  x.handlers.pause(); assert.equal(x.state.reverse, false, "pause stops reverse playback");
  assert.equal(x.video.paused, true, "pause must not restart forward playback");
  assert.equal(x.calls.at(-1), "stop-reverse:false");
  x.handlers.pause(); assert.equal(x.calls.at(-1), "stop-reverse:false", "repeated pause remains stopped");
});
test("system commands route previous and next without confusing them with play", () => {
  const x = setup(); x.handlers.previoustrack(); x.handlers.nexttrack(); assert.deepEqual(x.calls, [-1, 1]);
  x.state.active = false; x.handlers.previoustrack(); x.handlers.nexttrack(); assert.deepEqual(x.calls.slice(-2), ["session:-1", "session:1"]);
  x.handlers.play(); x.handlers.play(); x.handlers.pause(); x.handlers.pause();
  assert.deepEqual(x.calls.slice(-2), ["play", "pause"]);
});
