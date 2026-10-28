// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const script = fs.readFileSync(new URL("../js/apk-background.js", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(saved) {
  const dom = new JSDOM('<!doctype html><body><div id="mediaPlayerMode"><div class="mediaOptions"></div></div><video id="video"></video></body>', {url:"https://localhost/", runScripts:"outside-only", pretendToBeVisual:true});
  const w = dom.window, d = w.document, calls = [], payloads = [], hooks = {}, video = d.getElementById("video");
  let playing = true, width = 640, height = 360, open = true;
  Object.defineProperty(video, "paused", {get:() => !playing});
  Object.defineProperty(video, "ended", {get:() => false});
  Object.defineProperty(video, "videoWidth", {get:() => width});
  Object.defineProperty(video, "videoHeight", {get:() => height});
  video.pause = () => { playing = false; calls.push("pause"); };
  const core = {phase:"title",settings:{language:"ja",fxAntenna:false}, video, videoReady:true, currentSong:{title:"Song"}, on:(n,fn) => {hooks[n] = fn;}};
  w.Trk = {core}; w.TrkMediaPlayer = {isOpen:() => open};
  w.Capacitor = {isNativePlatform:() => true, Plugins:{TrkDevice:{setPipEligible:async payload => {const {enabled} = payload; calls.push(enabled); payloads.push(payload); return {available:true, eligible:enabled};}}}};
  if (saved) for (const [key,value] of Object.entries(saved)) w.localStorage.setItem(key,value);
  w.eval(script); d.dispatchEvent(new w.Event("DOMContentLoaded"));
  return {w,d,video,core,calls,payloads,hooks, setWidth:n=>{width=n;video.dispatchEvent(new w.Event("loadedmetadata"));}, setSize:(w0,h0,event="loadedmetadata")=>{width=w0;height=h0;video.dispatchEvent(new w.Event(event));}, setOpen:v=>{open=v; d.getElementById("mediaPlayerMode").hidden = !v;}};
}
test("PiP defaults off, supports video and optional audio, and remembers both choices", async () => {
  const x=setup(); await tick();
  const auto=x.d.getElementById("apkAutoPip"), audio=x.d.getElementById("apkPipAudio");
  assert.equal(auto.checked,false); assert.equal(audio.disabled,true); assert.equal(x.calls.at(-1),false);
  auto.click(); await tick(); assert.equal(x.calls.at(-1),true); assert.equal(x.w.localStorage.getItem("trk_apk_pip_mode_v1"),"video");
  x.setWidth(0); await tick(); assert.equal(x.calls.at(-1),false, "audio alone is not eligible by default");
  audio.click(); await tick(); assert.equal(x.calls.at(-1),true); assert.equal(x.w.localStorage.getItem("trk_apk_pip_mode_v1"),"all");
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  assert.equal(x.d.getElementById("apkPipView").hidden,false); assert.equal(x.d.querySelector("#apkPipView strong").textContent,"Song");
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false}));
  auto.click(); await tick(); assert.equal(x.calls.at(-1),false); assert.equal(audio.checked,true);
  auto.click(); await tick(); assert.equal(x.calls.at(-1),true); assert.equal(x.w.localStorage.getItem("trk_apk_pip_mode_v1"),"all");
  x.setOpen(false); await tick(); assert.equal(x.calls.at(-1),true, "player can close while playback continues");
  x.core.phase = "playing"; x.hooks.phase(); await tick(); assert.equal(x.calls.at(-1),false, "gameplay never enters media PiP"); x.w.close();
});
test("PiP sends the current video dimensions, including resize and audio fallback", async () => {
  const x=setup({trk_apk_pip_mode_v1:"all"}); await tick();
  x.setSize(1080,1920); await tick();
  assert.deepEqual({...x.payloads.at(-1)}, {enabled:true,videoWidth:1080,videoHeight:1920});
  x.setSize(1920,1080,"resize"); await tick();
  assert.deepEqual({...x.payloads.at(-1)}, {enabled:true,videoWidth:1920,videoHeight:1080});
  x.setSize(0,0); await tick();
  assert.deepEqual({...x.payloads.at(-1)}, {enabled:true,videoWidth:0,videoHeight:0});
  x.w.close();
});

test("queued PiP updates retain their dimensions when native calls are slow", async () => {
  const x=setup({trk_apk_pip_mode_v1:"all"}); await tick();
  const received=[]; let release;
  x.w.Capacitor.Plugins.TrkDevice.setPipEligible = payload => {
    received.push({...payload});
    if (received.length === 1) return new Promise(resolve => {release=() => resolve({available:true,eligible:true});});
    return Promise.resolve({available:true,eligible:true});
  };
  x.setSize(1080,1920); await tick();
  x.setSize(1920,1080); await tick(); assert.equal(received.length,1);
  release(); await tick();
  assert.deepEqual(received.map(p => [p.videoWidth,p.videoHeight]), [[1080,1920],[1920,1080]]);
  x.w.close();
});

