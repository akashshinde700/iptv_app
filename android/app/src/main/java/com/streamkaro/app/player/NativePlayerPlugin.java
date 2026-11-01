package com.streamkaro.app.player;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.streamkaro.app.ServerOrigin;

/**
 * JS: `NativePlayer.play({ url, title, mimeType })` → opens {@link PlayerActivity} and
 * resolves with `{ reason: "closed" | "ended" | "error", message?, errorKind? }` once the
 * user leaves the player.
 */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !ServerOrigin.isTrusted(getBridge(), url)) {
            call.reject("url must be an absolute http(s) URL on the app's own server", "UNTRUSTED_URL");
            return;
        }
        Intent intent = new Intent(getContext(), PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_URL, url);
        intent.putExtra(PlayerActivity.EXTRA_TITLE, call.getString("title"));
        intent.putExtra(PlayerActivity.EXTRA_MIME_TYPE, call.getString("mimeType"));
        intent.putExtra(PlayerActivity.EXTRA_HAS_PREVIOUS, Boolean.TRUE.equals(call.getBoolean("hasPrevious", false)));
        intent.putExtra(PlayerActivity.EXTRA_HAS_NEXT, Boolean.TRUE.equals(call.getBoolean("hasNext", false)));
        startActivityForResult(call, intent, "onPlayerResult");
    }

    @ActivityCallback
    private void onPlayerResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        JSObject ret = new JSObject();
        String reason = data != null ? data.getStringExtra(PlayerActivity.RESULT_REASON) : null;
        ret.put("reason", reason != null ? reason : "closed");
        if (data != null) {
            String message = data.getStringExtra(PlayerActivity.RESULT_MESSAGE);
            String errorKind = data.getStringExtra(PlayerActivity.RESULT_ERROR_KIND);
            if (message != null) ret.put("message", message);
            if (errorKind != null) ret.put("errorKind", errorKind);
        }
        call.resolve(ret);
    }
}
