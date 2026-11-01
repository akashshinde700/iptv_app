package com.streamkaro.app.player;

import android.app.ActivityManager;
import android.content.Context;

import androidx.annotation.OptIn;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultLoadControl;

/**
 * Buffer sizing adapted from SmartTube's ExoPlayerInitializer (MIT): cap the byte budget
 * at ~1/18 of device RAM so 1 GB TV boxes don't get OOM-killed, and keep a 20–30 s
 * time buffer, which is plenty for live TV without adding much latency.
 */
@OptIn(markerClass = UnstableApi.class)
final class PlayerTuning {

    private static final int FALLBACK_BUFFER_BYTES = 196_000_000;

    private PlayerTuning() {}

    static DefaultLoadControl buildLoadControl(Context context) {
        return new DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 30_000, 2_500, 5_000)
            .setTargetBufferBytes(targetBufferBytes(context))
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();
    }

    private static int targetBufferBytes(Context context) {
        ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (am == null) return FALLBACK_BUFFER_BYTES;
        ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
        am.getMemoryInfo(info);
        if (info.totalMem <= 0) return FALLBACK_BUFFER_BYTES;
        return (int) Math.min(FALLBACK_BUFFER_BYTES, info.totalMem / 18);
    }
}
