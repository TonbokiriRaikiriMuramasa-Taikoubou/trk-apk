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
import android.util.Rational;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean pipEligible = false;
    private Rational pipAspectRatio = new Rational(16, 9);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TrkDevicePlugin.class);
        super.onCreate(savedInstanceState);
        // Hardware volume keys target the media stream while the activity is visible.
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
    }

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
