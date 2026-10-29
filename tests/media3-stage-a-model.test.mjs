// SPDX-License-Identifier: GPL-3.0-or-later
// Exploratory deterministic model only: no Android, Media3, or real audio.
import test from "node:test";
import assert from "node:assert/strict";
import {FakeWebPlayer, FakeNativeProjection} from "./helpers/media3-stage-a-model.mjs";
const cmd=(web,id,type,deadline=100)=>({epoch:web.epoch,id,type,generation:web.generation,deadline});
function setup(capacity) {
  const web=new FakeWebPlayer(["a","b","c"],capacity), native=new FakeNativeProjection();
  native.attach("epoch-1"); assert.ok(native.accept(web.attach("epoch-1")));
  assert.ok(native.accept(web.allowExplicitStart())); return {web,native};
}
test("acknowledgement is separate from actual state and duplicate IDs cannot execute twice",()=>{
  const {web,native}=setup(); const next=cmd(web,"1","next");
  assert.equal(web.receive(next,0).status,"pending"); assert.equal(native.playing,false); assert.equal(native.track,"a");
  assert.equal(web.receive(next,0).status,"pending"); assert.equal(web.receive({...next,type:"previous"},0).status,"id-conflict");
  const result=web.complete("1",2); assert.equal(result.status,"done"); assert.ok(native.accept(result.snapshot,"1"));
  assert.equal(native.track,"b"); assert.equal(native.playing,true);
  assert.equal(web.receive(next,3).status,"done"); assert.equal(web.complete("1",4).status,"done"); assert.equal(web.index,1);
});
test("play and pause commands are idempotent rather than toggles",()=>{
  const {web}=setup(), first=cmd(web,"play-1","play"); web.receive(first,0); web.complete(first.id,1);
  const again=cmd(web,"play-2","play"); web.receive(again,2); web.complete(again.id,3); assert.equal(web.playing,true);
  const stop=cmd(web,"pause-1","pause"); assert.equal(web.receive(stop,4).status,"done");
  const generation=web.generation; assert.equal(web.receive(stop,5).status,"done"); assert.equal(web.generation,generation);
  const stopAgain=cmd(web,"pause-2","pause"); web.receive(stopAgain,6); assert.equal(web.playing,false);
});
test("consecutive next commands preserve order; pause invalidates pending work",()=>{
  const {web}=setup(), one=cmd(web,"one","next"), two=cmd(web,"two","next");
  web.receive(one,0); web.receive(two,0); assert.equal(web.complete("two",1).status,"waiting");
  assert.equal(web.complete("one",2).snapshot.track,"b"); assert.equal(web.complete("two",3).snapshot.track,"c");
  const pending=cmd(web,"later","previous"); web.receive(pending,4);
  assert.equal(web.receive(cmd(web,"pause","pause"),5).snapshot.playing,false);
  assert.equal(web.complete("later",6).status,"cancelled"); assert.equal(web.snapshot().track,"c");
});
test("an interruption invalidates queued or late work even after explicit unblock",()=>{
  const {web,native}=setup(), old=cmd(web,"old","play"); web.receive(old,0);
  const stop=web.interrupt(); assert.ok(native.accept(stop)); web.allowExplicitStart();
  assert.equal(web.complete("old",1).status,"cancelled");
  assert.equal(web.receive({...old,id:"late"},1).status,"stale");
  assert.equal(web.playing,false); assert.equal(native.playing,false);
});
test("old epochs and out-of-order snapshots never overwrite a newer projection",()=>{
  const {web,native}=setup(), earlier=web.snapshot(), later=web.interrupt();
  assert.ok(native.accept(later)); assert.equal(native.accept(earlier),false);
  const oldCmd=cmd(web,"old","play"); native.attach("epoch-2"); assert.ok(native.accept(web.attach("epoch-2")));
  assert.equal(native.accept(later),false); assert.equal(web.receive(oldCmd,1).status,"wrong-epoch");
  assert.throws(()=>web.attach("epoch-1"),/unique/);
});
test("expired or cancelled commands do not start; bounded dedup fails closed",()=>{
  const {web}=setup(3); const one=cmd(web,"1","play",10);
  assert.equal(web.receive(one,10).status,"expired");
  const two=cmd(web,"2","play"); web.receive(two,0); assert.ok(web.cancel("2")); assert.equal(web.complete("2",1).status,"cancelled");
  const three=cmd(web,"3","play",10); web.receive(three,0); assert.equal(web.complete("3",10).status,"expired");
  assert.equal(web.receive(cmd(web,"4","play"),0).status,"capacity"); assert.equal(web.receive(one,11).status,"expired"); assert.equal(web.playing,false);
});
test("transport loss retires the projection until a new epoch is explicitly established",()=>{
  const {web,native}=setup(), request=cmd(web,"1","play"); web.receive(request,0);
  const late=web.complete("1",1).snapshot; web.interrupt(); native.unavailable();
  assert.equal(native.accept(late),false); assert.equal(native.available,false);
  native.attach("epoch-2"); assert.ok(native.accept(web.attach("epoch-2")));
  assert.equal(native.playing,false); assert.equal(web.playing,false); assert.equal(web.blocked,true);
});
test("invalid or contradictory snapshots are rejected without corrupting state",()=>{
  const {web,native}=setup(), current=native.track, base=web.snapshot();
  for (const bad of [
    {...base,revision:base.revision+1,playing:true,blocked:true},
    {...base,revision:base.revision+1,playing:"true"},
    {...base,revision:base.revision+1,track:null},
    {...base,revision:base.revision+1,generation:base.generation-1},
  ]) assert.equal(native.accept(bad),false);
  assert.equal(native.track,current); assert.equal(native.playing,false);
});
test("a local timeout alone cannot prove that the remote player stopped",()=>{
  const {web,native}=setup(), request=cmd(web,"1","play",10); web.receive(request,0);
  const result=web.complete("1",9); assert.equal(web.playing,true); // reply is delayed in transit
  native.timeout("1"); assert.equal(native.available,false); assert.equal(native.playing,false);
  assert.equal(native.accept(result.snapshot,"1"),false); assert.equal(native.accept(result.snapshot),false,"an unsolicited late snapshot cannot revive a retired connection");
  assert.throws(()=>native.attach("epoch-1"),/unique/);
  assert.equal(web.playing,true,"unreachable or late JS may still be audible");
  web.interrupt(); assert.equal(web.playing,false); // only if interruption reaches the Web player
});
