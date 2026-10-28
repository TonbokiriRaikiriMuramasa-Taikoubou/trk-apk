// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source=fs.readFileSync(new URL("../js/media-player-mode.js", import.meta.url),"utf8");
const body=["mediaSessionIsPlaying","stopReverseAudio","stopReverse","stopReverseWhenBackgroundDisallowed","startReverseAt"].map(name => {
  const match=source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `real ${name} exists`); return match[0];
}).join("\n");
const tick=() => new Promise(resolve => setImmediate(resolve));
function setup() {
  const waiters=[], calls=[];
  const ac={state:"suspended", destination:{}, resume(){return new Promise((resolve,reject) => {resolve.reject=reject; waiters.push(resolve);});},
    createBufferSource(){calls.push("source"); return {playbackRate:{value:1}, connect(){}, start(){calls.push("start");}, stop(){calls.push("stop");}};},
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}};
  const video={paused:false,muted:false,duration:120,currentTime:30,playbackRate:1,pause(){this.paused=true;},play(){this.paused=false;calls.push("play"); return Promise.resolve();}};
  const states=[];
  const sandbox={core:{video,videoReady:true,settings:{musicVolume:0.5}, syncMediaSessionPlaybackState(){states.push(sandbox.core.mediaSessionIsPlaying() ? "playing" : "paused");}, refreshMediaSessionPosition(){}}, document:{hidden:false}, window:{Trk:{media:{getAC:() => ac}}},
    reverseAudioForCurrentSong:async () => ({duration:120}), getAC(){}, setInterval(){calls.push("interval"); return 1;}, clearInterval(){},
    renderMedia(){}, reverseTick(){}, reverseClockSeconds:() => 0, Number, Math};
  vm.runInNewContext(`let reverseActive=false, reverseLoading=false, reverseTimer=0, reverseSource=null, reverseGain=null, reverseAttempt=0, reverseVideoMuted=false, reverseBuffer=null, reverseBufferKey='', reverseHasAudio=false, reverseStartAt=0, reverseClockAt=0, mediaRate=1;\n${body}\ncore.mediaSessionIsPlaying=mediaSessionIsPlaying; this.startReverseAt=startReverseAt; this.stopReverse=stopReverse; this.stopReverseWhenBackgroundDisallowed=stopReverseWhenBackgroundDisallowed;`,sandbox);
  return {sandbox, video, calls, waiters, states};
}
test("reverse session is paused while loading, playing when active and paused when stopped", async () => {
  const x=setup(); const p=x.sandbox.startReverseAt(30); await tick();
  assert.equal(x.states.at(-1),"paused"); x.waiters[1](); await p;
  assert.equal(x.states.at(-1),"playing");
  // The video pause event may arrive after reverse loading has completed.
  x.sandbox.core.syncMediaSessionPlaybackState(); assert.equal(x.states.at(-1),"playing");
  x.sandbox.stopReverse(false,true);
  assert.equal(x.states.at(-1),"paused");
});
test("pause during asynchronous AudioContext resume cannot restart reverse playback", async () => {
  const x=setup(); const first=x.sandbox.startReverseAt(30); await tick();
  assert.equal(x.waiters.length,2); x.sandbox.stopReverse(false,true); x.waiters[1](); await first;
  assert.deepEqual(x.calls,[]); assert.equal(x.video.paused,true);
});
test("Android background policy stops reverse without starting forward", async () => {
  const x=setup(); const first=x.sandbox.startReverseAt(30); await tick();
  x.sandbox.window.TrkApkPip={allowsPlaybackStart:() => false}; x.sandbox.document.hidden=true;
  x.sandbox.stopReverseWhenBackgroundDisallowed(); x.waiters[1](); await first;
  assert.deepEqual(x.calls,[]); assert.equal(x.video.paused,true);
});
test("an allowed PiP or antenna transition does not cancel reverse", async () => {
  const x=setup(); const first=x.sandbox.startReverseAt(30); await tick();
  x.sandbox.window.TrkApkPip={allowsPlaybackStart:() => true}; x.sandbox.document.hidden=true;
  x.sandbox.stopReverseWhenBackgroundDisallowed(); x.waiters[1](); await first;
  assert.deepEqual(x.calls,["source","start","interval"]);
});
test("a stale AudioContext rejection cannot stop the newer reverse source", async () => {
  const x=setup(); const first=x.sandbox.startReverseAt(30); await tick();
  x.sandbox.stopReverse(false,true); const second=x.sandbox.startReverseAt(50); await tick();
  x.waiters[3](); await second; assert.deepEqual(x.calls,["source","start","interval"]);
  x.waiters[1].reject(new Error("old attempt failed")); await first;
  assert.deepEqual(x.calls,["source","start","interval"],"stale failure must not stop current audio");
});
test("a cancelled reverse attempt cannot take over a newer reverse attempt", async () => {
  const x=setup(); const first=x.sandbox.startReverseAt(30); await tick();
  x.sandbox.stopReverse(false,true);
  const second=x.sandbox.startReverseAt(50); await tick();
  assert.equal(x.waiters.length,4); x.waiters[1](); await first;
  assert.deepEqual(x.calls,[],"stale attempt must not create audio");
  x.waiters[3](); await second; assert.deepEqual(x.calls,["source","start","interval"]);
});