test("PiP shows actual video instead of the audio card and does not run on the web", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  assert.equal(x.d.body.classList.contains("apk-pip-video"),true); assert.equal(x.d.getElementById("apkPipView").hidden,true);
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false})); assert.equal(x.d.body.classList.contains("apk-in-pip"),false); x.w.close();
  const dom=new JSDOM('<!doctype html><body></body>',{url:"https://localhost/",runScripts:"outside-only"});
  dom.window.Trk={core:{}}; dom.window.eval(script); assert.equal(dom.window.TrkApkPip,undefined); dom.window.close();
});
test("PiP denial falls back to pause when the antenna is off", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  Object.defineProperty(x.d, "hidden", {value:true, configurable:true});
  let timer;
  x.w.setTimeout = fn => { timer=fn; return 1; };
  assert.equal(x.w.TrkApkPip.shouldKeepForTransition(),true);
  x.w.TrkApkPip.checkTransition(); timer(); assert.ok(x.calls.includes("pause"));
  x.w.close();
});
test("a previous PiP transition timer cannot pause a later transition", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  let hidden=true, next=0;
  const scheduled=new Map(), cancelled=[];
  Object.defineProperty(x.d, "hidden", {get:() => hidden, configurable:true});
  x.w.setTimeout = (fn, ms) => { assert.equal(ms,1500); scheduled.set(++next,fn); return next; };
  x.w.clearTimeout = id => { cancelled.push(id); };
  x.w.TrkApkPip.checkTransition();
  hidden=false; x.d.dispatchEvent(new x.w.Event("visibilitychange"));
  hidden=true; x.w.TrkApkPip.checkTransition();
  assert.ok(cancelled.includes(1), "returning to foreground cancels the old timeout");
  scheduled.get(1)(); // A queued stale callback must also be harmless.
  assert.equal(x.calls.includes("pause"),false);
  scheduled.get(2)(); assert.equal(x.calls.includes("pause"),true, "current failed transition pauses");
  x.w.close();
});

test("PiP entry invalidates the timeout even after a rapid restore and re-entry", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  let hidden=true, next=0; const scheduled=new Map();
  Object.defineProperty(x.d, "hidden", {get:() => hidden, configurable:true});
  x.w.setTimeout = fn => {scheduled.set(++next,fn); return next;};
  x.w.clearTimeout = () => {};
  x.w.TrkApkPip.checkTransition();
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  hidden=false; x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false}));
  hidden=true; x.w.TrkApkPip.checkTransition();
  scheduled.get(1)(); assert.equal(x.calls.includes("pause"),false);
  scheduled.get(2)(); assert.equal(x.calls.includes("pause"),true);
  x.w.close();
});

test("antenna ON and successful PiP entry avoid the fallback pause", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  Object.defineProperty(x.d, "hidden", {value:true, configurable:true});
  let timer; x.w.setTimeout = fn => {timer=fn; return 1;}; x.w.clearTimeout = () => {};
  x.w.TrkApkPip.checkTransition(); x.core.settings.fxAntenna=true; timer();
  assert.equal(x.calls.includes("pause"),false, "antenna enables background attempt");
  x.core.settings.fxAntenna=false; x.w.TrkApkPip.checkTransition();
  const queued=timer;
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  queued(); assert.equal(x.calls.includes("pause"),false, "active PiP must not be paused by old fallback");
  x.w.close();
});

test("an inactive PiP callback does not interrupt antenna background playback", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  x.core.settings.fxAntenna=true;
  Object.defineProperty(x.d, "hidden", {value:true, configurable:true});
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false}));
  assert.equal(x.calls.includes("pause"),false, "no PiP session was dismissed");
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false}));
  assert.equal(x.calls.filter(call => call === "pause").length,1, "dismissing an active PiP still pauses");
  x.w.close();
});

test("Android remote playback policy allows foreground, antenna or active PiP", async () => {
  const x=setup({trk_apk_pip_mode_v1:"video"}); await tick();
  let hidden=false;
  Object.defineProperty(x.d, "hidden", {get:() => hidden, configurable:true});
  assert.equal(x.w.TrkApkPip.allowsPlaybackStart(),true, "foreground is allowed");
  hidden=true; assert.equal(x.w.TrkApkPip.allowsPlaybackStart(),false, "eligibility alone is not PiP");
  x.core.settings.fxAntenna=true; assert.equal(x.w.TrkApkPip.allowsPlaybackStart(),true);
  x.core.settings.fxAntenna=false;
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:true}));
  x.video.pause(); assert.equal(x.w.TrkApkPip.allowsPlaybackStart(),true, "paused PiP may resume");
  x.w.dispatchEvent(new x.w.CustomEvent("trkApkPipChanged",{detail:false}));
  assert.equal(x.w.TrkApkPip.allowsPlaybackStart(),false);
  x.w.close();
});

test("unsupported or blocked PiP is not treated as an active background mode", async () => {
  const x=setup(); await tick();
  x.w.Capacitor.Plugins.TrkDevice.setPipEligible = async () => ({available:false,eligible:false});
  x.d.getElementById("apkAutoPip").click(); await tick();
  assert.equal(x.w.TrkApkPip.shouldKeepForTransition(),false);
  assert.equal(x.d.querySelector('.apk-pip-options [role="status"]').hidden,false);
  x.w.close();
});
