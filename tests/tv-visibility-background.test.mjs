// SPDX-License-Identifier: GPL-3.0-or-later
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../js/tv-dock.js",import.meta.url),"utf8");
function extract(name) {
  const start=source.indexOf(`function ${name}(`); assert.ok(start>=0);
  const open=source.indexOf("{",start); let depth=0;
  for (let i=open;i<source.length;i++) { if (source[i]==="{") depth++; else if (source[i]==="}" && --depth===0) return source.slice(start,i+1); }
  throw new Error(`Missing end of ${name}`);
}
function setup() {
  const video={paused:true,muted:false,src:"fixture",play(){this.paused=false; return Promise.resolve();},pause(){this.paused=true;}};
  const core={video,videoReady:true,phase:"title",settings:{tvMenuVideo:true,previewEnabled:false},keepInBackground:()=>true};
  const ctx={core,document:{hidden:false},screenName:()=>"select"};
  vm.runInNewContext(`let menuMutedByUs=false, menuPlayingByUs=false; ${extract("menuVideoWanted")} ${extract("menuVideoTick")} this.tick=menuVideoTick;`,ctx);
  return {ctx,core,video};
}
test("TV-owned muted preview survives allowed hide but is released on an explicit setting change",async()=>{
  const {ctx,core,video}=setup(); ctx.tick(); await Promise.resolve();
  assert.equal(video.paused,false); assert.equal(video.muted,true);
  ctx.document.hidden=true; ctx.tick({type:"visibilitychange"});
  assert.equal(video.paused,false); assert.equal(video.muted,true);
  core.settings.tvMenuVideo=false; ctx.tick();
  assert.equal(video.paused,true); assert.equal(video.muted,false);
});
test("TV-owned preview is released on hide without background permission",async()=>{
  const {ctx,core,video}=setup(); ctx.tick(); await Promise.resolve();
  core.keepInBackground=()=>false; ctx.document.hidden=true; ctx.tick({type:"visibilitychange"});
  assert.equal(video.paused,true); assert.equal(video.muted,false);
});
