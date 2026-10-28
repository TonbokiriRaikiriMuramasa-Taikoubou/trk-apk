package com.trk.agrg;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.media.AudioManager;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android-only device controls; orientation is intentionally not persisted. */
@CapacitorPlugin(name = "TrkDevice")
public class TrkDevicePlugin extends Plugin {
    private boolean noisyReceiverRegistered = false;
    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent != null && AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction())) {
                audioOutputBecameNoisy();
            }
        }
    };

    @Override
    public void load() {
        // Dynamic receiver lives with the Bridge, including when Activity is in
        // the background. It does not claim protection after process death.
        ContextCompat.registerReceiver(getContext(), noisyReceiver,
            new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
        noisyReceiverRegistered = true;
    }

    void audioOutputBecameNoisy() {
        // Capacitor plugin listener registration runs on its plugin thread.
        getBridge().execute(() -> notifyListeners("audioBecomingNoisy", new JSObject(), true));
    }

    @Override
    protected void handleOnDestroy() {
        if (noisyReceiverRegistered) {
            getContext().unregisterReceiver(noisyReceiver);
            noisyReceiverRegistered = false;
        }
    }

    @PluginMethod
    public void setOrientationLock(PluginCall call) {
        final boolean locked = call.getBoolean("locked", false);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().setRequestedOrientation(locked
                    ? ActivityInfo.SCREEN_ORIENTATION_LOCKED
                    : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                JSObject result = new JSObject();
                result.put("locked", locked);
                call.resolve(result);
            } catch (RuntimeException error) {
                call.reject("Unable to change orientation", error);
            }
        });
    }
    @PluginMethod
    public void setPipEligible(PluginCall call) {
        final boolean enabled = call.getBoolean("enabled", false);
        final int videoWidth = call.getInt("videoWidth", 0);
        final int videoHeight = call.getInt("videoHeight", 0);
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            try {
                activity.configurePip(enabled, videoWidth, videoHeight);
                JSObject result = new JSObject();
                result.put("available", activity.canUsePip());
                result.put("eligible", activity.isPipEligible());
                call.resolve(result);
            } catch (RuntimeException error) {
                call.reject("Unable to configure picture-in-picture", error);
            }
        });
    }
}
