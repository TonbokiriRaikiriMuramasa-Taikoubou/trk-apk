// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const core = fs.readFileSync('js/core.js','utf8');
const favorites = fs.readFileSync('js/favs.js','utf8');
const code = core.slice(core.indexOf('function cleanSongFav('),core.indexOf('/* 🗑 消した trk'));
const context = vm.createContext({});
vm.runInContext(`${code};globalThis.merge=mergeImportedFavs;globalThis.clean=cleanSongFav`,context);
const json = o => JSON.parse(JSON.stringify(o));

test('partial favorites import preserves missing kinds and fields, rejects invalid fields and accepts explicit clearing', () => {
  const old={tv:{sub:['tv-old'],pins:['pin']},fx:{sub:['fx-old']},song:{sub:['song-old'],pins:['pin-old'],locks:['frozen'],active:'sub'}};
  let r=context.merge(old,{song:{sub:[],pins:'broken',active:'nope'},tv:false});
  assert.deepEqual(json(r.value),{tv:old.tv,fx:old.fx,song:{...old.song,sub:[]}});
  assert.deepEqual(json(r.errors),['favs.tv','favs.song.pins','favs.song.active']);
  assert.deepEqual(json(old.song.sub),['song-old'], 'original not mutated');
  r=context.merge(old,{song:{sub:[' song ', 'song']}});
  assert.deepEqual(json(r.value.song.sub),['song']);
  assert.deepEqual(json(r.value.fx),old.fx);
  assert.deepEqual(json(context.merge(old,{tv:{sub:['bad id!']}}).value.tv),old.tv);
  assert.deepEqual(json(context.merge(old,[]).errors),['favs']);
  assert.deepEqual(json(context.clean([' a ', 'a', null, '', 'x'.repeat(201)])),['a','x'.repeat(200)]);
});

test('hold survives contextmenu, cancels on interruption and fires exactly once', () => {
  const dom=new JSDOM('<button></button>'); const w=dom.window; let hidden=false, now=0, next=0; const timers=new Map();
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  const src=favorites.slice(favorites.indexOf('const activeFavoriteHolds'), favorites.indexOf('/* チップを作り直すための小さな合図'));
  const c=vm.createContext({window:w,document:w.document,setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(src+';globalThis.hold=holdButton',c);
  let done=0, short=0; const b=w.document.querySelector('button'); c.hold(b,3000,()=>done++,()=>short++);
  const event=type=>b.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0}));
  const advance=ms=>{now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
  event('pointerdown'); advance(800); const e=new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true});b.dispatchEvent(e);assert.equal(e.defaultPrevented,true);advance(2200);event('pointerup');event('click');assert.equal(done,1);assert.equal(short,0);
  event('pointerdown');advance(500);event('pointercancel');advance(3000);assert.equal(done,1);
  event('pointerdown');advance(500);hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));hidden=false;advance(3000);assert.equal(done,1);
  event('pointerdown');advance(500);w.dispatchEvent(new w.Event('blur'));advance(3000);assert.equal(done,1);
  event('pointerdown');advance(500);event('pointerup');event('click');advance(3000);assert.equal(done,1);assert.equal(short,1);
  dom.window.close();
});
