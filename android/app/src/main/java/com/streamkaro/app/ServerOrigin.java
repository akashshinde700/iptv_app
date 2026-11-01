package com.streamkaro.app;

import android.net.Uri;

import com.getcapacitor.Bridge;

/** Native plugins only act on URLs served by the StreamKaro site the shell was built for. */
public final class ServerOrigin {

    private ServerOrigin() {}

    public static boolean isTrusted(Bridge bridge, String url) {
        String base = bridge.getServerUrl();
        if (base == null) base = bridge.getAppUrl();
        if (base == null || url == null) return false;

        Uri server = Uri.parse(base);
        Uri target = Uri.parse(url);
        String scheme = target.getScheme();
        boolean httpScheme = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        return httpScheme
            && server.getHost() != null
            && server.getHost().equalsIgnoreCase(target.getHost());
    }
}
