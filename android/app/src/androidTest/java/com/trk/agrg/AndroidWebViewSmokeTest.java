// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.os.SystemClock;
import android.util.Rational;
import android.view.KeyEvent;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.SdkSuppress;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Emulator smoke only: neither physical touch nor audio/Bluetooth is covered. */
@RunWith(AndroidJUnit4.class)
public class AndroidWebViewSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String javascript) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(activity -> {
            assertNotNull("Capacitor bridge", activity.getBridge());
            activity.getBridge().getWebView().evaluateJavascript(javascript, result -> {
                value.set(result);
                done.countDown();
            });
        });
        assertTrue("WebView JS callback timed out", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    private void eventually(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        long end = SystemClock.elapsedRealtime() + 30000;
        String result = "";
        do {
            result = evaluate(scenario, "Boolean(" + expression + ")");
            if ("true".equals(result)) return;
            SystemClock.sleep(250);
        } while (SystemClock.elapsedRealtime() < end);
        assertEquals("WebView condition: " + expression, "true", result);
    }

    @Test
    public void pictureInPictureRatioUsesVideoAndAndroidLimits() {
        assertEquals(new Rational(9, 16), MainActivity.pipRatio(1080, 1920));
        assertEquals(new Rational(16, 9), MainActivity.pipRatio(1920, 1080));
        assertEquals(new Rational(100, 239), MainActivity.pipRatio(1, Integer.MAX_VALUE));
        assertEquals(new Rational(239, 100), MainActivity.pipRatio(Integer.MAX_VALUE, 1));
        assertEquals(new Rational(100, 239), MainActivity.pipRatio(100, 239));
        assertEquals(new Rational(239, 100), MainActivity.pipRatio(239, 100));
        assertEquals(new Rational(16, 9), MainActivity.pipRatio(0, 0));
        assertEquals(new Rational(16, 9), MainActivity.pipRatio(-1, 200));
    }

    @Test
    @SdkSuppress(minSdkVersion = 26)
    public void nativePictureInPictureEntryNotifiesWebView() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            eventually(scenario, "document.readyState === 'complete' && !!window.TrkApkPip");
            AtomicReference<Boolean> supported = new AtomicReference<>(false);
            scenario.onActivity(activity -> supported.set(activity.canUsePip()));
            assumeTrue("PiP is unavailable or disabled on this test device", supported.get());
            AtomicReference<Boolean> entered = new AtomicReference<>(false);
            scenario.onActivity(activity -> entered.set(activity.enterPictureInPictureMode(
                new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build())));
            assertTrue("Android rejected PiP entry", entered.get());
            eventually(scenario, "document.body.classList.contains('apk-in-pip')");
            scenario.onActivity(activity -> assertTrue("Activity must actually be in PiP", activity.isInPictureInPictureMode()));
        }
    }

    @Test
    @SdkSuppress(minSdkVersion = 26)
    public void rendererCrashShowsRecoveryAndRetryStartsGuarded() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            eventually(scenario, "document.readyState === 'complete' && !!window.Trk.core.audioSafety");
            evaluate(scenario, "localStorage.setItem('trk_renderer_smoke', 'retained')");
            for (int attempt = 0; attempt < 2; attempt++) {
                // Only on this disposable emulator: genuinely kill the WebView renderer.
                scenario.onActivity(activity -> activity.getBridge().getWebView().loadUrl("chrome://crash"));
                long end = SystemClock.elapsedRealtime() + 30000;
                AtomicReference<Boolean> visible = new AtomicReference<>(false);
                do {
                    scenario.onActivity(activity -> visible.set(activity.isRendererRecoveryVisible()));
                    if (visible.get()) break;
                    SystemClock.sleep(100);
                } while (SystemClock.elapsedRealtime() < end);
                assertTrue("Native recovery screen did not appear", visible.get());
                if (attempt == 0) {
                    // Background and foreground must not dispatch into the dead Bridge.
                    scenario.moveToState(Lifecycle.State.CREATED);
                    scenario.moveToState(Lifecycle.State.RESUMED);
                }
                scenario.onActivity(activity -> {
                    assertEquals("Destroyed Bridge must no longer be used", null, activity.getBridge());
                    assertTrue("Recovery guard must persist", activity.recoveryGuardEnabled());
                    activity.retryRendererRecovery();
                });
                AtomicReference<Boolean> restarted = new AtomicReference<>(false);
                end = SystemClock.elapsedRealtime() + 30000;
                do {
                    scenario.onActivity(activity -> restarted.set(activity.getBridge() != null && !activity.isRendererRecoveryVisible()));
                    if (restarted.get()) break;
                    SystemClock.sleep(100);
                } while (SystemClock.elapsedRealtime() < end);
                assertTrue("Activity did not restart", restarted.get());
                eventually(scenario, "document.readyState === 'complete' && !!window.Trk && !!Trk.core.audioSafety && Trk.core.audioSafety.blocked()");
                eventually(scenario, "localStorage.getItem('trk_renderer_smoke') === 'retained'");
                evaluate(scenario, "window._recoveryPlay='pending'; Trk.core.video.play().then(() => window._recoveryPlay='played', e => window._recoveryPlay=e.name)");
                eventually(scenario, "window._recoveryPlay === 'AbortError'");
                if (attempt == 0) {
                    // A later Activity recreation must retain the native guard.
                    scenario.recreate();
                    eventually(scenario, "document.readyState === 'complete' && !!window.Trk && !!Trk.core.audioSafety && Trk.core.audioSafety.blocked()");
                    eventually(scenario, "localStorage.getItem('trk_renderer_smoke') === 'retained'");
                }
            }
            // Simulate the explicit play acknowledgement, then clear only our fixture.
            evaluate(scenario, "Trk.core.audioSafety.resume(); localStorage.removeItem('trk_renderer_smoke')");
            long end = SystemClock.elapsedRealtime() + 10000;
            AtomicReference<Boolean> guard = new AtomicReference<>(true);
            do {
                scenario.onActivity(activity -> guard.set(activity.recoveryGuardEnabled()));
                if (!guard.get()) break;
                SystemClock.sleep(100);
            } while (SystemClock.elapsedRealtime() < end);
            assertTrue("Explicit acknowledgement did not clear native guard", !guard.get());
        }
    }

    @Test
    public void simulatedNoisyCallbackReachesWebViewAndBlocksRestart() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            eventually(scenario, "document.readyState === 'complete' && !!window.Trk.core.audioSafety");
            // Exercise the plugin-to-JS bridge only; no real system broadcast or
            // physical audio route change is simulated by this test.
            scenario.onActivity(activity -> {
                TrkDevicePlugin device = (TrkDevicePlugin) activity.getBridge().getPlugin("TrkDevice").getInstance();
                assertNotNull(device);
                device.audioOutputBecameNoisy();
            });
            eventually(scenario, "window.Trk.core.audioSafety.blocked()");
            evaluate(scenario, "window._blockedPlay='pending'; Trk.core.video.play().then(() => window._blockedPlay='played', e => window._blockedPlay=e.name)");
            eventually(scenario, "window._blockedPlay === 'AbortError'");
        }
    }

    @Test
    public void fxRestorationFailureShowsNoticeAndKeepsPlaybackBlocked() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            eventually(scenario, "document.readyState === 'complete' && !!window.TrkFX && !!Trk.core.audioSafety");
            // Real WebView/AudioContext, but an injected exception and a simulated
            // plugin callback. This is not a physical disconnect or audio test.
            assertEquals("true", evaluate(scenario,
                "Boolean(TrkFX.select('piano') && Trk.media.audioCtx && document.getElementById('apkFxRecoveryNotice').hidden)"));
            evaluate(scenario, "window._fxBefore=JSON.stringify(TrkFX.current()); window._fxGain=Trk.media.audioCtx.createGain.bind(Trk.media.audioCtx)");
            scenario.onActivity(activity -> {
                TrkDevicePlugin device = (TrkDevicePlugin) activity.getBridge().getPlugin("TrkDevice").getInstance();
                assertNotNull(device); device.audioOutputBecameNoisy();
            });
            eventually(scenario, "Trk.core.audioSafety.blocked()");
            evaluate(scenario, "Trk.media.audioCtx.createGain=()=>{throw new Error('instrumented failure')}; window._fxResume=Trk.core.audioSafety.resume()");
            eventually(scenario, "window._fxResume === false && Trk.core.audioSafety.blocked() && !document.getElementById('apkFxRecoveryNotice').hidden");
            assertEquals("true", evaluate(scenario,
                "Boolean(document.getElementById('apkFxRecoveryNotice').getBoundingClientRect().height > 0 && Trk.core.video.paused)"));
            evaluate(scenario, "window._fxPlay='pending'; Trk.core.video.play().then(()=>window._fxPlay='played',e=>window._fxPlay=e.name)");
            eventually(scenario, "window._fxPlay === 'AbortError'");
            evaluate(scenario, "Trk.media.audioCtx.createGain=window._fxGain; window._fxRetry=Trk.core.audioSafety.resume()");
            eventually(scenario, "window._fxRetry === true && !Trk.core.audioSafety.blocked() && document.getElementById('apkFxRecoveryNotice').hidden");
            assertEquals("true", evaluate(scenario,
                "Boolean(Trk.core.video.paused && JSON.stringify(TrkFX.current()) === window._fxBefore)"));
        }
    }

    @Test
    public void freshStartupBackAndNativeOrientationBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            eventually(scenario, "document.readyState === 'complete' && window.Trk && window.Trk.core && document.querySelectorAll('.apk-nav button').length === 5 && document.getElementById('welcomeBox') && !document.getElementById('welcomeBox').hidden");
            eventually(scenario, "window.Capacitor && Capacitor.isNativePlatform() && document.getElementById('floatingSafeBtn').hidden");
            // An actual Android back-key event dismisses the fresh-install welcome.
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            eventually(scenario, "document.getElementById('welcomeBox').hidden && !document.getElementById('floatingSafeBtn').hidden");
            // Programmatic clicks exercise the JS -> Capacitor -> Activity bridge,
            // but are not a substitute for physical touch / ten-second holds.
            evaluate(scenario, "document.getElementById('floatingSafeBtn').click()");
            eventually(scenario, "document.getElementById('floatingSafeBtn').getAttribute('aria-pressed') === 'true'");
            scenario.onActivity(activity -> assertEquals(ActivityInfo.SCREEN_ORIENTATION_LOCKED, activity.getRequestedOrientation()));
            evaluate(scenario, "document.getElementById('floatingSafeBtn').click()");
            eventually(scenario, "document.getElementById('floatingSafeBtn').getAttribute('aria-pressed') === 'false'");
            scenario.onActivity(activity -> assertEquals(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED, activity.getRequestedOrientation()));
            // Exercise dimensions through the real Capacitor plugin. No PiP transition
            // or physical video rendering is claimed by this assertion.
            evaluate(scenario, "window._testPip = 'pending'; Capacitor.Plugins.TrkDevice.setPipEligible({enabled:false, videoWidth:1080, videoHeight:1920}).then(() => window._testPip = 'done').catch(() => window._testPip = 'error')");
            eventually(scenario, "window._testPip === 'done'");
            scenario.onActivity(activity -> assertEquals(new Rational(9, 16), activity.getPipAspectRatio()));
        }
    }
}
