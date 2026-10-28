// SPDX-License-Identifier: GPL-3.0-or-later
// Android WebView best-effort output-disconnect protection; not an Audio Focus service.
(() => {
  "use strict";
  const cap = window.Capacitor, core = window.Trk && window.Trk.core;
  if (!core || !cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return;
  const device = cap.Plugins && cap.Plugins.TrkDevice, video = core.video;
  if (!device || typeof device.addListener !== "function" || !video) return;
  // The native recovery marker is present before any other playback scripts.
  let recoveryPending = /(?:^|[?&])trkRendererRecovery=1(?:&|$)/.test(window.location.search);
  let blocked = recoveryPending, generation = 0;
  const rawPlay = video.play.bind(video);
  const interrupted = () => new DOMException("Audio output was interrupted", "AbortError");
  core.audioSafety = {
    blocked:() => blocked,
    version:() => generation,
    resume:() => {
      blocked = false;
      if (recoveryPending && typeof device.acknowledgeRendererRecovery === "function") {
        recoveryPending = false;
        try { Promise.resolve(device.acknowledgeRendererRecovery()).catch(error => console.warn("Unable to save recovery acknowledgement", error)); }
        catch (error) { console.warn("Unable to save recovery acknowledgement", error); }
      }
    }
  };
  // Guard automatic callers in the existing WebView code. Pause also cancels a
  // browser play request already pending; check again if that promise resolves.
  video.play = (...args) => {
    if (blocked) return Promise.reject(interrupted());
    const attempt = generation;
    let result;
    try { result = rawPlay(...args); } catch (error) { return Promise.reject(error); }
    return Promise.resolve(result).then(value => {
      if (attempt !== generation) {
        if (blocked) video.pause();
        throw interrupted();
      }
      return value;
    });
  };
  function outputInterrupted() {
    generation++; blocked = true;
    // Cancel Web Audio reverse and pending preview state before pausing video.
    core.emit("audioOutputInterrupted");
    if (core.phase === "playing" && window.Trk.play && window.Trk.play.pauseGame) window.Trk.play.pauseGame();
    else video.pause();
  }
  // Only explicit trusted actions that start/select playback clear the latch;
  // reconnect, screen restoration, and arbitrary programmatic clicks do not.
  document.addEventListener("click", event => {
    if (!blocked || !event.isTrusted || !event.target || !event.target.closest) return;
    if (event.target.closest(".libRow:not(.ghost), .mediaQueueItem, .mediaPlayBtn, .bannerPlayBtn, #playBtn, #resumeBtn, #retryBtn, #replayBtn, [data-i18n='mediaPrev'], [data-i18n='mediaNext'], [data-i18n='mediaRestart'], [data-i18n='mediaReverseStart'], [data-i18n='tvpPlayGame']")) core.audioSafety.resume();
  }, true);
  try { Promise.resolve(device.addListener("audioBecomingNoisy", outputInterrupted)).catch(error => console.warn("Unable to register audio output handler", error)); }
  catch (error) { console.warn("Unable to register audio output handler", error); }
})();
