package com.streamkaro.app.update;

import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.streamkaro.app.ServerOrigin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * In-app updater for the sideloaded APKs (idea from SmartTube's AppUpdatePresenter, MIT).
 * The web app asks /api/app/version, then calls `downloadAndInstall` with the APK URL.
 * Before handing the file to the system installer we check it is the same package, a
 * higher versionCode and (API 28+) signed with the same certificate.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    @PluginMethod
    public void getInfo(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = installedPackage();
            JSObject ret = new JSObject();
            ret.put("versionName", pi.versionName);
            ret.put("versionCode", PackageInfoCompat.getLongVersionCode(pi));
            ret.put("packageName", ctx.getPackageName());
            ret.put("flavor", ctx.getPackageName().endsWith(".tv") ? "tv" : "mobile");
            ret.put("isTv", isTv(ctx));
            ret.put("sdkInt", Build.VERSION.SDK_INT);
            ret.put("canInstall", canInstall());
            call.resolve(ret);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("Package info unavailable", e);
        }
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            // Some TV builds hide this screen; the installer will ask on its own instead.
            call.reject("Install settings are not available on this device", "SETTINGS_UNAVAILABLE");
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !ServerOrigin.isTrusted(getBridge(), url)) {
            call.reject("Update URL must be on the app's own server", "UNTRUSTED_URL");
            return;
        }
        if (!canInstall()) {
            call.reject("Allow this app to install updates first", "INSTALL_PERMISSION_REQUIRED");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("An update is already downloading", "BUSY");
            return;
        }
        executor.execute(() -> {
            try {
                File apk = download(url);
                verify(apk);
                getActivity().runOnUiThread(() -> {
                    try {
                        launchInstaller(apk);
                        JSObject ret = new JSObject();
                        ret.put("started", true);
                        call.resolve(ret);
                    } catch (RuntimeException e) {
                        call.reject("Could not open the installer", "INSTALLER_FAILED", e);
                    }
                });
            } catch (UpdateException e) {
                call.reject(e.getMessage(), e.code);
            } catch (IOException e) {
                call.reject("Download failed: " + e.getMessage(), "DOWNLOAD_FAILED", e);
            } finally {
                busy.set(false);
            }
        });
    }

    /* ------------------------------ internals ------------------------------ */

    private File download(String url) throws IOException {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create cache dir");
        File out = new File(dir, "StreamKaro-update.apk");

        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setInstanceFollowRedirects(true);
        try {
            int status = conn.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + status);
            long total = conn.getContentLengthLong();
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                long done = 0;
                long lastEmit = 0;
                int n;
                while ((n = in.read(buf)) != -1) {
                    os.write(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 250) {
                        lastEmit = now;
                        emitProgress(done, total);
                    }
                }
                emitProgress(done, total);
            }
        } finally {
            conn.disconnect();
        }
        return out;
    }

    private void emitProgress(long done, long total) {
        JSObject p = new JSObject();
        p.put("downloaded", done);
        p.put("total", total);
        p.put("percent", total > 0 ? (int) (done * 100 / total) : -1);
        notifyListeners("downloadProgress", p);
    }

    private void verify(File apk) throws UpdateException {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : 0;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new UpdateException("Downloaded file is not a valid APK", "INVALID_APK");
        if (!getContext().getPackageName().equals(archive.packageName)) {
            throw new UpdateException("Update is for a different app (" + archive.packageName + ")", "PACKAGE_MISMATCH");
        }
        PackageInfo installed;
        try {
            installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        } catch (PackageManager.NameNotFoundException e) {
            throw new UpdateException("Package info unavailable", "PACKAGE_MISMATCH");
        }
        if (PackageInfoCompat.getLongVersionCode(archive) <= PackageInfoCompat.getLongVersionCode(installed)) {
            throw new UpdateException("The downloaded version is not newer than the installed one", "NOT_NEWER");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            && archive.signingInfo != null && installed.signingInfo != null
            && !sameSigners(archive.signingInfo.getApkContentsSigners(), installed.signingInfo.getApkContentsSigners())) {
            throw new UpdateException(
                "Update is signed with a different key — uninstall and reinstall from the website",
                "SIGNATURE_MISMATCH"
            );
        }
    }

    private static boolean sameSigners(Signature[] a, Signature[] b) {
        if (a == null || b == null) return true; // can't tell — let the system installer decide
        Set<Signature> left = new HashSet<>(Arrays.asList(a));
        Set<Signature> right = new HashSet<>(Arrays.asList(b));
        return left.equals(right);
    }

    private void launchInstaller(File apk) {
        Context ctx = getContext();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private PackageInfo installedPackage() throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
    }

    private static boolean isTv(Context ctx) {
        UiModeManager ui = (UiModeManager) ctx.getSystemService(Context.UI_MODE_SERVICE);
        if (ui != null && ui.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
        return ctx.getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }

    private static final class UpdateException extends Exception {
        final String code;

        UpdateException(String message, String code) {
            super(message);
            this.code = code;
        }
    }
}
