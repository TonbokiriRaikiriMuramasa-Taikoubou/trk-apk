// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const media = read("js/media-player-mode.js"), coreSource = read("js/core.js");
const main = read("js/main.js"), html = read("index.html"), translations = read("js/i18n-options.js");
const restartFunction = media.match(/function restartForPrevious\(\) \{[\s\S]*?\n\}/)?.[0];
const stepFunction = media.match(/async function stepMedia\(dir\) \{[\s\S]*?\n\}/)?.[0];
const sessionFunction = media.match(/function installMediaSession\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(restartFunction && stepFunction && sessionFunction);

function setup(overrides = {}) {
  const state = { time:10, paused:false, ready:true, phase:"title", option:false, reverse:false, loading:false, blocked:false, allowed:true, seekThrows:false, ...overrides };
  const calls = [];
  const video = { paused:state.paused, play(){ calls.push("play"); this.paused = false; return Promise.resolve(); } };
  Object.defineProperty(video, "currentTime", { get:() => state.time, set:value => { if (state.seekThrows) throw new Error("seek failed"); state.time = value; calls.push(`seek:${value}`); } });
  const core = {phase:state.phase, settings:{previousAlwaysTrack:state.option}, videoReady:state.ready, video,
    audioSafety:{blocked:() => state.blocked, resume:() => calls.push("resume")}, refreshMediaSessionPosition:() => calls.push("position")};
  const handlers = {};
  const sandbox = {core, window:{TrkApkPip:{allowsPlaybackStart:() => state.allowed}, Trk:{play:{}}}, Number,
    navigator:{mediaSession:{setActionHandler:(name,fn) => {handlers[name] = fn;}}},
    stopReverse:() => { calls.push("stop-reverse"); state.reverse = false; state.loading = false; },
    saveMediaPosition:clear => calls.push(`save:${clear}`), renderMedia:() => calls.push("render"),
    nextMediaSong:dir => { calls.push(`pick:${dir}`); return {key:"previous"}; },
    playSong:async (song,fromStart) => { calls.push(`song:${song.key}:${fromStart}`); },
    showMediaStatus:status => calls.push(status), sessionSong:dir => calls.push(`session:${dir}`),
    mediaActive:() => state.active !== false, playPause(){}, seekBy(){},
  };
  Object.defineProperty(sandbox, "reverseActive", {get:() => state.reverse});
  Object.defineProperty(sandbox, "reverseLoading", {get:() => state.loading});
  vm.runInNewContext(`${restartFunction}\n${stepFunction}\n${sessionFunction}\ninstallMediaSession();`, sandbox);
  return {state,core,video,calls,handlers,sandbox};
}

test("previous restarts after three seconds, then moves to the prior track at or before the threshold", async () => {
  const x = setup();
  await x.sandbox.stepMedia(-1);
  assert.equal(x.state.time, 0);
  assert.deepEqual(x.calls, ["seek:0", "save:true", "position", "render"]);
  await x.sandbox.stepMedia(-1);
  assert.deepEqual(x.calls.slice(-2), ["pick:-1", "song:previous:true"]);
  for (const time of [0, 2.999, 3]) assert.equal(setup({time}).sandbox.restartForPrevious(), false);
  assert.equal(setup({time:3.001}).sandbox.restartForPrevious(), true);
  assert.equal(setup({time:NaN}).sandbox.restartForPrevious(), false);
});

test("always-previous, unloaded media and gameplay do not seek the current track", async () => {
  for (const state of [{option:true}, {ready:false}, {phase:"playing"}, {phase:"paused"}, {phase:"ended"}]) {
    const x=setup(state); assert.equal(x.sandbox.restartForPrevious(), false); assert.equal(x.state.time, 10);
  }
  const x=setup({option:true}); await x.sandbox.stepMedia(-1);
  assert.deepEqual(x.calls, ["pick:-1", "song:previous:true"]);
  const y=setup(); await y.sandbox.stepMedia(1);
  assert.deepEqual(y.calls, ["pick:1", "song:previous:true"], "next is unchanged");
});

test("restart preserves a normal paused or playing state; a failed seek never skips a track", async () => {
  for (const paused of [true,false]) {
    const x=setup({paused}); await x.sandbox.stepMedia(-1);
    assert.equal(x.video.paused, paused); assert.ok(!x.calls.includes("play"));
  }
  const x=setup({seekThrows:true}); await x.sandbox.stepMedia(-1);
  assert.equal(x.state.time,10); assert.deepEqual(x.calls, [], "do not fall through to a different song");
});

test("reverse playback is stopped and only explicitly resumed when output and background policy allow it", async () => {
  const x=setup({reverse:true,paused:true}); await x.sandbox.stepMedia(-1);
  assert.deepEqual(x.calls, ["seek:0", "stop-reverse", "save:true", "position", "render", "play"]);
  for (const state of [{reverse:true,loading:true}, {reverse:true,blocked:true}, {reverse:true,allowed:false}]) {
    const y=setup({...state,paused:true}); await y.sandbox.stepMedia(-1);
    assert.ok(y.calls.includes("stop-reverse")); assert.ok(!y.calls.includes("play"));
  }
});

test("system previous follows the same rule for an open player and a title preview", async () => {
  const x=setup(); await x.handlers.previoustrack(); assert.equal(x.state.time, 0);
  await x.handlers.previoustrack(); assert.deepEqual(x.calls.slice(-3), ["resume", "pick:-1", "song:previous:true"]);
  const y=setup({active:false}); y.handlers.previoustrack(); assert.equal(y.state.time, 0);
  y.handlers.previoustrack(); assert.deepEqual(y.calls.slice(-2), ["resume", "session:-1"]);
  const z=setup({active:false,phase:"playing"}); z.handlers.previoustrack();
  assert.deepEqual(z.calls, ["resume", "session:-1"], "game is not rewound without resetting its chart");
  const denied=setup({allowed:false}); denied.handlers.previoustrack(); assert.deepEqual(denied.calls, []);
});

test("mystery setting starts off, resets, persists through the standard settings wiring and has four translations", () => {
  const section=html.split('data-i18n="secMystery"')[1].split('</details>')[0];
  assert.match(section, /id="previousAlwaysTrack" type="checkbox"/);
  assert.match(section, /data-i18n="previousAlwaysTrackHint"/);
  assert.match(coreSource, /previousAlwaysTrack: prefs\.previousAlwaysTrack === true/);
  assert.match(coreSource, /settings\.previousAlwaysTrack = false;/);
  assert.match(coreSource, /JSON\.stringify\(prefsForSave\(\)\)/);
  assert.match(main, /\["previousAlwaysTrack", "previousAlwaysTrack"\]/);
  assert.match(main, /core\.\$\("previousAlwaysTrack"\)\.checked = !!core\.settings\.previousAlwaysTrack/);
  for (const key of ["previousAlwaysTrack", "previousAlwaysTrackHint"]) assert.equal(translations.split(`\n  ${key}:`).length - 1,4);
});

test("player controls, keyboard, banner and TV previous share the restart decision", () => {
  assert.match(media, /prev\.addEventListener\("click", \(\) => stepMedia\(-1\)\)/);
  assert.match(media, /e\.code === "KeyP"[^\n]*stepMedia\(-1\)/);
  assert.match(media, /window\.TrkMediaPlayer\.restartForPrevious = restartForPrevious/);
  for (const path of ["js/library.js", "js/tv-dock.js"]) {
    assert.match(read(path), /dir < 0 && window\.TrkMediaPlayer\?\.restartForPrevious\?\.\(\)/);
  }
  assert.match(read("sw.js"), /const CACHE = "trk-v2026\.10\.29-trk219"/);
});
