package com.streamkaro.app.player;

import android.app.Activity;
import android.os.Build;
import android.view.Display;
import android.view.WindowManager;

import androidx.annotation.Nullable;
import androidx.media3.common.Format;

/**
 * Switches the TV's refresh rate to match the stream (25 fps → 50 Hz, 23.976 → 23.976/24 Hz)
 * so live TV doesn't judder on 60 Hz panels. Adapted from SmartTube's AutoFrameRateHelper
 * (MIT). Resolution is never changed — only the refresh rate at the current resolution.
 * Off by default: the mode switch blanks some TVs for a second or two.
 */
final class AutoFrameRate {

    /** Max distance from a whole multiple (24 Hz for 23.976 fps is ~0.001 away). */
    private static final double TOLERANCE = 0.01;

    private final Activity activity;

    AutoFrameRate(Activity activity) {
        this.activity = activity;
    }

    static boolean isSupported(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
        Display display = activity.getWindowManager().getDefaultDisplay();
        return display != null && display.getSupportedModes().length > 1;
    }

    void apply(@Nullable Format format) {
        if (format == null || format.frameRate <= 0 || !isSupported(activity)) return;
        Display display = activity.getWindowManager().getDefaultDisplay();
        Display.Mode current = display.getMode();

        Display.Mode best = null;
        double bestScore = Double.MAX_VALUE;
        for (Display.Mode mode : display.getSupportedModes()) {
            if (mode.getPhysicalWidth() != current.getPhysicalWidth()
                || mode.getPhysicalHeight() != current.getPhysicalHeight()) {
                continue;
            }
            double ratio = mode.getRefreshRate() / format.frameRate;
            long multiple = Math.round(ratio);
            if (multiple < 1) continue;
            double error = Math.abs(ratio - multiple);
            if (error > TOLERANCE) continue;
            // Prefer the exact match, then the lowest multiple.
            double score = error * 1000 + multiple;
            if (score < bestScore) {
                bestScore = score;
                best = mode;
            }
        }
        if (best != null && best.getModeId() != current.getModeId()) {
            setPreferredMode(best.getModeId());
        }
    }

    /** 0 = no preference, the system goes back to its default mode. */
    void reset() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) setPreferredMode(0);
    }

    private void setPreferredMode(int modeId) {
        WindowManager.LayoutParams params = activity.getWindow().getAttributes();
        if (params.preferredDisplayModeId == modeId) return;
        params.preferredDisplayModeId = modeId;
        activity.getWindow().setAttributes(params);
    }
}
