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

    void configurePip(boolean eligible) {
        pipEligible = eligible && canUsePip();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9)).setAutoEnterEnabled(pipEligible).build();
                setPictureInPictureParams(params);
            } catch (IllegalStateException | IllegalArgumentException | SecurityException ignored) {
                pipEligible = false;
            }
        }
    }

    boolean isPipEligible() { return pipEligible; }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S && pipEligible && canUsePip()) {
            try {
                enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build());
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
