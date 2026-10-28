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
