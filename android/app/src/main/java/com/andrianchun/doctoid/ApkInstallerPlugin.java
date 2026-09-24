package com.andrianchun.doctoid;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Memasang APK pembaruan TANPA melempar user ke browser / folder Downloads.
 * Bytenya dialirkan LANGSUNG dari hosting ke PackageInstaller.Session.
 * Tidak pernah menjadi file terpisah di disk, sehingga tidak meninggalkan sampah file di folder Downloads.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private String getStatusAction() {
        return getContext().getPackageName() + ".APK_INSTALL_STATUS";
    }

    private BroadcastReceiver receiver = null;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirmation;
                    if (Build.VERSION.SDK_INT >= 33) {
                        confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
                    } else {
                        confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    }
                    if (confirmation != null) {
                        confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(confirmation);
                    }
                    kirim("prompt", null);
                } else if (status == PackageInstaller.STATUS_SUCCESS) {
                    kirim("success", null);
                } else {
                    String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    kirim("failed", msg != null ? msg : "Pemasangan dibatalkan");
                }
            }
        };

        ContextCompat.registerReceiver(
            getContext(),
            receiver,
            new IntentFilter(getStatusAction()),
            ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {}
            receiver = null;
        }
    }

    private void kirim(String state, String message) {
        JSObject ret = new JSObject();
        ret.put("state", state);
        ret.put("message", message != null ? message : "");
        notifyListeners("apkInstall", ret);
    }

    private void kirimProgress(int percent) {
        JSObject ret = new JSObject();
        ret.put("state", "downloading");
        ret.put("percent", percent);
        notifyListeners("apkInstall", ret);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean granted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            granted = getContext().getPackageManager().canRequestPackageInstalls();
        } else {
            granted = true;
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL APK kosong");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                JSObject ret = new JSObject();
                ret.put("needsPermission", true);
                call.resolve(ret);
                return;
            }
        }

        JSObject ret = new JSObject();
        ret.put("needsPermission", false);
        call.resolve(ret);

        Thread downloadThread = new Thread(() -> {
            PackageInstaller.Session session = null;
            int sessionId = -1;
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode < 200 || responseCode >= 300) {
                    kirim("failed", "Server menjawab " + responseCode);
                    return;
                }

                long total = conn.getContentLengthLong();
                PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                    PackageInstaller.SessionParams.MODE_FULL_INSTALL
                );
                if (total > 0) {
                    params.setSize(total);
                }

                sessionId = installer.createSession(params);
                session = installer.openSession(sessionId);

                try (InputStream masuk = conn.getInputStream();
                     OutputStream keluar = session.openWrite("doctoid", 0, total)) {
                    byte[] buf = new byte[64 * 1024];
                    long terunduh = 0;
                    int terakhirLapor = -1;
                    int n;
                    while ((n = masuk.read(buf)) >= 0) {
                        keluar.write(buf, 0, n);
                        terunduh += n;
                        if (total > 0) {
                            int persen = (int) ((terunduh * 100) / total);
                            if (persen != terakhirLapor) {
                                terakhirLapor = persen;
                                kirimProgress(persen);
                            }
                        }
                    }
                    session.fsync(keluar);
                }

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    flags |= PendingIntent.FLAG_MUTABLE;
                }

                Intent intent = new Intent(getStatusAction()).setPackage(getContext().getPackageName());
                PendingIntent pending = PendingIntent.getBroadcast(
                    getContext(),
                    sessionId,
                    intent,
                    flags
                );

                kirim("installing", null);
                session.commit(pending.getIntentSender());
                session.close();
            } catch (Exception e) {
                if (session != null) {
                    try { session.abandon(); } catch (Exception ignored) {}
                }
                if (sessionId >= 0) {
                    try { getContext().getPackageManager().getPackageInstaller().abandonSession(sessionId); } catch (Exception ignored) {}
                }
                kirim("failed", e.getMessage() != null ? e.getMessage() : "Gagal mengunduh pembaruan");
            }
        });
        downloadThread.setDaemon(true);
        downloadThread.start();
    }
}
