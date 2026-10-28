// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/apk-audio-safety.js', import.meta.url),'utf8');
function setup(native=true) {
  const listeners={}, events={}, calls=[]; let pending;
  const video={paused:false,play(){calls.push('play');return new Promise(resolve=>{pending=resolve;});},pause(){calls.push('pause');this.paused=true;}};
  const core={video,phase:'title',emit(name){(events[name]||[]).forEach(f=>f());},on(name,fn){(events[name]??=[]).push(fn);}};
  const device={addListener(name,fn){listeners[name]=fn;return Promise.resolve();}};
  const window={Trk:{core,play:{pauseGame(){calls.push('gamePause');core.phase='paused';video.pause();}}},Capacitor:{isNativePlatform:()=>native,Plugins:{TrkDevice:device}}};
  const document={addEventListener(name,fn){listeners[name]=fn;}};
  vm.runInNewContext(source,{window,document,console,Promise,DOMException});
  return {window,core,video,listeners,calls,resolve:()=>pending()};
}
test('native output interruption blocks starts and invalidates an in-flight play',async()=>{
  const x=setup(); let notified=0; x.core.on('audioOutputInterrupted',()=>notified++);
  const inFlight=x.video.play(); x.listeners.audioBecomingNoisy();
  assert.equal(notified,1); assert.equal(x.core.audioSafety.blocked(),true);
  await assert.rejects(x.video.play(),{name:'AbortError'}); x.resolve(); await assert.rejects(inFlight,{name:'AbortError'});
  assert.deepEqual(x.calls,['play','pause','pause']);
  x.core.audioSafety.resume(); assert.equal(x.core.audioSafety.blocked(),false);
  const p=x.video.play(); x.resolve(); await p; assert.equal(x.calls.at(-1),'play');
});
test('interrupt pauses a playing game and untrusted UI events cannot re-enable audio',()=>{
  const x=setup(); x.core.phase='playing'; x.listeners.audioBecomingNoisy();
  assert.ok(x.calls.includes('gamePause')); x.listeners.click({isTrusted:false,target:{closest:()=>true}});
  assert.equal(x.core.audioSafety.blocked(),true);
});
test('only a trusted playback action clears the latch; reconnection or unrelated taps do not',()=>{
  const x=setup(); x.listeners.audioBecomingNoisy();
  x.listeners.click({isTrusted:true,target:{closest:()=>null}}); assert.equal(x.core.audioSafety.blocked(),true);
  x.listeners.click({isTrusted:true,target:{closest:selector=>selector.includes('.mediaPlayBtn') ? {} : null}});
  assert.equal(x.core.audioSafety.blocked(),false);
});
test('web does not install the Android output policy',()=>{
  const x=setup(false); assert.equal(x.core.audioSafety,undefined); assert.equal(x.listeners.audioBecomingNoisy,undefined);
});
