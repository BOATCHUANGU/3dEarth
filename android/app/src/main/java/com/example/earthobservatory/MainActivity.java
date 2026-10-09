package com.example.earthobservatory;

import android.animation.ValueAnimator;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Runnable> shellCallbacks = new ArrayList<>();
    private SplashScreenViewProvider splash;
    private boolean shellDrawn;
    private boolean splashRemoved;
    private boolean exiting;
    private final Runnable launchFallback = () -> {
        shellDrawn = true;
        exitSplash();
    };

    public boolean reducedMotion() {
        return Build.VERSION.SDK_INT >= 26 ? !ValueAnimator.areAnimatorsEnabled()
            : Settings.Global.getFloat(getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1) == 0;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (reducedMotion()) setTheme(R.style.AppTheme_NoActionBarLaunch_Reduced);
        SplashScreen screen = SplashScreen.installSplashScreen(this);
        registerPlugin(EarthWindowPlugin.class);
        super.onCreate(savedInstanceState);
        WindowCompat.enableEdgeToEdge(getWindow());
        getWindow().getDecorView().setBackgroundColor(Color.rgb(8, 13, 20));
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        if (bridge != null) bridge.getWebView().setBackgroundColor(Color.rgb(8, 13, 20));
        screen.setOnExitAnimationListener(provider -> {
            splash = provider;
            if (shellDrawn) exitSplash();
        });
        // Fail open if JavaScript or WebGL fails. Normal startup never waits for this deadline.
        handler.postDelayed(launchFallback, 4000);
    }

    public void shellReady(Runnable complete) {
        if (splashRemoved) { complete.run(); return; }
        shellCallbacks.add(complete);
        if (bridge == null) { launchFallback.run(); return; }
        bridge.getWebView().postVisualStateCallback(0, new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                if (isFinishing() || isDestroyed()) return;
                shellDrawn = true;
                exitSplash();
            }
        });
    }

    private void exitSplash() {
        if (splash == null || exiting || splashRemoved) return;
        exiting = true;
        splash.getView().animate().alpha(0).setDuration(reducedMotion() ? 0 : 180)
            .withEndAction(() -> {
                splash.remove();
                splash = null;
                splashRemoved = true;
                handler.removeCallbacks(launchFallback);
                for (Runnable callback : shellCallbacks) callback.run();
                shellCallbacks.clear();
            }).start();
    }

    @Override public void onResume() {
        super.onResume();
        if (bridge != null) bridge.getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('earth-native-motion',{detail:" + reducedMotion() + "}));", null);
    }

    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (splash != null) { splash.getView().animate().cancel(); splash.remove(); splash = null; }
        shellCallbacks.clear();
        super.onDestroy();
    }
}
