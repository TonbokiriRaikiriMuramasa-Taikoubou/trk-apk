// SPDX-License-Identifier: GPL-3.0-or-later
// Native Android back and legacy WebView cache cleanup; browser/PWA stays unchanged.
(() => {
  "use strict";
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  const core = window.Trk && window.Trk.core;
  const lead = {
    ja:"手持ちの曲や動画で遊べる、ひとつの箱です。アカウントは必要ありません。",
    en:"One box for playing with your own music and videos. No account needed.",
    zh:"用自己的音乐和视频来玩的盒子。无需账号。",
    ko:"내 음악과 영상으로 놀 수 있는 하나의 상자예요. 계정은 필요 없어요."
  };
  function welcomeText() {
    const node = document.querySelector("#welcomeBox [data-i18n='welcomeLead']");
    if (node && core) node.textContent = lead[core.settings.language] || lead.en;
  }
  if (core) { core.on("language", welcomeText); welcomeText(); }
  if (!native) return;
  if (core) core.on("language", () => { if (window._trkUpdateOrientationControl) window._trkUpdateOrientationControl(); });
  // WebView cannot promise a media service, lock-screen controls or uninterrupted
  // playback. Keep Android labels explicit about this limitation.
  const antennaLabels = {
    ja:["📡 裏画面でも音の再生を試みる（端末によって停止します）", "📡 裏画面では再生を停止", "Androidでは裏画面の再生を試みます。機種や省電力設定により停止することがあります。通知・ロック画面操作は未対応です。"],
    en:["📡 Try to continue audio in background (may stop)", "📡 Pause in background", "Android background playback is best effort and may stop. Notification and lock-screen controls are not implemented."],
    zh:["📡 尝试后台播放（可能停止）", "📡 后台时暂停", "Android后台播放可能会停止。通知和锁屏控制尚未实现。"],
    ko:["📡 백그라운드 재생 시도 (중단될 수 있음)", "📡 백그라운드에서 일시정지", "Android 백그라운드 재생은 중단될 수 있습니다. 알림 및 잠금 화면 제어는 미구현입니다."]
  };
  if (typeof TEXT !== "undefined") for (const [language, labels] of Object.entries(antennaLabels)) {
    Object.assign(TEXT[language], {dockAntOn:labels[0], dockAntOff:labels[1], dockAntHint:labels[2], dockBackgroundHint:labels[2]});
  }

  // Remove only this app's old worker and versioned shell caches. The share inbox
  // and all user data remain untouched. An old controlling worker ends on reload.
  async function removeOldWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      const scope = new URL("./", location.href).href;
      const script = new URL("./sw.js", location.href).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      const ours = registrations.filter(reg => reg.scope === scope &&
        [reg.active, reg.waiting, reg.installing].some(worker => worker && worker.scriptURL === script));
      const controller = navigator.serviceWorker.controller;
      const controlled = !!controller && ours.some(reg => reg.active && reg.active.scriptURL === controller.scriptURL);
      const removed = await Promise.all(ours.map(reg => reg.unregister()));
      if (removed.some(ok => !ok)) return;
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => /^trk-v\d{4}\.\d{2}\.\d{2}-trk\d+$/.test(key)).map(key => caches.delete(key)));
      }
      // An unregistered worker still controls its current page until navigation.
      // Reload once at startup after cleanup, with a session guard against loops.
      if (controlled && !sessionStorage.getItem("trk_apk_sw_cleanup_reloaded")) {
        sessionStorage.setItem("trk_apk_sw_cleanup_reloaded", "1");
        location.reload();
      }
    } catch (error) { console.warn("Unable to remove the previous offline shell", error); }
  }
  void removeOldWorker();

  const app = cap.Plugins && cap.Plugins.App;
  if (!app || typeof app.addListener !== "function" || !core) {
    console.warn("Android back handler unavailable: Capacitor App plugin not loaded");
    return;
  }
  const visible = node => !!node && !node.closest("[hidden]");
  const texts = {
    ja:["アプリを終了しますか？", "ゲームを終了して選曲に戻りますか？"],
    en:["Exit the app?", "Leave the game and return to the library?"],
    zh:["退出应用？", "结束游戏并返回选曲？"],
    ko:["앱을 종료할까요?", "게임을 끝내고 곡 선택으로 돌아갈까요?"]
  };
  const prompt = index => (texts[core.settings.language] || texts.en)[index];
  function back() {
    if (document.fullscreenElement && document.exitFullscreen) { void document.exitFullscreen(); return; }
    if (window.TrkVideoMax && window.TrkVideoMax.isOpen()) { window.TrkVideoMax.close(); return; }
    // An explicit cancel/backdrop is important: never accept a destructive dialog.
    const ask = [...document.querySelectorAll('[data-trk-ask]')].filter(visible).pop();
    if (ask) { ask.click(); return; }
    const playlist = [...document.querySelectorAll('.plOverlay')].filter(visible).pop();
    if (playlist) { playlist.click(); return; }
    const welcome = document.getElementById("welcomeBox");
    if (visible(welcome)) { document.getElementById("welcomeCloseBtn").click(); return; }
    const synth = document.getElementById("synthMode");
    if (visible(synth) && typeof window._trkCloseSynth === "function") { window._trkCloseSynth(); return; }
    const study = window.TrkStudyRoom;
    if (study && study.isOpen()) {
      for (const [dialog, button] of [["studySettings", "studySettingsCloseBtn"], ["studyHelp", "studyHelpCloseBtn"]]) {
        if (visible(document.getElementById(dialog))) { document.getElementById(button).click(); return; }
      }
      study.close(); return;
    }
    // An unfamiliar modal must consume Back rather than exit or affect the game.
    const unknown = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter(node => visible(node) && !node.classList.contains("mediaDialog") && !node.classList.contains("mediaWall"));
    if (unknown.length) return;
    if (core.phase === "title" && core.screen === "settings") { core.closeSettings(); return; }
    const wall = document.querySelector("#mediaPlayerMode .mediaWall");
    if (visible(wall)) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", code:"Escape", cancelable:true })); return;
    }
    const media = window.TrkMediaPlayer;
    if (media && media.isOpen()) {
      if (document.body.classList.contains("apk-media-effects") && window.TrkApkReturnToPlayer) window.TrkApkReturnToPlayer();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", code:"Escape", cancelable:true }));
      return;
    }
    if (core.phase === "title" && document.body.dataset.apkView === "effects") {
      const library = document.querySelector('.apk-nav [data-destination="library"]');
      if (library) library.click();
      return;
    }
    if (core.phase === "playing") { window.Trk.play.pauseGame(); return; }
    if (core.phase === "paused" || core.phase === "ended") {
      if (window.confirm(prompt(1))) window.Trk.play.toTitle();
      return;
    }
    if (window.confirm(prompt(0))) void app.exitApp();
  }
  Promise.resolve(app.addListener("backButton", back)).catch(error => console.error("Unable to register Android back handler", error));
})();
