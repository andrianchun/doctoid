package com.andrianchun.doctoid;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static ShareReceiverPlugin instance = null;
    private static JSObject pendingShare = null;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        instance = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject ret = new JSObject();
        if (pendingShare != null) {
            ret.put("hasShare", true);
            ret.put("data", pendingShare);
            pendingShare = null; // consume once
        } else {
            ret.put("hasShare", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void clearPendingShare(PluginCall call) {
        pendingShare = null;
        call.resolve();
    }

    public static void handleShareIntent(Context ctx, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return;
        }

        JSObject shareData = new JSObject();
        JSArray imagesArray = new JSArray();
        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (sharedText != null) {
            shareData.put("text", sharedText);
        } else {
            shareData.put("text", "");
        }

        try {
            if (Intent.ACTION_SEND.equals(action)) {
                Uri streamUri = null;
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
                } else {
                    streamUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                }

                if (streamUri != null) {
                    JSObject img = readUriAsBase64(ctx, streamUri, type);
                    if (img != null) {
                        imagesArray.put(img);
                    }
                }
            } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> streamUris = null;
                if (android.os.Build.VERSION.SDK_INT >= 33) {
                    streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class);
                } else {
                    streamUris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                }

                if (streamUris != null) {
                    for (Uri u : streamUris) {
                        JSObject img = readUriAsBase64(ctx, u, type);
                        if (img != null) {
                            imagesArray.put(img);
                        }
                    }
                }
            }
        } catch (Exception ignored) {}

        shareData.put("images", imagesArray);
        pendingShare = shareData;

        if (instance != null) {
            instance.notifyListeners("shareReceived", shareData);
        }

        // Bersihkan intent agar tidak re-trigger saat Activity di-recreate
        intent.setAction(null);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_STREAM);
    }

    private static JSObject readUriAsBase64(Context ctx, Uri uri, String mimeFallback) {
        try {
            String mime = ctx.getContentResolver().getType(uri);
            if (mime == null || mime.isEmpty()) {
                if (mimeFallback != null && !mimeFallback.isEmpty() && !mimeFallback.equals("*/*")) {
                    mime = mimeFallback;
                } else {
                    mime = "application/octet-stream";
                }
            }

            String name = "shared_file";
            Cursor cursor = ctx.getContentResolver().query(uri, null, null, null, null);
            if (cursor != null) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    name = cursor.getString(nameIndex);
                }
                cursor.close();
            }

            // Fallback ekstensi berkas jika mime masih generik
            if ("application/octet-stream".equals(mime)) {
                String lowerName = name.toLowerCase();
                if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mime = "image/jpeg";
                else if (lowerName.endsWith(".png")) mime = "image/png";
                else if (lowerName.endsWith(".webp")) mime = "image/webp";
                else if (lowerName.endsWith(".pdf")) mime = "application/pdf";
                else if (lowerName.endsWith(".opus") || lowerName.endsWith(".ogg")) mime = "audio/ogg";
                else if (lowerName.endsWith(".m4a") || lowerName.endsWith(".mp3") || lowerName.endsWith(".aac")) mime = "audio/mp4";
                else if (lowerName.endsWith(".mp4") || lowerName.endsWith(".3gp") || lowerName.endsWith(".mkv")) mime = "video/mp4";
            }

            InputStream is = ctx.getContentResolver().openInputStream(uri);
            if (is == null) return null;

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int len;
            while ((len = is.read(buf)) != -1) {
                baos.write(buf, 0, len);
            }
            is.close();

            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            String dataUrl = "data:" + mime + ";base64," + b64;

            JSObject obj = new JSObject();
            obj.put("name", name);
            obj.put("type", mime);
            obj.put("dataUrl", dataUrl);
            return obj;
        } catch (Exception e) {
            return null;
        }
    }
}
