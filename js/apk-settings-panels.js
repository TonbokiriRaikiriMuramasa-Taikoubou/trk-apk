// SPDX-License-Identifier: GPL-3.0-or-later
// Remember deliberate settings disclosure clicks without persisting search's
// temporary openings or the unrelated preset-category accordions.
(() => {
  "use strict";
  const storageKey = "trk_apk_settings_panels_v1";
  const settingsScreen = document.getElementById("settingsScreen");
  if (!settingsScreen) return;
  let saved = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
  } catch (_) { /* Storage may be unavailable; settings still work in this session. */ }

  const isSettingsPanel = panel => panel && panel.tagName === "DETAILS" && settingsScreen.contains(panel) && !panel.closest(".fxGrid");
  function keyOf(panel) {
    if (panel.id) return "id:" + panel.id;
    const summary = Array.from(panel.children).find(child => child.tagName === "SUMMARY");
    const key = summary && (summary.dataset.i18n || summary.querySelector("[data-i18n]")?.dataset.i18n);
    return key ? "label:" + key : "";
  }
  function initialize() {
    for (const panel of settingsScreen.querySelectorAll("details")) {
      if (!isSettingsPanel(panel)) continue;
      const key = keyOf(panel);
      panel.open = !!key && saved[key] === true;
    }
  }
  function searching() {
    const input = document.getElementById("settingsSearch");
    return !!(input && input.value.trim());
  }
  settingsScreen.addEventListener("click", event => {
    const summary = event.target.closest && event.target.closest("summary");
    const panel = summary && summary.parentElement;
    if (!isSettingsPanel(panel) || searching() || event.defaultPrevented) return;
    const key = keyOf(panel);
    if (!key) return;
    const wasOpen = panel.open;
    // The details default action runs after the click handler. Persist only if
    // that action actually changed state, never search's programmatic changes.
    setTimeout(() => {
      if (searching() || panel.open === wasOpen) return;
      saved[key] = panel.open;
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch (_) {}
    }, 0);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once:true });
  else initialize();
})();
