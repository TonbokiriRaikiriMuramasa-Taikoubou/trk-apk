// SPDX-License-Identifier: GPL-3.0-or-later
// Real FX interruption handlers and graph initialization with fake nodes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../js/fx.js",import.meta.url),"utf8");
function extract(name) {
  const start=source.indexOf(`function ${name}(`); assert.ok(start>=0);
  const open=source.indexOf("{",start); let depth=0;
  for(let i=open;i<source.length;i++) {if(source[i]==="{") depth++; else if(source[i]==="}" && --depth===0) return source.slice(start,i+1);}
  throw Error(`unterminated ${name}`);
}
function fixture() {
  const hooks={}, calls=[];
  const node=()=>({gain:{cancelScheduledValues(){},setValueAtTime(){}},connect(){calls.push("connect");this.connected=true;},disconnect(){calls.push("disconnect");this.connected=false;}});
  const ac={currentTime:2,destination:{},createGain:node,createMediaElementSource:node};
  const G={src:null,ok:true,guard:null,guardConnected:false,eq:[],game:{},extra:new Map(),ac:null};
  const state={blocked:true,fail:false};
  const window={Trk:{core:{audioSafety:{blocked:()=>state.blocked}}}};
  const context={G,window,getAC:()=>ac,ensureWorklet(){},video:{addEventListener(){}},
    on:(n,fn)=>hooks[n]=fn,buildOutputPath(){calls.push("build");if(state.fail)throw Error("failure");},
    rebuild(){calls.push("rebuild");},applyOut(){calls.push("apply");},rebuildExtraMidiMix(){calls.push("extra");},
    console:{error(){calls.push("error");}}};
  const start=source.indexOf('on("audioOutputInterrupted", () => {'),end=source.indexOf('/* 🔊 音量の平準化（trk168）：今の曲について補正量を計算し、G.norm',start);
  assert.ok(start>=0&&end>start); vm.runInNewContext(`${extract("ensureGraph")}\n${source.slice(start,end)}\nthis.ensureGraph=ensureGraph;`,context);
  return {hooks,calls,G,ac,state,context};
}
test("an FX graph created while blocked cannot connect until explicit resume",()=>{
  const x=fixture(); x.context.ensureGraph(); assert.equal(x.G.guardConnected,false); assert.equal(x.G.guard.connected,undefined);
  x.state.blocked=false; x.hooks.audioOutputResumed(); assert.equal(x.G.guardConnected,true); assert.equal(x.G.guard.connected,true);
  assert.ok(x.calls.indexOf("rebuild")<x.calls.lastIndexOf("connect"));
});
test("a failed FX rebuild stays disconnected rather than releasing old residual sound",()=>{
  const x=fixture(); x.context.ensureGraph(); x.state.blocked=false; x.hooks.audioOutputResumed();
  x.hooks.audioOutputInterrupted(); assert.equal(x.G.guard.connected,false);
  x.state.fail=true; x.hooks.audioOutputResumed(); assert.equal(x.G.guard.connected,false); assert.equal(x.G.guardConnected,false); assert.ok(x.calls.includes("error"));
});
