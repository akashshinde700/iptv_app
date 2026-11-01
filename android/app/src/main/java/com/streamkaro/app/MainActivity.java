package com.streamkaro.app;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.streamkaro.app.player.NativePlayerPlugin;
import com.streamkaro.app.update.AppUpdaterPlugin;

public class MainActivity extends BridgeActivity {

    /**
    * Back is decided by the web app (src/lib/back.ts): close overlay → previous screen →
    * "Exit?" prompt at Home. The activity is finished only by the confirmed Shell.exitApp()
    * action; a temporarily unavailable WebView or bridge must not silently close the app.
     */
    private static final String BACK_JS =
        "(function(){try{return window.__skBack?window.__skBack():'unhandled'}catch(e){return 'unhandled'}})()";

    private final OnBackPressedCallback backCallback = new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
            Bridge bridge = getBridge();
            WebView webView = bridge != null ? bridge.getWebView() : null;
            if (webView != null) webView.evaluateJavascript(BACK_JS, null);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge boots.
        registerPlugin(NativePlayerPlugin.class);
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }
}
