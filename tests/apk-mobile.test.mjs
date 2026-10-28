// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const script = fs.readFileSync(new URL("../js/apk-mobile.js", import.meta.url), "utf8");
function setup() {
  const dom = new JSDOM(`<!doctype html><body class="apk-shell" data-apk-view="library">
    <section id="selectScreen"><div class="card"><div class="selectGrid"><div class="songCol"></div><div class="detailCol"></div></div></div></section>
    <details id="import"><summary id="apkImportSummary"></summary></details><details id="fxPanel">
      <div><input type="range" id="rackSlider" value="3"></div><h3 data-i18n="sfxEqLabel"></h3>
      ${Array.from({length:5}, () => '<div><span>Band</span><input type="range" min="-12" max="12" step="0.5" value="0"><span class="mono">0 dB</span></div>').join("")}
      <button data-i18n="sfxEqReset"></button></details>
    <div id="mediaPlayerMode" hidden><section class="mediaDialog"><header class="mediaHeader"></header><div class="mediaBody"><div class="mediaDisplayTitle">Song 1</div><div class="mediaStage"></div><button class="mediaPlayBtn"></button></div></section></div>
    <div id="studyRoom" hidden></div></body>`, { runScripts:"outside-only" });
  const { window:w } = dom, { document:d } = w;
  const hooks = {}, calls = { open:0, close:0, play:0 };
  const player = new w.EventTarget(); player.paused = false;
  const core = { phase:"title", settings:{language:"ja", fxOn:false, fxPreset:"a"}, currentSong:{key:"song-1"}, video:player, videoReady:true,
    on(name, cb) { (hooks[name] ||= []).push(cb); }, openSettings() { d.getElementById("selectScreen").hidden = true; emit("screen"); } };
  const emit = name => (hooks[name] || []).forEach(cb => cb());
  w.Trk = { core };
  w.TrkMediaPlayer = {
    isOpen() { return !d.getElementById("mediaPlayerMode").hidden; },
    open() { calls.open++; d.getElementById("mediaPlayerMode").hidden = false; d.body.classList.add("mediaOpen"); },
    close() { calls.close++; d.getElementById("mediaPlayerMode").hidden = true; d.body.classList.remove("mediaOpen"); }
  };
  w.TrkStudyRoom = {
    open() { d.getElementById("studyRoom").hidden = false; d.body.classList.add("study-room-open"); emit("studyOpen"); },
    close() { d.getElementById("studyRoom").hidden = true; d.body.classList.remove("study-room-open"); emit("studyClose"); }
  };
  w.TrkFX = {
    list() { return [{id:"a", name:"Sound A"}, {id:"b", name:"Sound B"}]; },
    select(id) { core.settings.fxOn = true; core.settings.fxPreset = id; emit("fxRack"); },
    off() { core.settings.fxOn = false; emit("fxRack"); },
    next() { this.select("b"); }, prev() { this.select("a"); }
  };
  let tv = "color";
  w.TrkTV = {
    list() { return [{id:"color", name:"Natural"}, {id:"mono", name:"Mono"}, {id:"scan", name:"Scanlines", overlay:"scan"}, {id:"off", name:"Off", off:true}]; },
    current() { return tv; }, select(id) { tv = id; emit("tvChange"); }, filter() { return tv === "mono" ? "grayscale(1)" : "none"; }
  };
  d.querySelector(".mediaPlayBtn").addEventListener("click", () => { calls.play++; player.paused = !player.paused; player.dispatchEvent(new w.Event(player.paused ? "pause" : "play")); });
  w.eval(script); d.dispatchEvent(new w.Event("DOMContentLoaded"));
  return { w, d, core, calls, emit, click:name => d.querySelector(`[data-destination="${name}"]`).click() };
}

test("five destinations and library/effects/game switching retain the song", () => {
  const { d, core, click } = setup();
  assert.deepEqual([...d.querySelectorAll(".apk-nav button")].map(b => b.dataset.destination), ["library", "effects", "player", "study", "game"]);
  assert.equal(d.querySelector("#import").open, false);
  assert.equal(d.body.dataset.apkView, "library");
  click("effects"); assert.equal(d.body.dataset.apkView, "effects"); assert.equal(d.querySelector("#apkEffects").hidden, false);
  click("game"); assert.equal(d.body.dataset.apkView, "game"); assert.equal(d.querySelector("#apkEffects").hidden, true);
  assert.equal(core.currentSong.key, "song-1");
  click("library"); assert.equal(d.body.dataset.apkView, "library");
});

