// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/media-player-mode.js", import.meta.url), "utf8");
const functions = ["clearMediaSessionPosition", "updateMediaSessionPosition", "updateMediaSessionMetadata", "updateMediaSession", "installMediaSessionObservers"];
function setup() {
  const events = {}, hooks = {}, positions = [], metadata = [], state = {reverse:false, loading:false};
  const video = {duration:180, currentTime:12, playbackRate:1, addEventListener(type, fn) { (events[type] ||= []).push(fn); }};
  const core = {video, videoReady:true, currentSong:{key:"one", title:"Original"}, mediaName:"file", baseName:n => n, on(type, fn) { (hooks[type] ||= []).push(fn); }};
  const session = {setPositionState(...args) { positions.push(args.length ? {...args[0]} : null); }, set metadata(value) { metadata.push(value); }};
  const sandbox = {core, navigator:{mediaSession:session}, Number, Math,
    MediaMetadata:class {constructor(value) { Object.assign(this, value); }},
    trackDisplayMeta:s => ({title:s?.display || s?.title, artist:"Artist", album:"Album"})};
  Object.defineProperty(sandbox, "reverseActive", {get:() => state.reverse});
  Object.defineProperty(sandbox, "reverseLoading", {get:() => state.loading});
  const extracted = functions.map(name => {
    const match = source.match(new RegExp(`function ${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, `real ${name} exists`); return match[0];
  }).join("\n");
  assert.match(source, /installMediaSessionObservers\(\);/, "observer installer is wired into the app");
  vm.runInNewContext(`let sessionHasPosition = false, sessionTrackPending = false;\n${extracted}\ninstallMediaSessionObservers();`, sandbox);
  return {video, core, state, session, navigator:sandbox.navigator, positions, metadata, emit:(type) => (events[type] || []).forEach(fn => fn()), hook:(type, ...args) => (hooks[type] || []).forEach(fn => fn(...args))};
}
test("session position follows seeks, rate changes and playback even with the player closed", () => {
  const x = setup();
  x.emit("play"); assert.deepEqual(x.positions.at(-1), {duration:180, playbackRate:1, position:12});
  x.video.currentTime=70; x.emit("seeked"); assert.equal(x.positions.at(-1).position,70);
  x.video.playbackRate=1.5; x.emit("ratechange"); assert.equal(x.positions.at(-1).playbackRate,1.5);
  x.video.currentTime=400; x.emit("pause"); assert.equal(x.positions.at(-1).position,180);
  const count=x.positions.length; x.emit("timeupdate"); assert.equal(x.positions.length,count, "avoid per-frame session updates");
});
test("reverse seeks clear the misleading position once, then do not publish every frame", () => {
  const x=setup(); x.emit("play"); x.state.reverse=true; x.core.refreshMediaSessionPosition();
  assert.equal(x.positions.at(-1),null); const count=x.positions.length;
  for (let i=0; i<40; i++) x.emit("seeked");
  assert.equal(x.positions.length,count);
  x.state.reverse=false; x.video.currentTime=20; x.core.refreshMediaSessionPosition();
  assert.equal(x.positions.at(-1).position,20);
});
test("switching or unloading a track clears old position before publishing a new one", () => {
  const x = setup(); x.emit("play");
  x.core.currentSong={key:"two", title:"Next"}; x.hook("songSelected", x.core.currentSong);
  assert.equal(x.positions.at(-1),null); assert.equal(x.metadata.at(-1).title,"Next");
  x.core.videoReady=false; x.video.duration=NaN; x.emit("emptied");
  assert.equal(x.positions.filter(p => p === null).length,1, "no repeated clears");
  x.core.videoReady=true; x.video.duration=240; x.video.currentTime=2; x.emit("durationchange");
  assert.equal(x.positions.at(-1),null, "loading cannot publish a mismatched old position");
  x.hook("mediaReady");
  assert.deepEqual(x.positions.at(-1), {duration:240,playbackRate:1,position:2});
  x.video.duration=Infinity; x.emit("durationchange"); assert.equal(x.positions.at(-1),null);
});
test("reload clears the position until the replacement media is ready", () => {
  const x=setup(); x.emit("play"); x.hook("beforeLoad"); assert.equal(x.positions.at(-1), null);
  x.emit("play"); assert.equal(x.positions.at(-1), null);
  x.core.videoReady=true; x.video.duration=90; x.video.currentTime=0; x.hook("mediaReady");
  assert.deepEqual(x.positions.at(-1), {duration:90,playbackRate:1,position:0});
});
test("unsupported or throwing Media Session position APIs never interrupt playback events", () => {
  const x=setup(); x.emit("play");
  x.session.setPositionState=() => { throw new Error("unsupported"); };
  assert.doesNotThrow(() => x.emit("seeked"));
  x.navigator.mediaSession=undefined;
  assert.doesNotThrow(() => { x.emit("play"); x.hook("songSelected", x.core.currentSong); x.hook("mediaReady"); });
});
test("current track tags update metadata; unrelated tags do not overwrite it", () => {
  const x=setup(); x.emit("play"); assert.equal(x.metadata.at(-1).title,"Original");
  const count=x.metadata.length; x.hook("songTags", {key:"other"}); assert.equal(x.metadata.length,count);
  x.core.currentSong.display="Tagged name"; x.hook("songTags", x.core.currentSong);
  assert.equal(x.metadata.at(-1).title,"Tagged name");
  x.hook("chart"); assert.equal(x.metadata.at(-1).title,"Tagged name", "chart updates retain the display name");
});
test("invalid positions are cleared instead of sending invalid session state", () => {
  const x=setup(); x.emit("play"); x.video.currentTime=NaN; x.emit("seeked"); assert.equal(x.positions.at(-1),null);
  x.video.currentTime=3; x.video.playbackRate=0; x.emit("ratechange"); assert.equal(x.positions.at(-1),null);
});
