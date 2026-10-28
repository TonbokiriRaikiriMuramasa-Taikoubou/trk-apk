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
  for (const event of ["pointerup", "pointercancel", "pointerleave"]) {
    b.dispatchEvent(new w.Event("pointerdown")); b.dispatchEvent(new w.Event(event)); assert.equal(timer,null, event);
  }
  const context = new w.Event("contextmenu", { cancelable:true });
  b.dispatchEvent(context); assert.equal(context.defaultPrevented, true);
  const css = fs.readFileSync(new URL("../css/apk-mobile.css", import.meta.url), "utf8");
  assert.match(css, /#floatingSafeBtn\[data-orientation-control\]\s*\{[^}]*touch-action\s*:\s*none/);
  dom.window.close();
});
