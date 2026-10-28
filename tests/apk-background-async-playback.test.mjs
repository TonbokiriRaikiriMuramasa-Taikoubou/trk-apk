// SPDX-License-Identifier: GPL-3.0-or-later
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const player=fs.readFileSync(new URL("../js/media-player-mode.js", import.meta.url),"utf8");
const library=fs.readFileSync(new URL("../js/library.js", import.meta.url),"utf8");
function fn(src,name) {
  const match=src.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match,`real ${name} exists`); return match[0];
}
function setup() {
  const calls=[], state={allowed:true}, song={key:"new"}; let finish;
  const video={paused:true, volume:0.4, muted:false, currentTime:7, duration:120, src:"blob:test", play(){calls.push("play"); this.paused=false; return Promise.resolve();}};
  const core={phase:"title",currentSong:song,video,videoReady:false,chart:[1],settings:{autoPlay:true,previewEnabled:true,musicVolume:0.8}};
  const window={TrkApkPip:{allowsPlaybackStart:() => state.allowed},Trk:{library:{nextSong:() => song,prevSong:() => song,selectSong:() => new Promise(resolve => {finish=() => {core.videoReady=true; resolve();};})},play:{startGame:() => calls.push("game")}}};
  const sandbox={window,core,video,selectSong(){},startGame(){},mediaActive:() => true,renderMedia(){},
    saveMediaPosition(){},clearMediaLoop(){},savedMediaPosition:() => 0,setRate(){},showMediaStatus(){},updateMediaSession(){},
    stopReverse(){},stopSleepTimer(){},noteMediaPlay(){},stepMedia:dir => calls.push(`step:${dir}`),cancelAnimationFrame(){},fadeTo(){},previewStartFor:() => 0,isFinite,Number};
  vm.runInNewContext(`let sleepTrackMode=false,sleepChapterEnd=0,reverseActive=false,reverseLoading=false,mediaRate=1,fadeRaf=0,mediaPlayNotedKey='',repeatMode='one',shuffle=false;\n${fn(player,"playSong")}\n${fn(player,"sessionSong")}\n${fn(player,"endedMedia")}\n${fn(library,"startPreview")}\nthis.playSong=playSong; this.sessionSong=sessionSong; this.endedMedia=endedMedia; this.startPreview=startPreview;`,sandbox);
  return {sandbox,core,video,calls,state,song,finish:() => finish()};
}
test("a pending remote track load cannot start playback after background is disallowed", async () => {
  const x=setup(); const p=x.sandbox.playSong(x.song); x.state.allowed=false; x.finish(); await p;
  assert.deepEqual(x.calls,[]); assert.equal(x.video.currentTime,7); assert.equal(x.video.volume,0.4);
});
test("a pending library track load cannot auto-start a game after background is disallowed", async () => {
  const x=setup(); const p=x.sandbox.sessionSong(1); x.state.allowed=false; x.finish(); await p;
  assert.deepEqual(x.calls,[]);
});
test("a delayed library preview does not start in a disallowed background", () => {
  const x=setup(); x.core.videoReady=true; x.state.allowed=false;
  x.sandbox.startPreview(); assert.deepEqual(x.calls,[]); assert.equal(x.video.currentTime,7); assert.equal(x.video.volume,0.4);
});
test("a queued repeat-one end event cannot restart playback in a disallowed background", () => {
  const x=setup(); x.core.videoReady=true; x.state.allowed=false; x.sandbox.endedMedia();
  assert.deepEqual(x.calls,[]); assert.equal(x.video.currentTime,7);
});
test("an old pending track load stays cancelled even after explicit output resumption", async () => {
  const x=setup(); let version=0, blocked=false;
  x.core.audioSafety={version:()=>version,blocked:()=>blocked};
  const p=x.sandbox.playSong(x.song); version++; blocked=true; blocked=false;
  x.finish(); await p; assert.deepEqual(x.calls,[]);
});
test("an old remote track request cannot start a game after an interruption", async () => {
  const x=setup(); let version=0; x.core.audioSafety={version:()=>version,blocked:()=>false};
  const p=x.sandbox.sessionSong(1); version++; x.finish(); await p; assert.deepEqual(x.calls,[]);
});
test("a completed load still starts playback when the Android policy allows it", async () => {
  const x=setup(); const p=x.sandbox.playSong(x.song); x.finish(); await p;
  assert.deepEqual(x.calls,["play"]); assert.equal(x.video.paused,false);
});
test("a completed load still starts playback in the web build", async () => {
  const x=setup(); delete x.sandbox.window.TrkApkPip; const p=x.sandbox.playSong(x.song); x.finish(); await p;
  assert.deepEqual(x.calls,["play"]);
});
