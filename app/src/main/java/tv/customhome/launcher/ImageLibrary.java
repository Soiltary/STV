package tv.customhome.launcher;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Log;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.Locale;

/**
 * The user's own wallpaper/screensaver images. An imported picture is copied (never moved or changed),
 * orientation-corrected, downscaled for a TV screen and stored in the app's private files/images folder,
 * so it survives reboots and app updates and needs no storage permission.
 */
final class ImageLibrary {
    static final String URL_BASE = "https://appassets.androidplatform.net/user-images/";
    private static final int MAX_IMAGES = 60;
    private static final long MAX_INPUT = 40L * 1024 * 1024;
    private static final long MIN_FREE = 30L * 1024 * 1024;
    private static final int MAX_DIM = 16000, TARGET_W = 1920, TARGET_H = 1080, CAP = 2400, THUMB_W = 384, THUMB_H = 216;

    private final Context context;
    private final File dir;

    ImageLibrary(Context context) {
        this.context = context.getApplicationContext();
        this.dir = new File(this.context.getFilesDir(), "images");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    private static boolean validId(String id) { return id != null && id.matches("u[0-9]{10,16}"); }
    private File full(String id) { return new File(dir, id + ".jpg"); }
    private File thumb(String id) { return new File(dir, id + "_t.jpg"); }

    /** Newest first: [{id, url, thumb, w, h, at}]. */
    String list() {
        JSONArray out = new JSONArray();
        File[] files = dir.listFiles((d, name) -> name.matches("u[0-9]{10,16}\\.jpg"));
        if (files == null) return out.toString();
        Arrays.sort(files, Collections.reverseOrder());
        for (File f : files) {
            String id = f.getName().substring(0, f.getName().length() - 4);
            try {
                BitmapFactory.Options o = new BitmapFactory.Options();
                o.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(f.getPath(), o);
                out.put(new JSONObject().put("id", id).put("url", URL_BASE + id + ".jpg")
                        .put("thumb", URL_BASE + id + (thumb(id).isFile() ? "_t.jpg" : ".jpg"))
                        .put("w", o.outWidth).put("h", o.outHeight).put("at", f.lastModified()));
            } catch (Exception ignored) { }
        }
        return out.toString();
    }

    int count() {
        String[] names = dir.list((d, name) -> name.matches("u[0-9]{10,16}\\.jpg"));
        return names == null ? 0 : names.length;
    }

    /** Removes the app's copy only; the user's original file is never touched. */
    boolean delete(String id) {
        if (!validId(id)) return false;
        boolean ok = full(id).delete();
        //noinspection ResultOfMethodCallIgnored
        thumb(id).delete();
        return ok;
    }

    WebResourceResponse serve(String path) {
        String name = path == null ? "" : path;
        if (!name.matches("u[0-9]{10,16}(_t)?\\.jpg")) return null;
        File f = new File(dir, name);
        if (!f.isFile()) return null;
        try { return new WebResourceResponse("image/jpeg", null, new FileInputStream(f)); }
        catch (IOException e) { return null; }
    }

    /** Runs on a worker thread. Returns {ok:true,id} or {ok:false,error:code}. Codes are translated by the page. */
    JSONObject importUri(Uri uri) {
        File tmp = new File(context.getCacheDir(), "import.tmp");
        try {
            if (count() >= MAX_IMAGES) return fail("full");
            if (dir.getUsableSpace() < MIN_FREE) return fail("space");
            ContentResolver cr = context.getContentResolver();
            long declared = size(cr, uri);
            if (declared > MAX_INPUT) return fail("large");
            // Copy once into the cache (bounded), so decoding and EXIF reading never depend on the provider.
            try (InputStream in = cr.openInputStream(uri); OutputStream out = new FileOutputStream(tmp)) {
                if (in == null) return fail("unreadable");
                byte[] buf = new byte[64 * 1024];
                long total = 0;
                int n;
                while ((n = in.read(buf)) != -1) {
                    total += n;
                    if (total > MAX_INPUT) return fail("large");
                    out.write(buf, 0, n);
                }
                if (total == 0) return fail("corrupt");
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(tmp.getPath(), bounds);
            String mime = bounds.outMimeType == null ? "" : bounds.outMimeType.toLowerCase(Locale.ROOT);
            if (!mime.equals("image/jpeg") && !mime.equals("image/png") && !mime.equals("image/webp"))
                return fail(bounds.outWidth <= 0 ? "corrupt" : "format");
            int w = bounds.outWidth, h = bounds.outHeight;
            if (w <= 0 || h <= 0) return fail("corrupt");
            if (w > MAX_DIM || h > MAX_DIM) return fail("large");

            int rotation = 0;
            try {
                int o = new ExifInterface(tmp.getPath()).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                rotation = o == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : o == ExifInterface.ORIENTATION_ROTATE_180 ? 180
                        : o == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            } catch (Exception ignored) { }
            int rw = rotation % 180 == 0 ? w : h, rh = rotation % 180 == 0 ? h : w;
            // Final size: cover a 1920x1080 screen at most (never upscale), longest side capped.
            double scale = Math.min(1.0, Math.max((double) TARGET_W / rw, (double) TARGET_H / rh));
            scale = Math.min(scale, (double) CAP / Math.max(rw, rh));
            int fw = Math.max(1, (int) Math.round(rw * scale)), fh = Math.max(1, (int) Math.round(rh * scale));

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = 1;
            int sw = rotation % 180 == 0 ? fw : fh, shh = rotation % 180 == 0 ? fh : fw;
            while (w / (opts.inSampleSize * 2) >= sw && h / (opts.inSampleSize * 2) >= shh) opts.inSampleSize *= 2;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap decoded = BitmapFactory.decodeFile(tmp.getPath(), opts);
            if (decoded == null) return fail("corrupt");

            Matrix m = new Matrix();
            m.postRotate(rotation);
            m.postScale((float) fw / (rotation % 180 == 0 ? decoded.getWidth() : decoded.getHeight()),
                    (float) fh / (rotation % 180 == 0 ? decoded.getHeight() : decoded.getWidth()));
            Bitmap finalBmp = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), m, true);
            if (finalBmp != decoded) decoded.recycle();

            String id = "u" + System.currentTimeMillis();
            writeJpeg(finalBmp, full(id), 90);
            Bitmap t = Bitmap.createBitmap(THUMB_W, THUMB_H, Bitmap.Config.ARGB_8888);
            double ts = Math.max((double) THUMB_W / fw, (double) THUMB_H / fh);
            int cw = (int) Math.round(THUMB_W / ts), ch = (int) Math.round(THUMB_H / ts);
            Rect src = new Rect((fw - cw) / 2, (fh - ch) / 2, (fw - cw) / 2 + cw, (fh - ch) / 2 + ch);
            new Canvas(t).drawBitmap(finalBmp, src, new Rect(0, 0, THUMB_W, THUMB_H), new Paint(Paint.FILTER_BITMAP_FLAG));
            writeJpeg(t, thumb(id), 85);
            t.recycle();
            JSONObject ok = new JSONObject().put("ok", true).put("id", id).put("w", fw).put("h", fh);
            finalBmp.recycle();
            return ok;
        } catch (OutOfMemoryError e) {
            Log.w(MainActivity.TAG, "image import out of memory", e);
            return fail("large");
        } catch (SecurityException | IOException e) {
            Log.w(MainActivity.TAG, "image import unreadable", e);
            return fail("unreadable");
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "image import failed", e);
            return fail("corrupt");
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }

    private static long size(ContentResolver cr, Uri uri) {
        try (Cursor c = cr.query(uri, new String[]{OpenableColumns.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) { }
        return -1;
    }

    private static void writeJpeg(Bitmap bmp, File target, int quality) throws IOException {
        File tmp = new File(target.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            if (!bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw new IOException("encode failed");
        }
        if (!tmp.renameTo(target)) { //noinspection ResultOfMethodCallIgnored
            tmp.delete(); throw new IOException("rename failed"); }
    }

    private static JSONObject fail(String code) {
        try { return new JSONObject().put("ok", false).put("error", code); } catch (Exception e) { return new JSONObject(); }
    }
}
