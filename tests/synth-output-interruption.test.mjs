// SPDX-License-Identifier: GPL-3.0-or-later
// Exercise the actual synth release/interrupt functions with fake Web Audio nodes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source=fs.readFileSync(new URL("../js/synth-mode.js",import.meta.url),"utf8");
function extract(name) {
  const start=source.indexOf(`function ${name}(`); assert.ok(start>=0,`real synth function ${name} exists`);
  const open=source.indexOf("{",start); let depth=0;
  for (let i=open;i<source.length;i++) { if(source[i]==="{") depth++; else if(source[i]==="}" && --depth===0) return source.slice(start,i+1); }
  throw new Error(`unterminated ${name}`);
}
function fixture() {
  const timers=[], pressed=[];
  const sandbox={audio:{currentTime:10},setTimeout:fn=>timers.push(fn),Math,
    updateSelectedNote:(m,on)=>pressed.push([m,on])};
  vm.runInNewContext(`const voices=new Map(), soundingVoices=new Set(), pressedMidi=new Map();\n${extract("releaseVoice")}\n${extract("stopAllNotes")}\n${extract("silenceInterruptedNotes")}\nObject.assign(this,{voices,soundingVoices,pressedMidi,releaseVoice,stopAllNotes,silenceInterruptedNotes});`,sandbox);
  function voice(token,midi) {
    const calls=[];
    const gain={value:1,cancelAndHoldAtTime:t=>calls.push(["hold",t]),cancelScheduledValues:t=>calls.push(["cancel",t]),setValueAtTime:(v,t)=>calls.push(["set",v,t]),exponentialRampToValueAtTime:(v,t)=>calls.push(["ramp",v,t])};
    const source={stop:t=>calls.push(["stop",t]),disconnect:()=>calls.push(["source-disconnect"])};
    const envelope={gain,disconnect:()=>calls.push(["envelope-disconnect"])}, filter={disconnect:()=>calls.push(["filter-disconnect"])};
    const layer={disconnect:()=>calls.push(["layer-disconnect"])};
    const v={token,keyMidi:midi,filter,envelope,sourceNodes:new Map([["s",{source,gain:layer}]]),release:3,releasing:false,calls};
    sandbox.voices.set(token,v); sandbox.soundingVoices.add(v); sandbox.pressedMidi.set(midi,1); return v;
  }
  return {sandbox,voice,timers,pressed};
}
test("disconnect silences both a held voice and a previous release tail immediately",()=>{
  const x=fixture(), tail=x.voice("tail",60); x.sandbox.releaseVoice("tail");
  assert.equal(x.sandbox.voices.has("tail"),false,"tail is no longer held");
  const held=x.voice("held",62); x.sandbox.silenceInterruptedNotes();
  assert.equal(x.sandbox.voices.size,0); assert.equal(x.sandbox.soundingVoices.size,0);
  for (const v of [tail,held]) {
    assert.ok(v.calls.some(c=>c[0]==="source-disconnect"),"output disconnected immediately");
    assert.ok(v.calls.some(c=>c[0]==="stop" && c[1]===10),"source stopped at current time");
    assert.ok(v.calls.some(c=>c[0]==="envelope-disconnect"));
  }
  assert.equal(x.sandbox.pressedMidi.size,0);
  // Delayed cleanup of an old release must not remove a retriggered voice.
  const fresh=x.voice("tail",60); x.timers.forEach(fn=>fn());
  assert.equal(x.sandbox.voices.get("tail"),fresh);
});
test("a suspended clock or an already-stopped source does not prevent disconnection",()=>{
  const x=fixture(), v=x.voice("held",60); x.sandbox.audio.state="suspended";
  v.sourceNodes.get("s").source.stop=()=>{throw new Error("already stopped");};
  v.envelope.gain.cancelScheduledValues=()=>{throw new Error("unavailable");};
  x.sandbox.silenceInterruptedNotes();
  assert.ok(v.calls.some(c=>c[0]==="source-disconnect"));
  assert.ok(v.calls.some(c=>c[0]==="envelope-disconnect"));
  assert.equal(x.sandbox.voices.size,0);
});
test("normal release keeps its envelope instead of cutting it",()=>{
  const x=fixture(), v=x.voice("normal",60); x.sandbox.stopAllNotes();
  assert.ok(v.calls.some(c=>c[0]==="stop" && c[1]>10));
  assert.ok(!v.calls.some(c=>c[0]==="source-disconnect"));
  x.timers.forEach(fn=>fn()); assert.equal(x.sandbox.soundingVoices.size,0);
});
