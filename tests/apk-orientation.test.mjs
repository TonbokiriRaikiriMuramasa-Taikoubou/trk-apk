// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const code = html.split('<button id="floatingSafeBtn"')[1].split('<script>')[1].split('</script>')[0];
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test("Android orientation toggle and cancelled ten-second recovery are separate", async () => {
  const dom = new JSDOM('<!doctype html><button id="floatingSafeBtn"></button>', {url:"https://localhost/", runScripts:"outside-only"});
  const w = dom.window, b = w.document.getElementById("floatingSafeBtn"), calls=[];
  let timer, confirmCalls=0;
  w.setTimeout = (fn, ms) => { assert.equal(ms,10000); timer=fn; return 1; };
  w.clearTimeout = () => { timer=null; };
  w.confirm = () => { confirmCalls++; return false; };
  w.Capacitor = {isNativePlatform:() => true, Plugins:{TrkDevice:{setOrientationLock:async ({locked}) => {calls.push(locked); return {locked};}}}};
  w.eval(code);
  assert.equal(b.textContent,"↻");
  b.click(); await tick(); assert.equal(b.getAttribute("aria-pressed"),"true");
  b.click(); await tick(); assert.equal(b.getAttribute("aria-pressed"),"false");
  b.dispatchEvent(new w.Event("pointerdown")); assert.ok(timer); timer(); assert.equal(confirmCalls,1);
  b.click(); await tick(); assert.deepEqual(calls,[true,false]);
  b.dispatchEvent(new w.Event("pointerdown")); b.dispatchEvent(new w.Event("pointercancel")); assert.equal(timer,null);
  dom.window.close();
});
