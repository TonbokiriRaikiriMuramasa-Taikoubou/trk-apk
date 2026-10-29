// SPDX-License-Identifier: GPL-3.0-or-later
// Exercise the actual index.html script order; jsdom is not a WebView/audio test.
import {test} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {TextEncoder,TextDecoder} from "node:util";
import {JSDOM,VirtualConsole} from "jsdom";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
for (const native of [false,true]) test(`visibility keeps playback but delivers cleanup (${native ? "Android" : "web"})`, {timeout:30000}, async () => {
  const server=http.createServer((req,res) => {
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const file=path.resolve(root,"."+(pathname==="/"?"/index.html":pathname));
    if (!file.startsWith(root+path.sep)) return res.writeHead(403).end();
    fs.readFile(file,(err,data) => {if(err) return res.writeHead(404).end(); res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json"})[path.extname(file)]||"application/octet-stream"}); res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let dom, hidden=false, recording=false, noisyCallback; const called=[], failures=[];
  const vc=new VirtualConsole(); vc.on("jsdomError",e=>failures.push(e.message));
  try {
    dom=await JSDOM.fromURL(`http://127.0.0.1:${server.address().port}/`, {resources:"usable",runScripts:"dangerously",pretendToBeVisual:true,virtualConsole:vc,beforeParse(w) {
      w.TextEncoder=TextEncoder; w.TextDecoder=TextDecoder;
      Object.defineProperty(w.document,"hidden",{get:()=>hidden,configurable:true});
      const add=w.document.addEventListener;
      w.document.addEventListener=function(type,fn,opts){
        if(type==="visibilitychange" && typeof fn==="function") {
          const original=fn; fn=function(event){if(recording) called.push(original.toString()); return original.call(this,event);};
        }
        return add.call(this,type,fn,opts);
      };
      if(native) w.Capacitor={isNativePlatform:()=>true,Plugins:{App:{addListener:()=>Promise.resolve({remove(){}}),exitApp:()=>Promise.resolve()},TrkDevice:{addListener:(name,cb)=>{if(name==="audioBecomingNoisy") noisyCallback=cb; return Promise.resolve({remove(){}});},setPipEligible:async ({enabled})=>({available:true,eligible:enabled}),setOrientationLock:async ({locked})=>({locked})}}};
      Object.defineProperty(w.navigator,"serviceWorker",{value:{register:async()=>({}),getRegistrations:async()=>[]}});
      w.matchMedia=()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}});
      w.fetch=async url => String(url).endsWith("assets/mmd/lat-miku/preset.json") ? {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(path.join(root,"assets/mmd/lat-miku/preset.json"),"utf8"))} : {ok:false,status:404,json:async()=>({}),text:async()=>""};
      const gradient={addColorStop(){}}; const ctx=new Proxy({canvas:null,measureText:t=>({width:String(t).length*9}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,createPattern:()=>null},{get:(o,p)=>p in o?o[p]:()=>{},set:(o,p,v)=>(o[p]=v,true)});
      w.HTMLCanvasElement.prototype.getContext=function(){ctx.canvas=this;return ctx;}; w.HTMLMediaElement.prototype.load=function(){}; w.scrollTo=()=>{};
    }});
    const w=dom.window; if(w.document.readyState!=="complete") await new Promise(resolve=>w.addEventListener("load",resolve,{once:true}));
    await new Promise(resolve=>setTimeout(resolve,1200));
    const d=w.document, core=w.Trk.core; let paused=false, pauses=0;
    if (!native) assert.equal(d.getElementById("apkFxRecoveryNotice"),null,"web does not install the Android recovery notice");
    Object.defineProperty(core.video,"paused",{get:()=>paused,configurable:true});
    core.video.pause=()=>{paused=true; pauses++;};
    core.phase="title"; core.settings.fxAntenna=true; core.settings.mediaLoopTrigger="hold";
    core.videoReady=true; core.currentSong={key:"fixture",title:"fixture"};
    Object.defineProperty(core.video,"duration",{value:100,configurable:true});
    d.getElementById("guideSkip").click();
    w.TrkMediaPlayer.open(); assert.equal(w.TrkMediaPlayer.isOpen(),true);
    const previousOption=d.getElementById("previousAlwaysTrack");
    assert.equal(previousOption.checked,false); assert.equal(core.settings.previousAlwaysTrack,false);
    core.video.currentTime=10; assert.equal(w.TrkMediaPlayer.restartForPrevious(),true); assert.equal(core.video.currentTime,0);
    previousOption.click(); assert.equal(core.settings.previousAlwaysTrack,true);
    assert.equal(JSON.parse(w.localStorage.getItem("shadow_taiko_preferences_v2")).previousAlwaysTrack,true);
    core.video.currentTime=10; assert.equal(w.TrkMediaPlayer.restartForPrevious(),false); assert.equal(core.video.currentTime,10);
    previousOption.click(); assert.equal(core.settings.previousAlwaysTrack,false);
    assert.equal(JSON.parse(w.localStorage.getItem("shadow_taiko_preferences_v2")).previousAlwaysTrack,false);
    assert.equal(w.TrkVideoMax.open(),true, "initialize fullscreen listeners");
    const loop=d.querySelector(".mediaLoopBox"), status=loop.querySelector(".hint");
    core.video.currentTime=10; loop.querySelector('[data-i18n="mediaLoopSetA"]').click();
    core.video.currentTime=20; loop.querySelector('[data-i18n="mediaLoopSetB"]').click();
    const released=status.textContent;
    w.dispatchEvent(new w.KeyboardEvent("keydown",{code:core.settings.videoKeys[6],bubbles:true}));
    assert.notEqual(status.textContent,released,"hold loop must be active before hiding");
    recording=true; hidden=true; d.dispatchEvent(new w.Event("visibilitychange")); recording=false;
    assert.equal(status.textContent,released,"hiding releases the actual held loop");
    for (const piece of ["stopAllNotes", "stopHoldSeek", "releaseHeldLoop", "menuVideoTick", "previewTick"]) assert.ok(called.some(s=>s.includes(piece)),`${piece} cleanup must receive visibilitychange`);
    assert.equal(pauses,0,"antenna ON keeps the track playing");
    hidden=false; d.dispatchEvent(new w.Event("visibilitychange"));
    core.settings.fxAntenna=false; paused=false; hidden=true; d.dispatchEvent(new w.Event("visibilitychange"));
    assert.ok(pauses>0,"antenna OFF pauses the track");
    hidden=false; d.dispatchEvent(new w.Event("visibilitychange"));
    if (native) {
      core.videoReady=true; core.currentSong={key:"fixture",title:"fixture"};
      Object.defineProperty(core.video,"videoWidth",{value:640,configurable:true});
      Object.defineProperty(core.video,"ended",{value:false,configurable:true});
      paused=false; d.getElementById("apkAutoPip").click();
      await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(w.TrkApkPip.shouldKeepForTransition(),true);
      let fallback; const original=w.setTimeout;
      w.setTimeout=(fn,ms,...args)=>ms===1500 ? (fallback=fn,999) : original(fn,ms,...args);
      const before=pauses; hidden=true; d.dispatchEvent(new w.Event("visibilitychange"));
      w.setTimeout=original;
      assert.equal(pauses,before,"PiP attempt gets time to enter"); assert.equal(typeof fallback,"function");
      fallback(); assert.equal(pauses,before+1,"failed PiP pauses with antenna OFF");
      hidden=false; d.dispatchEvent(new w.Event("visibilitychange"));
    }
    w.TrkVideoMax.close(); w.TrkMediaPlayer.close(false);
    let gamePauses=0; const pauseGame=w.Trk.play.pauseGame; w.Trk.play.pauseGame=()=>gamePauses++;
    core.phase="playing"; core.settings.fxAntenna=true; core.settings.autoPlay=false;
    hidden=true; d.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(gamePauses,1,"manual gameplay is paused despite antenna");
    hidden=false; d.dispatchEvent(new w.Event("visibilitychange"));
    core.settings.autoPlay=true; hidden=true; d.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(gamePauses,1,"auto-play keeps the existing antenna policy");
    w.Trk.play.pauseGame=pauseGame;
    if (native) {
      // Real synth listeners with fake Web Audio nodes: both a held note and an
      // already-released envelope tail must disconnect on the native event.
      hidden=false; d.dispatchEvent(new w.Event("visibilitychange")); core.phase="title";
      core.settings.synthModeDisabled=false; core.settings.synthModeFastStart=true;
      const sources=[], nodes=[], convolvers=[]; let failFxGain=false;
      const param=()=>({value:1,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},cancelAndHoldAtTime(){},setTargetAtTime(){}});
      const node=()=>{const n={links:new Set(),connect(destination){this.links.add(destination);return destination;},disconnect(destination){if(destination)this.links.delete(destination);else this.links.clear(); this.disconnected=true;},gain:param(),frequency:param(),Q:param()}; nodes.push(n);return n;};
      const source=()=>{ const s={...node(),detune:param(),start(){},stop(){},disconnected:false,disconnect(){this.disconnected=true;},addEventListener(type,fn){if(type==="ended")this.ended=fn;}}; sources.push(s); return s; };
      const ac={currentTime:5,state:"running",sampleRate:100,destination:{},createGain:()=>{if(failFxGain) throw new Error("test FX rebuild failure");return node();},createBiquadFilter:node,createBufferSource:source,createMediaElementSource:node,
        createBuffer:(_channels,length)=>({getChannelData:()=>new Float32Array(length)}),
        createConvolver:()=>{const n=node(); convolvers.push(n); return n;},
        createDynamicsCompressor:()=>({...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()}),
        createAnalyser:()=>({...node(),frequencyBinCount:32,getByteFrequencyData(){}}),
        createOscillator:source};
      w.Trk.media.getAC=()=>ac; w.Trk.media.audioCtx=ac;
      assert.equal(w.TrkFX.select("piano"),true); assert.ok(convolvers.length>0,"real FX chain uses reverb");
      const fxOutput=nodes.find(n=>n.links.has(ac.destination)); assert.ok(fxOutput,"FX reaches output initially");
      const extra=d.createElement("audio"); let extraPauses=0; extra.pause=()=>extraPauses++;
      assert.ok(w.TrkFX.tapElement(extra));
      const fxSettings=JSON.stringify(w.TrkFX.current());
      w.TrkFX={...w.TrkFX,tap:()=>null};
      const power=d.querySelector("#fxDock .dockPow");
      power.dispatchEvent(new w.MouseEvent("pointerdown",{bubbles:true,button:0}));
      await new Promise(resolve=>setTimeout(resolve,250));
      power.dispatchEvent(new w.MouseEvent("pointerup",{bubbles:true,button:0}));
      const synth=d.getElementById("synthMode"); assert.equal(synth.hidden,false);
      const key=synth.querySelector("button[data-midi]");
      const pointer=(type,id)=>{ const event=new w.MouseEvent(type,{bubbles:true,button:0}); Object.defineProperty(event,"pointerId",{value:id}); key.dispatchEvent(event); };
      pointer("pointerdown",1); pointer("pointerup",1); pointer("pointerdown",2);
      assert.equal(sources.length,2,"one release tail and one held voice exist");
      assert.equal(sources.some(s=>s.disconnected),false);
      d.querySelector('[data-i18n="owStart"]').click();
      assert.equal(sources.length,22,"latency calibration schedules 20 future clicks");
      core.settings.seEnabled=true; w.Trk.media.seBuffers[0]={}; w.Trk.media.playSE(0);
      assert.equal(sources.length,23,"a custom game sound is active");
      paused=false; assert.equal(typeof noisyCallback,"function"); noisyCallback();
      assert.equal(fxOutput.links.has(ac.destination),false,"FX output is isolated immediately");
      assert.ok(extraPauses>0,"additional FX media is paused");
      assert.ok(sources.slice(0,2).every(s=>s.disconnected),"output event immediately disconnects held and released synth voices");
      assert.ok(sources.slice(2,22).every(s=>s.disconnected),"output event cancels future calibration clicks");
      assert.ok(sources[22].disconnected,"custom game sound is disconnected");
      w.Trk.media.playSE(0); assert.equal(sources.length,23,"automatic game sounds remain blocked");
      assert.equal(d.querySelector('[data-i18n="owApply"]').hidden,true);
      d.querySelector('[data-i18n="owStart"]').click();
      assert.equal(sources.length,43,"a deliberate new calibration remains possible");
      sources.slice(2,22).forEach(s=>s.onended?.());
      assert.ok(sources.slice(23).every(s=>!s.disconnected),"old cleanup leaves new clicks intact");
      noisyCallback(); assert.ok(sources.slice(23).every(s=>s.disconnected));
      assert.equal(core.audioSafety.blocked(),true); assert.equal(paused,true);
      await assert.rejects(core.video.play(),error=>error.name==="AbortError");
      const oldConvolver=convolvers.at(-1); core.audioSafety.resume(); assert.equal(core.audioSafety.blocked(),false);
      assert.equal(fxOutput.links.has(ac.destination),true,"FX output returns after explicit resume");
      assert.equal(oldConvolver.disconnected,true,"old reverb memory is discarded before reconnecting");
      assert.ok(convolvers.length>1); assert.equal(JSON.stringify(w.TrkFX.current()),fxSettings,"FX settings survive");
      w.Trk.media.playSE(0); assert.equal(sources.length,44,"game sound works after deliberate resume");
      // Failure on explicit resume must keep the video stopped, show a visible
      // warning and allow a later user-initiated retry without auto-playing.
      noisyCallback(); failFxGain=true;
      assert.equal(core.audioSafety.resume(),false); assert.equal(core.audioSafety.blocked(),true);
      const warning=d.getElementById("apkFxRecoveryNotice"); assert.ok(warning && !warning.hidden);
      assert.equal(warning.getAttribute("role"),"alert"); assert.ok(warning.textContent.length>20);
      core.applyLanguage("en"); assert.match(warning.textContent,/Audio could not be restored/);
      core.applyLanguage("ja"); assert.match(warning.textContent,/復旧に失敗/);
      assert.equal(fxOutput.links.has(ac.destination),false); assert.equal(paused,true);
      await assert.rejects(core.video.play(),error=>error.name==="AbortError");
      d.querySelector('.mediaPlayBtn')?.click(); assert.equal(core.audioSafety.blocked(),true,"untrusted click cannot retry");
      failFxGain=false; assert.equal(core.audioSafety.resume(),true);
      assert.equal(warning.hidden,true); assert.equal(fxOutput.links.has(ac.destination),true);
      assert.equal(paused,true,"restoring the graph does not itself start playback");
    }
    assert.deepEqual(failures,[]);
  } finally {if(dom) dom.window.close(); await new Promise(resolve=>server.close(resolve));}
});