test("player → effects → player keeps media open and restores its video stage", () => {
  const { w, d, core, calls, click } = setup();
  click("player"); assert.equal(calls.open, 1);
  assert.equal(d.querySelector(".apk-nav").parentElement.className, "mediaDialog");
  assert.equal(d.querySelector('[data-destination="player"]').getAttribute("aria-current"), "page");
  click("effects");
  assert.equal(calls.close, 0); assert.equal(d.querySelector("#mediaPlayerMode").hidden, false);
  assert.equal(d.body.classList.contains("apk-media-effects"), true);
  assert.equal(d.querySelector(".mediaDialog").getAttribute("aria-labelledby"), "apkEffectsTitle");
  assert.equal(d.querySelector("#apkEffects .mediaStage") !== null, true);
  assert.equal(d.querySelector('[data-destination="effects"]').getAttribute("aria-current"), "page");
  d.querySelector("#apkEffectsPlay").click(); assert.equal(calls.play, 1);
  assert.equal(d.querySelector("#apkEffectsPlay").textContent, "再生");
  w.TrkApkReturnToPlayer();
  assert.equal(d.querySelector(".mediaBody .mediaStage") !== null, true);
  assert.equal(d.body.classList.contains("apk-media-effects"), false);
  assert.equal(d.querySelector(".mediaDialog").getAttribute("aria-labelledby"), "mediaTitle");
  assert.equal(calls.close, 0); assert.equal(core.currentSong.key, "song-1");
  click("effects"); click("game");
  assert.equal(calls.close, 1); assert.equal(d.querySelector(".mediaBody .mediaStage") !== null, true);
  assert.equal(d.body.dataset.apkView, "game"); assert.equal(d.querySelector(".apk-nav").parentElement, d.body);
});

test("effects use live APIs, preserve custom state, and filter the player canvas", () => {
  const { d, core, click } = setup(); click("effects");
  const sound = d.querySelector("#apkSoundPreset"); sound.value = "b"; sound.dispatchEvent(new d.defaultView.Event("change"));
  assert.equal(core.settings.fxPreset, "b"); assert.equal(core.settings.fxOn, true);
  d.querySelector("#apkSoundOff").click(); assert.equal(core.settings.fxOn, false);
  d.querySelector("#apkSoundNext").click(); assert.equal(core.settings.fxPreset, "b");
  const sourceEq = d.querySelector('[data-i18n="sfxEqLabel"]').nextElementSibling.querySelector("input");
  let eqInputs = 0; sourceEq.addEventListener("input", () => eqInputs++);
  const eq = d.querySelector(".apk-eq-row input"); eq.value = "4"; eq.dispatchEvent(new d.defaultView.Event("input"));
  assert.equal(sourceEq.value, "4"); assert.equal(eqInputs, 1);
  assert.equal(d.querySelector("#rackSlider").value, "3");
  const video = d.querySelector("#apkVideoPreset");
  assert.equal([...video.options].some(o => o.value === "scan" || o.value === "off"), false);
  video.value = "mono"; video.dispatchEvent(new d.defaultView.Event("change"));
  assert.equal(d.body.style.getPropertyValue("--apk-video-filter"), "grayscale(1)");
});

test("external player close restores controls; study/settings/gameplay and language sync", async () => {
  const { w, d, core, emit, click } = setup();
  click("player"); click("effects"); w.TrkMediaPlayer.close(); await Promise.resolve();
  assert.equal(d.querySelector(".mediaBody .mediaStage") !== null, true);
  assert.equal(d.querySelector(".apk-nav").parentElement, d.body);
  click("study"); assert.equal(d.querySelector(".apk-nav").hidden, true);
  w.TrkStudyRoom.close(); assert.equal(d.querySelector(".apk-nav").hidden, false);
  d.querySelector("#selectScreen").hidden = true; emit("screen"); assert.equal(d.querySelector(".apk-nav").hidden, true);
  d.querySelector("#selectScreen").hidden = false; core.phase = "playing"; emit("phase"); assert.equal(d.querySelector(".apk-nav").hidden, true);
  core.phase = "title"; core.settings.language = "en"; emit("language");
  assert.equal(d.querySelector('[data-destination="effects"] .apk-nav-label').textContent, "Effects");
  assert.equal(d.querySelector("#apkImportSummary").textContent, "＋ Add content");
  assert.equal(d.querySelector("#apkMediaGame").textContent, "Go to game mode");
});


test("actual markup keeps every import action and reconnect outside the collapsed section", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const d = new JSDOM(html).window.document;
  const importPanel = d.querySelector("details.apk-import");
  assert.equal(importPanel.open, false);
  for (const id of ["libOpenBtn", "libShareBtn", "mediaFile", "videoFile", "songPackFile"]) {
    assert.ok(importPanel.querySelector(`#${id}`), `${id} remains available`);
  }
  for (const id of ["libReconnectBtn", "libRescanBtn"]) {
    assert.ok(d.getElementById(id)); assert.equal(importPanel.contains(d.getElementById(id)), false);
  }
  assert.ok(importPanel.querySelector('[data-i18n="libOpenShareHint"]'));
});

test("welcome and dynamically added dialogs block the bottom navigation", async () => {
  const { w, d } = setup(), nav = d.querySelector(".apk-nav");
  const welcome = d.createElement("div"); welcome.id = "welcomeBox"; welcome.setAttribute("role", "dialog"); welcome.setAttribute("aria-modal", "true");
  d.querySelector("#selectScreen").append(welcome); await Promise.resolve();
  assert.equal(nav.hidden, true);
  welcome.hidden = true; await Promise.resolve(); assert.equal(nav.hidden, false);
  const overlay = d.createElement("div"); overlay.className = "plOverlay"; d.body.append(overlay); await Promise.resolve();
  assert.equal(nav.hidden, true); overlay.remove(); await Promise.resolve(); assert.equal(nav.hidden, false);
  w.close();
});
