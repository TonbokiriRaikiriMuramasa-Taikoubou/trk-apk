// SPDX-License-Identifier: GPL-3.0-or-later
// Integration smoke: load the real trk scripts in jsdom (not a WebView/audio test).
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextEncoder, TextDecoder } from "node:util";
import { JSDOM, VirtualConsole } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("real trk scripts build effects and keep the player open during navigation", { timeout:30000 }, async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { ".html":"text/html", ".css":"text/css", ".js":"text/javascript", ".json":"application/json" };
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { "Content-Type":types[path.extname(file)] || "application/octet-stream" }); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let dom;
  const failures = [], vc = new VirtualConsole();
  let nativeBack, registrations = 0;
  vc.on("jsdomError", error => failures.push(error.message));
  try {
    dom = await JSDOM.fromURL(`http://127.0.0.1:${server.address().port}/`, {
      resources:"usable", runScripts:"dangerously", pretendToBeVisual:true, virtualConsole:vc,
      beforeParse(w) {
        w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
        w.Capacitor = { isNativePlatform:() => true, Plugins:{ App:{ addListener(name, callback) { if (name === "backButton") nativeBack = callback; return Promise.resolve({remove(){}}); }, exitApp() { return Promise.resolve(); } }, TrkDevice:{setPipEligible:async ({enabled}) => ({available:true,eligible:enabled}), setOrientationLock:async ({locked}) => ({locked})} } };
        Object.defineProperty(w.navigator, "serviceWorker", { value:{ register() { registrations++; return Promise.resolve(); }, getRegistrations:async () => [] } });
        w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
        w.fetch = async url => {
          if (String(url).endsWith("assets/mmd/lat-miku/preset.json")) {
            const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/mmd/lat-miku/preset.json"), "utf8"));
            return {ok:true, status:200, json:async () => manifest};
          }
          return { ok:false, status:404, json:async () => ({}), text:async () => "" };
        };
        const gradient = { addColorStop(){} };
        const ctx = new Proxy({ canvas:null, measureText:t => ({ width:String(t).length * 9 }), createLinearGradient:() => gradient, createRadialGradient:() => gradient, createPattern:() => null }, {
          get:(obj, prop) => prop in obj ? obj[prop] : () => {}, set:(obj, prop, val) => { obj[prop] = val; return true; }
        });
        w.HTMLCanvasElement.prototype.getContext = function() { ctx.canvas = this; return ctx; };
        w.HTMLMediaElement.prototype.load = function() {};
        w.scrollTo = () => {};
      }
    });
    const w = dom.window;
    if (w.document.readyState !== "complete") await new Promise(resolve => w.addEventListener("load", resolve, { once:true }));
    await new Promise(resolve => setTimeout(resolve, 1500)); // let upstream startup promises settle
    const d = w.document;
    assert.equal(d.querySelectorAll(".apk-nav button").length, 5);
    assert.ok(w.TrkFX && w.TrkTV && w.TrkMediaPlayer);
    const modelRow = d.getElementById("mmdPresetRow");
    assert.equal(modelRow.hidden, false, "the model guide appears");
    assert.equal(modelRow.querySelectorAll("button").length, 0, "there is no bundled model button");
    assert.equal(modelRow.querySelector("a").href, "https://bowlroll.net/file/30199");
    assert.equal(registrations, 0, "native startup must not register a service worker");
    assert.equal(typeof nativeBack, "function", "native App backButton listener is installed");
    assert.ok(d.getElementById("apkAutoPip"), `PiP control missing; jsdom errors: ${failures.join("; ")}; options: ${!!d.querySelector(".mediaOptions")}; parent: ${d.querySelector(".mediaOptions")?.closest("[id]")?.id}; inner: ${d.querySelector(".mediaOptions")?.innerHTML.slice(0,140)}; pip: ${!!w.TrkApkPip}; scripts: ${[...d.scripts].slice(-5).map(x=>x.src).join(",")}`);
    assert.equal(d.getElementById("apkAutoPip").checked, false);
    assert.equal(d.getElementById("apkPipAudio").disabled, true);
    assert.equal(d.querySelector(".cornerAnt").hidden, false);
    assert.equal(d.getElementById("floatingSafeBtn").getAttribute("aria-pressed"), "false");
    assert.equal(d.getElementById("welcomeBox").hidden, false);
    assert.equal(d.getElementById("floatingSafeBtn").hidden, true);
    assert.equal(d.querySelector(".apk-nav").hidden, true, "welcome blocks the navigation");
    nativeBack(); await Promise.resolve();
    assert.equal(d.getElementById("welcomeBox").hidden, true);
    assert.equal(d.getElementById("floatingSafeBtn").hidden, false);
    assert.equal(d.querySelector(".apk-nav").hidden, false);
    // On a fresh install all settings sections are closed (preset categories
    // inside the effect grid are not settings sections).
    const sections = [...d.querySelectorAll("#settingsScreen details")].filter(node => !node.closest(".fxGrid"));
    assert.ok(sections.length > 10); assert.ok(sections.every(node => !node.open));
    // Completing or skipping the tutorial must not fill a fresh library with trk lists.
    const settings = w.Trk.core.settings;
    assert.equal(settings.playlists.length, 0);
    assert.ok(!settings.plFolders.some(f => f.id === "trk"));
    d.getElementById("guideSkip").click();
    assert.equal(settings.tutorialDone, true);
    assert.equal(settings.playlists.length, 0);
    assert.ok(!settings.plFolders.some(f => f.id === "trk"));
    const picker = d.getElementById("apkTrkSelect"), add = d.getElementById("apkTrkAdd");
    assert.ok(picker.options.length > 100, "the picker is generated from the catalog");
    const option = [...picker.options].find(o => o.textContent.includes("LONETRAIL"));
    assert.ok(option);
    picker.value = option.value; picker.dispatchEvent(new w.Event("change")); add.click();
    assert.equal(settings.playlists.length, 1, "only the selected list is created");
    assert.equal(settings.plFolders.length, 1, "no empty series folders are created");
    const chosen = settings.playlists[0];
    assert.equal(chosen.id, "trk-ak-lonetrail");
    assert.ok(chosen.wish.length > 0);
    assert.equal(settings.chartGen, "4", "fresh installs use B");
    d.getElementById("trkPanel").open = true;
    d.getElementById("trkPanel").dispatchEvent(new w.Event("toggle"));
    let row = [...d.querySelectorAll("#trkOrderList .plTrkRow")].find(r => r.textContent.includes("LONETRAIL"));
    assert.ok(row, "selected catalog list appears in settings");
    let eye = row.querySelector('button[aria-pressed]');
    assert.equal(eye.getAttribute("aria-pressed"), "false");
    eye.click();
    assert.deepEqual([...settings.trkListed], [chosen.id]);
    row = [...d.querySelectorAll("#trkOrderList .plTrkRow")].find(r => r.textContent.includes("LONETRAIL"));
    assert.equal(row.querySelector('button[aria-pressed]').getAttribute("aria-pressed"), "true");
    const copyButton = [...row.querySelectorAll("button")].find(b => b.textContent === "📋");
    assert.ok(copyButton); copyButton.click();
    const copy = settings.playlists.find(p => p !== chosen);
    assert.ok(copy && copy.cat === "" && copy.folder === "");
    assert.equal(copy.wish.length, chosen.wish.length);
    assert.deepEqual(JSON.parse(w.localStorage.getItem("shadow_taiko_preferences_v2")).trkListed, [chosen.id]);
    settings.playlists = settings.playlists.filter(p => p !== copy);
    settings.trkListed = [];
    chosen.name = "My edited playlist"; chosen.songs.push("local:mine"); chosen.wish.splice(0, 1);
    const editedWish = JSON.stringify(chosen.wish);
    w.Trk.core.saveUserPrefs();
    await w.Trk.library.initLibrary();
    assert.equal(settings.playlists.length, 1, "startup refresh never imports other lists");
    assert.equal(settings.playlists[0].name, "My edited playlist");
    assert.equal(JSON.stringify(settings.playlists[0].wish), editedWish, "catalog updates do not overwrite edited wishes");
    assert.deepEqual([...settings.playlists[0].songs], ["local:mine"]);
    assert.equal(settings.plFolders.length, 1);
    // Deletion is not silently undone; explicitly selecting it again clears only its marker.
    settings.playlists.splice(0, 1); settings.trkRemoved.push("trk-ak-lonetrail", "trk-ak-other");
    w.Trk.core.saveUserPrefs();
    await w.Trk.library.initLibrary();
    assert.equal(settings.playlists.length, 0);
    d.getElementById("trkPanel").open = true;
    d.getElementById("trkPanel").dispatchEvent(new w.Event("toggle"));
    const restored = [...picker.options].find(o => o.textContent.includes("LONETRAIL"));
    assert.ok(restored && !restored.disabled);
    picker.value = restored.value; picker.dispatchEvent(new w.Event("change")); add.click();
    assert.equal(settings.playlists.length, 1);
    assert.deepEqual([...settings.trkRemoved], ["trk-ak-other"]);
    assert.ok([...picker.options].find(o => o.textContent.includes("LONETRAIL")).disabled);
    // An original OST is also opt-in and doesn't create all the empty default shelves.
    const ost = [...picker.options].find(o => o.textContent.includes("trk's OST Vol.1"));
    picker.value = ost.value; picker.dispatchEvent(new w.Event("change")); add.click();
    assert.equal(settings.playlists.length, 2);
    assert.equal(settings.plFolders.length, 1);
    assert.ok(settings.playlists.find(p => p.id === "trk-ost-v1"));
    // Capacity failures never silently discard playlists or create orphan folders.
    const savedLists = settings.playlists.slice(), savedFolders = settings.plFolders.slice();
    const next = [...picker.options].find(o => o.textContent.includes("So Long, Adele"));
    picker.value = next.value; picker.dispatchEvent(new w.Event("change"));
    settings.playlists.push(...Array.from({ length:198 }, (_, i) => ({ id:"test" + i, songs:[], wish:[] })));
    add.click();
    assert.equal(settings.playlists.length, 200);
    assert.equal(settings.plFolders.length, 1);
    assert.match(d.getElementById("apkTrkPickerStatus").textContent, /上限|limit/i);
    settings.playlists = savedLists;
    settings.plFolders = Array.from({ length:40 }, (_, i) => ({ id:"folder" + i, parent:"" }));
    add.click();
    assert.equal(settings.playlists.length, 2);
    assert.equal(settings.plFolders.length, 40);
    settings.plFolders = savedFolders;
    w.Trk.core.saveUserPrefs();
    const enable = d.getElementById("synthModeEnabled"), overlay = d.getElementById("synthMode");
    const fast = d.getElementById("synthModeFastStart"), power = d.querySelector("#fxDock .dockPow");
    assert.ok(enable && overlay && fast && power);
    assert.equal(enable.checked, false); assert.equal(w.Trk.core.settings.synthModeDisabled, true);
    fast.checked = true; fast.dispatchEvent(new w.Event("change", { bubbles:true }));
    const press = () => power.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles:true, button:0 }));
    const release = () => power.dispatchEvent(new w.MouseEvent("pointerup", { bubbles:true, button:0 }));
    press(); await new Promise(resolve => setTimeout(resolve, 250)); release();
    assert.equal(overlay.hidden, true, "disabled long press does not launch");
    enable.checked = true; enable.dispatchEvent(new w.Event("change", { bubbles:true }));
    assert.equal(w.Trk.core.settings.synthModeDisabled, false);
    assert.equal(JSON.parse(w.localStorage.getItem("shadow_taiko_preferences_v2")).synthModeDisabled, false);
    press(); await new Promise(resolve => setTimeout(resolve, 250)); release();
    assert.equal(overlay.hidden, false, "enabled long press opens synth");
    enable.checked = false; enable.dispatchEvent(new w.Event("change", { bubbles:true }));
    assert.equal(overlay.hidden, true, "disabling closes an open synth");
    enable.checked = true; enable.dispatchEvent(new w.Event("change", { bubbles:true }));
    d.getElementById("emergencyAudioResetBtn").click();
    assert.equal(enable.checked, false, "audio reset restores the opt-in default");
    assert.equal(w.Trk.core.settings.synthModeDisabled, true);
    d.querySelector('[data-destination="effects"]').click();
    assert.equal(d.querySelectorAll(".apk-eq-row").length, 5);
    assert.ok(d.querySelectorAll("#apkSoundPreset option").length > 1);
    assert.ok(d.querySelectorAll("#apkVideoPreset option").length > 1);
    d.querySelector('[data-destination="player"]').click();
    assert.equal(w.TrkMediaPlayer.isOpen(), true);
    d.querySelector('[data-destination="effects"]').click();
    assert.equal(w.TrkMediaPlayer.isOpen(), true);
    assert.ok(d.querySelector("#apkEffects .mediaStage"));
    nativeBack();
    assert.ok(d.querySelector(".mediaBody .mediaStage"), "native back from effects keeps player open");
    assert.equal(w.TrkMediaPlayer.isOpen(), true);
    d.querySelector('[data-destination="player"]').click();
    assert.ok(d.querySelector(".mediaBody .mediaStage"));
    // Drive the actual import handler, then inspect persisted JSON before its scheduled reload.
    settings.favs = {tv:{sub:["tv-old"]},fx:{pins:["fx-old"]},song:{sub:["song-old"],pins:["keep"],locks:["frozen"],active:"sub"}};
    settings.songFav = ["before"];
    const imported = JSON.stringify({songFav:[" first ","first",null],favs:{song:{sub:[],pins:42},tv:false}});
    const input = d.getElementById("emergencyImportFile");
    Object.defineProperty(input,"files",{configurable:true,value:[{size:imported.length,text:async()=>imported}]});
    input.dispatchEvent(new w.Event("change"));
    await new Promise(resolve => setTimeout(resolve, 0));
    const saved=JSON.parse(w.localStorage.getItem("shadow_taiko_preferences_v2"));
    assert.deepEqual(saved.songFav,["first"]);
    assert.deepEqual(saved.favs.tv.sub,["tv-old"]);
    assert.deepEqual(saved.favs.fx.pins,["fx-old"]);
    assert.deepEqual(saved.favs.song.sub,[]);
    assert.deepEqual(saved.favs.song.pins,["keep"]);
    assert.match(d.getElementById("emergencyStatus").textContent,/favs\.tv/);
    assert.match(d.getElementById("emergencyStatus").textContent,/favs\.song\.pins/);
    assert.match(d.getElementById("emergencyStatus").textContent,/songFav/);
    assert.deepEqual(failures, []);
  } finally {
    if (dom) dom.window.close();
    await new Promise(resolve => server.close(resolve));
  }
});
