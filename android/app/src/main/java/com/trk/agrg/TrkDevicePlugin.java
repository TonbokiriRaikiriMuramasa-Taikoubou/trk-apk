package com.trk.agrg;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android-only device controls; orientation is intentionally not persisted. */
@CapacitorPlugin(name = "TrkDevice")
public class TrkDevicePlugin extends Plugin {
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
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            try {
                activity.configurePip(enabled);
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
