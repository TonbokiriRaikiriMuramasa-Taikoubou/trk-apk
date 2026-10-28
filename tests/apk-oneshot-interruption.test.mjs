// SPDX-License-Identifier: GPL-3.0-or-later
// Real one-shot audio functions with fake Web Audio nodes; not an audio test.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),"utf8");
function extract(source,name) {
  const start=source.indexOf(`function ${name}(`); assert.ok(start>=0);
  const open=source.indexOf("{",start); let depth=0;
  for(let i=open;i<source.length;i++) {if(source[i]==="{") depth++; else if(source[i]==="}" && --depth===0) return source.slice(start,i+1);}
  throw Error(`unterminated ${name}`);
}
function setup() {
  const events={}, sources=[], outputs=[]; let blocked=false;
  const param=()=>({value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const gain=()=>{const n={gain:param(),connect(x){return x;},disconnect(){this.disconnected=true;}}; outputs.push(n); return n;};
  const source=()=>{const n={frequency:param(),connect(x){return x;},start(){},stop(){this.stops=(this.stops||0)+1;},disconnect(){this.disconnected=true;},addEventListener(type,fn){if(type==="ended")this.ended=fn;}}; sources.push(n); return n;};
  const ac={state:"running",currentTime:2,sampleRate:100, destination:{},createGain:gain,createOscillator:source,createBufferSource:source,createBiquadFilter:()=>({...gain(),frequency:param()}),createBuffer:()=>({getChannelData:()=>new Float32Array(5)})};
  const core={settings:{seEnabled:true,seVolume:.4,countdownSE:true},audioSafety:{blocked:()=>blocked},on:(name,fn)=>(events[name]??=[]).push(fn)};
  const window={Trk:{media:{getAC:()=>ac}}};
  const src=read("media"), start=src.indexOf("const seBuffers ="), end=src.indexOf("async function loadSE",start);
  const context={core,window,getAC:()=>ac,Set,Math,Float32Array};
  vm.runInNewContext(`${src.slice(start,end)}\nObject.assign(this,{playSE,trackOneShot,seBuffers});`,context);
  window.Trk.media.trackOneShot=context.trackOneShot;
  vm.runInNewContext([extract(read("game"),"countTick"),extract(read("modes"),"failSound"),extract(read("catch"),"blastSound"),"Object.assign(this,{countTick,failSound,blastSound});"].join("\n"),context);
  return {context,core,sources,outputs,interrupt(){blocked=true; for(const f of events.audioOutputInterrupted)f();},resume(){blocked=false;}};
}
test("output interruption cuts buffered, synthesized and game one-shots, and prevents automatic retrigger",()=>{
  const x=setup(), {context:c}=x; c.seBuffers[0]={}; c.playSE(0); c.seBuffers[0]=null; c.playSE(0); c.playSE(1); c.countTick(2); c.failSound(); c.blastSound();
  assert.equal(x.sources.length,7); const previous=x.sources.slice();
  x.interrupt(); assert.ok(previous.every(s=>s.disconnected&&s.stops));
  c.playSE(0); c.playSE(0,true); c.countTick(1); c.failSound(); c.blastSound(); assert.equal(x.sources.length,7);
  c.playSE(0,true,true); assert.equal(x.sources.length,8,"explicit trusted-preview path can start a fresh sound without unblocking playback");
  x.interrupt(); assert.ok(x.sources[7].disconnected); x.resume(); c.playSE(0); assert.equal(x.sources.length,9);
});
test("finished one-shots and stale ended events never disconnect a newer voice",()=>{
  const x=setup(), {context:c}=x; c.seBuffers[0]={}; c.playSE(0);
  const old=x.sources[0], oldOut=x.outputs[0]; old.ended(); assert.equal(oldOut.disconnected,true);
  c.playSE(0); const newer=x.sources[1], newOut=x.outputs[1]; old.ended();
  assert.notEqual(newOut.disconnected,true); x.interrupt(); assert.equal(newer.disconnected,true); assert.equal(newOut.disconnected,true);
});
test("a stopped source that throws does not prevent silencing other sources",()=>{
  const x=setup(); x.context.playSE(1); x.sources[0].stop=()=>{throw Error("already stopped");};
  x.interrupt(); assert.ok(x.sources.every(s=>s.disconnected));
});
