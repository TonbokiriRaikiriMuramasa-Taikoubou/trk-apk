// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
const code = fs.readFileSync(new URL("../js/apk-native.js", import.meta.url), "utf8");
function setup(native = true) {
  const dom = new JSDOM(`<!doctype html><body class="apk-shell" data-apk-view="library">
    <div id="welcomeBox" role="dialog" aria-modal="true" hidden><p data-i18n="welcomeLead"></p><button id="welcomeCloseBtn"></button></div>
    <section id="studyRoom" hidden><div id="studySettings" hidden><button id="studySettingsCloseBtn"></button></div><div id="studyHelp" hidden><button id="studyHelpCloseBtn"></button></div></section>
    <div id="synthMode" hidden></div><div id="mediaPlayerMode" hidden><div class="mediaDialog" role="dialog" aria-modal="true"></div><div class="mediaWall" role="dialog" aria-modal="true" hidden></div></div>
    <nav class="apk-nav"><button data-destination="library"></button></nav></body>`, { url:"https://localhost/", runScripts:"outside-only" });
  const { window:w } = dom, d = w.document, calls = [], hooks = {};
  const core = { settings:{language:"ja"}, phase:"title", screen:"select", on(name, fn) { hooks[name] = fn; }, closeSettings() { calls.push("settings"); core.screen = "select"; } };
  let callback, isStudy = false, max = false, media = false;
  w.Trk = { core, play:{ pauseGame() { calls.push("pause"); core.phase = "paused"; }, toTitle() { calls.push("title"); core.phase = "title"; } } };
  const app = { addListener(name, fn) { calls.push(name); callback = fn; return Promise.resolve({ remove(){} }); }, exitApp() { calls.push("exit"); return Promise.resolve(); } };
  w.Capacitor = { isNativePlatform:() => native, Plugins:{App:app} };
  w.TrkVideoMax = { isOpen:() => max, close() { calls.push("max"); max = false; } };
  w.TrkStudyRoom = { isOpen:() => isStudy, close() { calls.push("study"); isStudy = false; d.getElementById("studyRoom").hidden = true; } };
  w.TrkMediaPlayer = { isOpen:() => media, close() { calls.push("media"); media = false; } };
  w.TrkApkReturnToPlayer = () => { calls.push("player"); d.body.classList.remove("apk-media-effects"); };
  w._trkCloseSynth = () => { calls.push("synth"); d.getElementById("synthMode").hidden = true; };
  w.confirm = text => { calls.push("confirm:" + text); return true; };
  d.getElementById("welcomeCloseBtn").onclick = () => { calls.push("welcome"); d.getElementById("welcomeBox").hidden = true; };
  for (const id of ["studySettings", "studyHelp"]) d.getElementById(id + "CloseBtn").onclick = () => { calls.push(id); d.getElementById(id).hidden = true; };
  d.querySelector('[data-destination="library"]').onclick = () => { calls.push("library"); d.body.dataset.apkView = "library"; };
  w.addEventListener("keydown", e => { if (e.code === "Escape") { calls.push("escape"); media = false; } });
  w.eval(code);
  return { w, d, core, calls, hooks, back:() => callback(), setMax:v => {max=v;}, setStudy:v => {isStudy=v; d.getElementById("studyRoom").hidden = !v;}, setMedia:v => {media=v; d.getElementById("mediaPlayerMode").hidden = !v;} };
}
test("native Back closes overlays, settings, effects, player, game and only then asks to exit", () => {
  const x = setup(); const { d, core, calls, back } = x;
  assert.equal(calls.shift(), "backButton");
  x.setMax(true); back(); assert.equal(calls.pop(), "max");
  const ask = d.createElement("div"); ask.dataset.trkAsk = "factory"; ask.onclick = () => { calls.push("cancel"); ask.remove(); }; d.body.append(ask); back(); assert.equal(calls.pop(), "cancel");
  const playlist = d.createElement("div"); playlist.className = "plOverlay"; playlist.onclick = () => { calls.push("playlist"); playlist.remove(); }; d.body.append(playlist); back(); assert.equal(calls.pop(), "playlist");
  d.getElementById("welcomeBox").hidden = false; back(); assert.equal(calls.pop(), "welcome");
  d.getElementById("synthMode").hidden = false; back(); assert.equal(calls.pop(), "synth");
  x.setStudy(true); d.getElementById("studySettings").hidden = false; back(); assert.equal(calls.pop(), "studySettings");
  back(); assert.equal(calls.pop(), "study");
  core.screen = "settings"; back(); assert.equal(calls.pop(), "settings");
  x.setMedia(true); d.body.classList.add("apk-media-effects"); back(); assert.equal(calls.pop(), "player"); back(); assert.equal(calls.pop(), "escape");
  d.getElementById("mediaPlayerMode").hidden = true; d.body.dataset.apkView = "effects"; back(); assert.equal(calls.pop(), "library");
  core.phase = "playing"; back(); assert.equal(calls.pop(), "pause"); assert.equal(core.phase, "paused");
  back(); assert.equal(calls.pop(), "title"); assert.match(calls.pop(), /^confirm:/);
  back(); assert.equal(calls.pop(), "exit"); assert.match(calls.pop(), /^confirm:/);
  x.w.close();
});
test("Back never exits through unknown modals and declining a confirmation does nothing", () => {
  const x = setup(); const { d, w, calls, back, core } = x; calls.length = 0;
  const dialog = d.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); d.body.append(dialog);
  back(); assert.deepEqual(calls, []); dialog.remove();
  w.confirm = () => false; back(); assert.deepEqual(calls, []);
  core.phase = "paused"; back(); assert.deepEqual(calls, []); assert.equal(core.phase, "paused"); w.close();
});
test("browser version does not register a native back handler", () => { const x = setup(false); assert.deepEqual(x.calls, []); x.w.close(); });
test("native cleanup removes only matching worker and versioned caches", async () => {
  const dom = new JSDOM('<!doctype html><body></body>', {url:"https://localhost/", runScripts:"outside-only"});
  const w = dom.window, removed = [], deleted = [];
  w.Trk = {core:{settings:{language:"en"}, on(){}}}; w.Capacitor = {isNativePlatform:() => true, Plugins:{App:{addListener(){}, exitApp(){}}}};
  const regs = [
    {scope:"https://localhost/", active:{scriptURL:"https://localhost/sw.js"}, unregister:async () => { removed.push("trk"); return true; }},
    {scope:"https://localhost/other/", active:{scriptURL:"https://localhost/other/sw.js"}, unregister:async () => {removed.push("other"); return true;}}
  ];
  Object.defineProperty(w.navigator, "serviceWorker", { value:{getRegistrations:async () => regs} });
  w.caches = {keys:async () => ["trk-v2026.10.27-trk214", "trk-share-inbox-v1", "unrelated"], delete:async key => {deleted.push(key); return true;}};
  w.eval(code); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(removed, ["trk"]); assert.deepEqual(deleted, ["trk-v2026.10.27-trk214"]); w.close();
});

test("cleanup marks a controlled old worker for a single reload", async () => {
  const vc = new VirtualConsole(); // jsdom reports navigation as not implemented
  const dom = new JSDOM('<!doctype html><body></body>', {url:"https://localhost/", runScripts:"outside-only", virtualConsole:vc});
  const w = dom.window;
  w.Trk = {core:{settings:{language:"en"}, on(){}}};
  w.Capacitor = {isNativePlatform:() => true, Plugins:{App:{addListener(){}}}};
  const worker = {scriptURL:"https://localhost/sw.js"};
  Object.defineProperty(w.navigator, "serviceWorker", {value:{controller:worker, getRegistrations:async () => [{scope:"https://localhost/", active:worker, unregister:async () => true}]}});
  w.eval(code); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.sessionStorage.getItem("trk_apk_sw_cleanup_reloaded"), "1");
  w.close();
});
