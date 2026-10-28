// SPDX-License-Identifier: GPL-3.0-or-later
package com.trk.agrg;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.pm.ActivityInfo;
import android.os.SystemClock;
import android.view.KeyEvent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
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
        }
    }
}
