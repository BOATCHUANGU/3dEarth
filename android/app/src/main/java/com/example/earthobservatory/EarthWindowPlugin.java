package com.example.earthobservatory;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Launch handoff only; Capacitor SystemBars remains the sole owner of window insets. */
@CapacitorPlugin(name = "EarthWindow")
public class EarthWindowPlugin extends Plugin {
    @PluginMethod public void preferences(PluginCall call) {
        JSObject result = new JSObject();
        result.put("reducedMotion", ((MainActivity) getActivity()).reducedMotion());
        call.resolve(result);
    }

    @PluginMethod public void shellReady(PluginCall call) {
        getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).shellReady(() -> call.resolve()));
    }
}
