// SPDX-License-Identifier: GPL-3.0-or-later
// Android-only PiP policy; native lifecycle decides whether PiP can start.
(() => {
  "use strict";
  const cap = window.Capacitor, core = window.Trk && window.Trk.core;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform() || !core) return;
  const device = cap.Plugins && cap.Plugins.TrkDevice;
  const key = "trk_apk_pip_mode_v1", audioKey = "trk_apk_pip_audio_v1";
  const texts = {
    ja:{title:"画中絵を常に使用する", audio:"音楽も小窓に表示する（曲名とアイコン）", hint:"再生中にアプリを離れると小窓を試みます。初期オフ。Androidの画中絵許可が必要です。実機未検証で、機種により動作しない場合があります。", unavailable:"この端末では画中絵を使えないか、Androidの設定で許可されていません。"},
    en:{title:"Always use picture-in-picture", audio:"Show music in a window too (title and icon)", hint:"Tries to open a window when leaving the playing app. Off by default; Android PiP permission is required. Not yet tested on a device.", unavailable:"PiP is unavailable or disabled in Android settings."},
    zh:{title:"始终使用画中画", audio:"音乐也显示小窗口（标题和图标）", hint:"离开正在播放的应用时尝试显示小窗口。默认关闭，需要Android画中画权限，尚未在设备上验证。", unavailable:"此设备不支持画中画或Android设置中未允许。"},
    ko:{title:"항상 화면 속 화면 사용", audio:"음악도 작은 창으로 표시 (제목과 아이콘)", hint:"재생 중 앱을 나가면 작은 창을 시도합니다. 기본은 꺼짐이며 Android 권한이 필요합니다. 실기기 미검증입니다.", unavailable:"이 기기에서 화면 속 화면을 사용할 수 없거나 Android 설정에서 허용하지 않았습니다."}
  };
  const text = () => texts[core.settings.language] || texts.en;
  let mode = "off", includeAudio = false, available = false, eligible = false, active = false, serial = Promise.resolve();
  try {
    const saved = localStorage.getItem(key);
    includeAudio = localStorage.getItem(audioKey) === "1" || saved === "all";
    if (saved === "video" || saved === "all") mode = includeAudio ? "all" : "video";
  } catch (_) {}
  let use, audio, title, audioLabel, hint, warning, pipView, pipTitle;
  function writeMode() { try { localStorage.setItem(key, mode); localStorage.setItem(audioKey, includeAudio ? "1" : "0"); } catch (_) {} }
  function isPlaying() {
    return !!(core.phase === "title" && core.videoReady && core.currentSong &&
      core.video && !core.video.paused && !core.video.ended);
  }
  function wantsPip() { return mode !== "off" && isPlaying() && (mode === "all" || core.video.videoWidth > 0); }
  function render() {
    if (!use) return;
    const t = text(); title.textContent = t.title; audioLabel.textContent = t.audio; hint.textContent = t.hint;
    warning.textContent = t.unavailable; warning.hidden = available;
    use.checked = mode !== "off"; audio.checked = includeAudio; audio.disabled = mode === "off";
    if (pipTitle) pipTitle.textContent = (core.currentSong && (core.currentSong.title || core.currentSong.name)) || core.mediaName || "trk!";
  }
  function sync() {
    const want = wantsPip();
    render();
    if (!device || typeof device.setPipEligible !== "function") { available = eligible = false; render(); return; }
    // Capture dimensions with eligibility: later metadata may describe a different
    // track by the time this serialized call reaches Android. Audio uses 16:9.
    const videoWidth = core.video && core.video.videoWidth || 0;
    const videoHeight = core.video && core.video.videoHeight || 0;
    // Serialize updates so a slow native call cannot restore stale eligibility.
    serial = serial.catch(() => {}).then(() => device.setPipEligible({enabled:want, videoWidth, videoHeight})).then(result => {
      available = !!result.available; eligible = !!result.eligible; render();
    }).catch(() => { available = eligible = false; render(); });
  }
  function init() {
    if (use) return true;
    const options = document.querySelector("#mediaPlayerMode .mediaOptions");
    if (!options) return false;
    const box = document.createElement("section"); box.className = "apk-pip-options";
    const label = document.createElement("label"); label.className = "check";
    use = document.createElement("input"); use.type = "checkbox"; use.id = "apkAutoPip";
    title = document.createElement("span"); label.append(use, title);
    const label2 = document.createElement("label"); label2.className = "check";
    audio = document.createElement("input"); audio.type = "checkbox"; audio.id = "apkPipAudio";
    audioLabel = document.createElement("span"); label2.append(audio, audioLabel);
    hint = document.createElement("p"); hint.className = "hint";
    warning = document.createElement("p"); warning.className = "hint"; warning.setAttribute("role", "status");
    box.append(label, label2, hint, warning); options.append(box);
    use.addEventListener("change", () => { mode = use.checked ? (includeAudio ? "all" : "video") : "off"; writeMode(); sync(); });
    audio.addEventListener("change", () => { includeAudio = audio.checked; mode = includeAudio ? "all" : "video"; writeMode(); sync(); });
    pipView = document.createElement("div"); pipView.id = "apkPipView"; pipView.hidden = true;
    const icon = document.createElement("img"); icon.src = "icons/icon-192.png"; icon.alt = "";
    pipTitle = document.createElement("strong"); pipView.append(icon, pipTitle); document.body.append(pipView);
    for (const event of ["play", "pause", "ended", "loadedmetadata", "resize", "emptied"]) core.video.addEventListener(event, sync);
    for (const event of ["language", "songSelected", "mediaReady", "phase"]) core.on(event, sync);
    const player = document.getElementById("mediaPlayerMode");
    new MutationObserver(sync).observe(player, {attributes:true, attributeFilter:["hidden"]});
    sync();
    return true;
  }
  // A delayed fallback belongs to exactly one hide/PiP transition. Invalidate
  // it on foreground, PiP entry, or a newer attempt, even if its callback was
  // already queued before clearTimeout ran.
  let transitionTimer = null, transitionVersion = 0;
  function cancelTransition() {
    transitionVersion++;
    if (transitionTimer !== null) clearTimeout(transitionTimer);
    transitionTimer = null;
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cancelTransition(); }, true);
  window.addEventListener("trkApkPipChanged", e => {
    const wasActive = active;
    active = e.detail === true;
    if (active) cancelTransition();
    const video = active && core.video && core.video.videoWidth > 0;
    document.body.classList.toggle("apk-in-pip", active);
    document.body.classList.toggle("apk-pip-video", video);
    if (pipView) pipView.hidden = !active || video;
    render();
    // Only a real active -> inactive PiP transition is a dismissal. An extra
    // inactive callback must not stop antenna-enabled background playback.
    if (wasActive && !active && document.hidden && core.video && !core.video.paused) core.video.pause();
    if (!active) sync();
  });
  window.TrkApkPip = {
    // Only an active PiP window can override antenna-off background policy.
    // Eligibility is insufficient and becomes false when PiP is paused.
    allowsPlaybackStart:() => !document.hidden || !!core.settings.fxAntenna || active,
    shouldKeepForTransition:() => (active || eligible) && wantsPip(),
    checkTransition:() => {
      cancelTransition();
      const version = transitionVersion;
      transitionTimer = setTimeout(() => {
        if (version !== transitionVersion) return;
        transitionTimer = null;
        if (document.hidden && !active && !core.settings.fxAntenna && core.video && !core.video.paused) core.video.pause();
      }, 1500);
    }
  };
  function setup() {
    if (init()) return;
    // The upstream media player can build its overlay after DOMContentLoaded.
    const observer = new MutationObserver(() => { if (init()) observer.disconnect(); });
    observer.observe(document.body, {childList:true, subtree:true});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, {once:true}); else setup();
})();
