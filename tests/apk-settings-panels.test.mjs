// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const script = fs.readFileSync(new URL("../js/apk-settings-panels.js", import.meta.url), "utf8");
const key = "trk_apk_settings_panels_v1";
function setup(stored, unavailable = false) {
  const dom = new JSDOM(`<!doctype html><section id="settingsScreen">
    <input id="settingsSearch"><details open><summary data-i18n="secDisplay">Display</summary>
      <details id="skinShelf" class="subPanel" open><summary>Skins</summary></details></details>
    <details id="synthModeSettings"><summary>Synth</summary></details>
    <div class="fxGrid"><details open><summary>Preset category</summary></details></div>
  </section>`, { url:"https://example.test", runScripts:"outside-only" });
  const w = dom.window, d = w.document;
  if (stored !== undefined) w.localStorage.setItem(key, stored);
  if (unavailable) Object.defineProperty(w, "localStorage", { get() { throw new Error("storage unavailable"); } });
  w.eval(script); d.dispatchEvent(new w.Event("DOMContentLoaded"));
  return { w, d, display:d.querySelector("#settingsScreen > details"), synth:d.getElementById("synthModeSettings"), shelf:d.getElementById("skinShelf") };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 15));

test("all settings sections start closed while preset categories are left alone", () => {
  const { d, display, synth, shelf } = setup();
  assert.equal(display.open, false); assert.equal(synth.open, false); assert.equal(shelf.open, false);
  assert.equal(d.querySelector(".fxGrid details").open, true);
});

test("user toggles persist by stable keys across language changes and a new page", async () => {
  const first = setup();
  first.display.querySelector(":scope > summary").click();
  first.synth.querySelector(":scope > summary").click();
  first.shelf.querySelector(":scope > summary").click();
  await settle();
  const data = first.w.localStorage.getItem(key);
  assert.deepEqual(JSON.parse(data), { "label:secDisplay":true, "id:synthModeSettings":true, "id:skinShelf":true });
  const second = setup(data);
  assert.equal(second.display.open, true); assert.equal(second.synth.open, true); assert.equal(second.shelf.open, true);
  second.synth.querySelector("summary").click(); await settle();
  assert.equal(JSON.parse(second.w.localStorage.getItem(key))["id:synthModeSettings"], false);
});

test("search and programmatic expansion do not overwrite saved choices", async () => {
  const data = JSON.stringify({ "label:secDisplay":false, "id:synthModeSettings":true });
  const { d, w, display, synth } = setup(data);
  const search = d.getElementById("settingsSearch"); search.value = "音";
  display.open = true; synth.open = false;
  display.querySelector("summary").click(); await settle();
  assert.equal(w.localStorage.getItem(key), data);
  search.value = ""; display.open = false; synth.open = true; await settle();
  assert.equal(w.localStorage.getItem(key), data);
});

test("invalid and unavailable storage fall back to closed, usable settings", async () => {
  const corrupt = setup("not json"); assert.equal(corrupt.display.open, false);
  const blocked = setup(undefined, true); blocked.display.querySelector("summary").click(); await settle();
  assert.equal(blocked.display.open, true);
});
