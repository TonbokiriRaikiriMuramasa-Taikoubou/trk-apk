// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const script = fs.readFileSync(new URL("../js/apk-background.js", import.meta.url), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(saved) {
  const dom = new JSDOM('<!doctype html><body><div id="mediaPlayerMode"><div class="mediaOptions"></div></div><video id="video"></video></body>', {url:"https://localhost/", runScripts:"outside-only", pretendToBeVisual:true});
  const w = dom.window, d = w.document, calls = [], hooks = {}, video = d.getElementById("video");
  let playing = true, width = 640, open = true;
  Object.defineProperty(video, "paused", {get:() => !playing});
  Object.defineProperty(video, "ended", {get:() => false});
  Object.defineProperty(video, "videoWidth", {get:() => width});
  video.pause = () => { playing = false; calls.push("pause"); };
  const core = {phase:"title",settings:{language:"ja",fxAntenna:false}, video, videoReady:true, currentSong:{title:"Song"}, on:(n,fn) => {hooks[n] = fn;}};
  w.Trk = {core}; w.TrkMediaPlayer = {isOpen:() => open};
  w.Capacitor = {isNativePlatform:() => true, Plugins:{TrkDevice:{setPipEligible:async ({enabled}) => {calls.push(enabled); return {available:true, eligible:enabled};}}}};
  if (saved) for (const [key,value] of Object.entries(saved)) w.localStorage.setItem(key,value);
  w.eval(script); d.dispatchEvent(new w.Event("DOMContentLoaded"));
  return {w,d,video,core,calls,hooks, setWidth:n=>{width=n;video.dispatchEvent(new w.Event("loadedmetadata"));}, setOpen:v=>{open=v; d.getElementById("mediaPlayerMode").hidden = !v;}};
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
test("unsupported or blocked PiP is not treated as an active background mode", async () => {
  const x=setup(); await tick();
  x.w.Capacitor.Plugins.TrkDevice.setPipEligible = async () => ({available:false,eligible:false});
  x.d.getElementById("apkAutoPip").click(); await tick();
  assert.equal(x.w.TrkApkPip.shouldKeepForTransition(),false);
  assert.equal(x.d.querySelector('.apk-pip-options [role="status"]').hidden,false);
  x.w.close();
});
