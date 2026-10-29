// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/media-player-mode.js", import.meta.url), "utf8");
const match = source.match(/function installMediaSession\(\) \{[\s\S]*?\n\}/);
assert.ok(match);
function setup(policy) {
  const handlers = {}, calls = [], state = {active:true};
  const core = {phase:"title", videoReady:true, video:{paused:true, ended:false, play(){ calls.push("play"); this.paused=false; return Promise.resolve(); }, pause(){ calls.push("pause"); this.paused=true; }}};
  const window = {Trk:{play:{resumeGame(){calls.push("resume-game");},pauseGame(){calls.push("pause-game");}}}};
  if (policy) window.TrkApkPip = {allowsPlaybackStart:policy};
  const sandbox = {window, core, navigator:{mediaSession:{setActionHandler:(name,fn) => {handlers[name]=fn;}}},
    mediaActive:() => state.active, reverseActive:false, reverseLoading:false,
    playPause(){calls.push("toggle"); core.video.paused=!core.video.paused;}, stepMedia:dir => calls.push(dir),
    sessionSong:dir => calls.push(`session:${dir}`), restartForPrevious:() => false, seekBy:dir => calls.push(`seek:${dir}`), stopReverse(){}, renderMedia(){}, Number};
  vm.runInNewContext(`${match[0]}\ninstallMediaSession();`, sandbox);
  return {handlers,calls,state,core,window};
}
test("Android background policy blocks remote starts and track changes but not pause or seek", () => {
  const x=setup(() => false);
  x.handlers.play(); x.handlers.previoustrack(); x.handlers.nexttrack();
  x.state.active=false; x.handlers.play(); x.handlers.previoustrack(); x.handlers.nexttrack();
  x.core.phase="paused"; x.handlers.play();
  assert.deepEqual(x.calls, []);
  x.handlers.seekforward({seekOffset:15}); x.core.video.paused=false; x.handlers.pause();
  assert.deepEqual(x.calls,["seek:15","pause"]);
});
test("allowed or non-Android playback keeps existing command routes", () => {
  for (const policy of [() => true, null]) {
    const x=setup(policy); x.handlers.play(); x.handlers.nexttrack(); x.handlers.previoustrack();
    assert.deepEqual(x.calls,["toggle",1,-1]);
    x.state.active=false; x.core.video.paused=true; x.handlers.play(); x.handlers.nexttrack();
    assert.deepEqual(x.calls.slice(-2),["play","session:1"]);
  }
});
