package com.trk.agrg;

import android.app.AppOpsManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.media.AudioManager;
import android.util.Log;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.WebViewListener;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private boolean pipEligible = false;
    private Rational pipAspectRatio = new Rational(16, 9);
    private static final String RECOVERY_PREFS = "trk_renderer_recovery";
    private static final String RECOVERY_GUARD = "guard_playback";
    private boolean rendererFailed = false;
    private Button recoveryRetry;

    boolean recoveryGuardEnabled() {
        return getSharedPreferences(RECOVERY_PREFS, MODE_PRIVATE).getBoolean(RECOVERY_GUARD, false);
    }

    synchronized boolean acknowledgeRecovery() {
        if (rendererFailed) return false;
        boolean saved = getSharedPreferences(RECOVERY_PREFS, MODE_PRIVATE).edit().remove(RECOVERY_GUARD).commit();
        if (saved) runOnUiThread(() -> {
            if (!rendererFailed && bridge != null && bridge.getWebView() != null)
                bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        });
        return saved;
    }

    // Preserve the packaged Capacitor config; add a non-persistent URL marker
    // only when restarting after a renderer failure. The WebView sees it before
    // any app script and can block autoplay without an asynchronous bridge race.
    @SuppressWarnings("deprecation")
    private CapConfig guardedConfig() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream stream = getAssets().open("capacitor.config.json")) {
            byte[] buffer = new byte[4096]; int n;
            while ((n = stream.read(buffer)) != -1) bytes.write(buffer, 0, n);
        }
        JSONObject configJson = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
        JSONObject server = configJson.optJSONObject("server");
        if (server == null) { server = new JSONObject(); configJson.put("server", server); }
        String path = server.optString("appStartPath", "");
        int fragment = path.indexOf('#');
        String suffix = fragment < 0 ? "" : path.substring(fragment);
        if (fragment >= 0) path = path.substring(0, fragment);
        path += path.contains("?") ? "&trkRendererRecovery=1" : "?trkRendererRecovery=1";
        server.put("appStartPath", path + suffix);
        return new CapConfig(getAssets(), configJson);
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (recoveryGuardEnabled()) {
            try { config = guardedConfig(); }
            catch (Exception error) {
                // Fallback is intentionally local and fail-closed for this app's
                // current scheme. Never silently start an unguarded WebView.
                Log.e("TrkRecovery", "Unable to load recovery config", error);
                config = new CapConfig.Builder(this).setAndroidScheme("https").setStartPath("?trkRendererRecovery=1").create();
            }
        }
        registerPlugin(TrkDevicePlugin.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                return handleRendererGone(view);
            }
        });
        super.onCreate(savedInstanceState);
        if (recoveryGuardEnabled() && bridge != null && bridge.getWebView() != null) {
            // Extra WebView-level protection if the JS bridge is unavailable.
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(true);
        }
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }

    private synchronized boolean handleRendererGone(WebView view) {
        if (rendererFailed || bridge == null || view != bridge.getWebView()) return false;
        // A durable guard survives process death and requires an explicit play
        // request after restart. No song or other user data is touched.
        if (!getSharedPreferences(RECOVERY_PREFS, MODE_PRIVATE).edit().putBoolean(RECOVERY_GUARD, true).commit()) return false;
        rendererFailed = true; pipEligible = false;
        Bridge deadBridge = bridge;
        bridge = null; // BridgeActivity must never destroy/use the dead WebView again.
        try {
            deadBridge.onDestroy(); // unregister plugins, including the noisy receiver
            if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
            view.destroy();
            showRendererRecovery();
            return true;
        } catch (RuntimeException error) {
            // Returning false lets Android handle an unrecoverable failure.
            Log.e("TrkRecovery", "Unable to dispose renderer safely", error);
            return false;
        }
    }

    private void showRendererRecovery() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { finish(); }
        });
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER);
        panel.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(this); title.setText(R.string.renderer_recovery_title); title.setTextSize(22);
        TextView message = new TextView(this); message.setText(R.string.renderer_recovery_message); message.setPadding(0, pad, 0, pad);
        recoveryRetry = new Button(this); recoveryRetry.setText(R.string.renderer_recovery_retry);
        recoveryRetry.setOnClickListener(v -> { recoveryRetry.setEnabled(false); recreate(); });
        Button close = new Button(this); close.setText(R.string.renderer_recovery_close); close.setOnClickListener(v -> finish());
        panel.addView(title); panel.addView(message); panel.addView(recoveryRetry); panel.addView(close);
        setContentView(panel);
    }

    boolean isRendererRecoveryVisible() { return rendererFailed && recoveryRetry != null; }
    void retryRendererRecovery() { if (recoveryRetry != null) recoveryRetry.performClick(); }

    boolean canUsePip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            !getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) return false;
        AppOpsManager ops = (AppOpsManager) getSystemService(Context.APP_OPS_SERVICE);
        return ops != null && ops.checkOpNoThrow(AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
            Process.myUid(), getPackageName()) == AppOpsManager.MODE_ALLOWED;
    }

    // Android PiP permits ratios from 1:2.39 to 2.39:1, inclusive.
    static Rational pipRatio(int width, int height) {
        if (width <= 0 || height <= 0) return new Rational(16, 9);
        if ((long) width * 239 < (long) height * 100) return new Rational(100, 239);
        if ((long) width * 100 > (long) height * 239) return new Rational(239, 100);
        return new Rational(width, height);
    }

    void configurePip(boolean eligible, int videoWidth, int videoHeight) {
        pipAspectRatio = pipRatio(videoWidth, videoHeight);
        pipEligible = eligible && canUsePip();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(pipAspectRatio).setAutoEnterEnabled(pipEligible).build();
                setPictureInPictureParams(params);
            } catch (IllegalStateException | IllegalArgumentException | SecurityException ignored) {
                pipEligible = false;
            }
        }
    }

    boolean isPipEligible() { return pipEligible; }

    Rational getPipAspectRatio() { return pipAspectRatio; }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S && pipEligible && canUsePip()) {
            try {
                enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(pipAspectRatio).build());
            } catch (IllegalStateException | IllegalArgumentException | SecurityException ignored) { }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration newConfig) {
        super.onPictureInPictureModeChanged(inPip, newConfig);
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('trkApkPipChanged',{detail:" + inPip + "}))", null);
        }
    }
}
