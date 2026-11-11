package tv.customhome.launcher;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.media.tv.TvContract;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import java.net.Inet4Address;
import java.util.Arrays;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceResponse;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import tv.customhome.launcher.dashboard.DashboardData;
import tv.customhome.launcher.dashboard.DashboardRepository;

public final class NativeBridge {
    private static final String ICON_BASE = "https://appassets.androidplatform.net/app-icons/";
    private static final String[] PRAYER_KEYS = {"fajr", "dhuhr", "asr", "maghrib", "isha"};
    private static final String PREFS = "solitary";
    private static final String SETTINGS_KEY = "settings.v3";
    private static final String BACKUP_FILE = "solitary-tv-backup.json";
    private static final String IMPORT_FILE = "smarttv-favorites-import.json";
    private static final int MAX_TEXT = 512 * 1024;

    private final MainActivity activity;
    private final DashboardRepository repository;
    private final Set<String> apps = ConcurrentHashMap.newKeySet();
    private final Map<String, String> inputs = new ConcurrentHashMap<>();
    private final Map<String, byte[]> icons = new ConcurrentHashMap<>();
    private Runnable publishCallback;
    final ImageLibrary images;
    final UiSounds sounds;

    public NativeBridge(MainActivity activity, DashboardRepository repository) {
        this.activity = activity;
        this.repository = repository;
        this.images = new ImageLibrary(activity);
        this.sounds = new UiSounds(activity);
    }

    public void setPublishCallback(Runnable callback) { this.publishCallback = callback; }

    private SharedPreferences prefs() { return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    // ---------------------------------------------------------------- apps

    @JavascriptInterface public String listApps() {
        JSONArray result = new JSONArray();
        try {
            PackageManager manager = activity.getPackageManager();
            Set<String> homePackages = new HashSet<>();
            for (ResolveInfo home : manager.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0))
                homePackages.add(home.activityInfo.packageName);
            Set<String> seen = new HashSet<>();
            String[] categories = {Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER};
            for (String cat : categories) {
                List<ResolveInfo> infos = manager.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(cat), 0);
                for (ResolveInfo info : infos) {
                    String pkg = info.activityInfo.packageName;
                    if (pkg.equals(activity.getPackageName()) || homePackages.contains(pkg) || !seen.add(pkg)) continue;
                    apps.add(pkg);
                    String label = info.activityInfo.applicationInfo.loadLabel(manager).toString();
                    if (label.trim().isEmpty()) label = info.loadLabel(manager).toString();
                    result.put(new JSONObject().put("id", pkg).put("name", label)
                            .put("icon", ICON_BASE + pkg + ".png").put("tv", Intent.CATEGORY_LEANBACK_LAUNCHER.equals(cat)));
                }
            }
            TvInputManager managerInput = (TvInputManager) activity.getSystemService(Context.TV_INPUT_SERVICE);
            if (managerInput != null) for (TvInputInfo input : managerInput.getTvInputList()) {
                if (!input.isPassthroughInput()) continue;
                String id = "input." + Base64.encodeToString(input.getId().getBytes(StandardCharsets.UTF_8),
                        Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
                inputs.put(id, input.getId());
                result.put(new JSONObject().put("id", id).put("name", input.loadLabel(activity).toString())
                        .put("icon", "css/app-icons/hdmi.svg").put("tv", true));
            }
            result.put(new JSONObject().put("id", "system.settings").put("name", "").put("system", true).put("tv", true));
        } catch (Exception e) { Log.w(MainActivity.TAG, "listApps failed", e); }
        return result.toString();
    }

    @JavascriptInterface public boolean isInstalled(String pkg) {
        try { activity.getPackageManager().getPackageInfo(pkg, 0); return true; }
        catch (Exception e) { return false; }
    }

    @JavascriptInterface public boolean launch(String id) {
        Intent intent;
        if ("system.settings".equals(id)) intent = new Intent(Settings.ACTION_SETTINGS);
        else if (inputs.containsKey(id)) intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(TvContract.buildChannelUriForPassthroughInput(inputs.get(id)), "vnd.android.cursor.item/channel");
        else if (apps.contains(id) || isInstalled(id)) {
            intent = activity.getPackageManager().getLeanbackLaunchIntentForPackage(id);
            if (intent == null) intent = activity.getPackageManager().getLaunchIntentForPackage(id);
        } else return false;
        if (intent == null) return false;
        final Intent launchIntent = intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.runOnUiThread(() -> {
            try { activity.startActivity(launchIntent); }
            catch (Exception e) { Toast.makeText(activity, R.string.launch_failed, Toast.LENGTH_SHORT).show(); }
        });
        return true;
    }

    /** Opens the Android "App info" screen for a package (read-only for this app). */
    @JavascriptInterface public boolean appInfo(String pkg) {
        if (!isInstalled(pkg)) return false;
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.runOnUiThread(() -> {
            try { activity.startActivity(intent); }
            catch (Exception e) { Toast.makeText(activity, R.string.launch_failed, Toast.LENGTH_SHORT).show(); }
        });
        return true;
    }

    @JavascriptInterface public void exit() { activity.leave(); }

    // ---------------------------------------------------------------- quick panel

    /** Real connection state from ConnectivityManager (ACCESS_NETWORK_STATE only; no Wi-Fi name, which needs location). */
    @JavascriptInterface public String networkInfo() {
        JSONObject out = new JSONObject();
        try {
            ConnectivityManager cm = (ConnectivityManager) activity.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network net = cm == null ? null : cm.getActiveNetwork();
            NetworkCapabilities caps = net == null ? null : cm.getNetworkCapabilities(net);
            out.put("connected", caps != null);
            if (caps != null) {
                String type = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ? "wifi"
                        : caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ? "ethernet" : "other";
                out.put("type", type);
                out.put("internet", caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
                LinkProperties lp = cm.getLinkProperties(net);
                if (lp != null) for (LinkAddress la : lp.getLinkAddresses())
                    if (la.getAddress() instanceof Inet4Address) { out.put("ip", la.getAddress().getHostAddress()); break; }
            }
        } catch (Exception e) { Log.w(MainActivity.TAG, "networkInfo failed", e); }
        return out.toString();
    }

    // ---------------------------------------------------------------- search keyboard

    @JavascriptInterface public void showKeyboard(String current) { activity.showKeyboard(current); }
    @JavascriptInterface public void hideKeyboard() { activity.hideKeyboard(); }

    // ---------------------------------------------------------------- ambient images

    private static final long MAX_IMAGE = 12L * 1024 * 1024;
    private File ambientDir() { return new File(documents(), "ambient"); }
    private static boolean isImage(String name) {
        String n = name.toLowerCase(java.util.Locale.ROOT);
        return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
    }

    /** User images copied to Android/data/tv.customhome.launcher/files/Documents/ambient/ (max 50, 12 MB each). */
    @JavascriptInterface public String listAmbientImages() {
        JSONArray out = new JSONArray();
        File[] files = ambientDir().listFiles();
        if (files == null) return out.toString();
        Arrays.sort(files);
        for (File f : files) {
            if (out.length() >= 50) break;
            if (f.isFile() && isImage(f.getName()) && f.length() > 0 && f.length() <= MAX_IMAGE)
                out.put("https://appassets.androidplatform.net/ambient-images/" + Uri.encode(f.getName()));
        }
        return out.toString();
    }

    public WebResourceResponse ambientImage(String path) {
        String name = Uri.decode(path);
        if (name.contains("/") || name.contains("..") || !isImage(name)) return null;
        File f = new File(ambientDir(), name);
        if (!f.isFile() || f.length() > MAX_IMAGE) return null;
        try {
            String n = name.toLowerCase(java.util.Locale.ROOT);
            String type = n.endsWith(".png") ? "image/png" : n.endsWith(".webp") ? "image/webp" : "image/jpeg";
            return new WebResourceResponse(type, null, new FileInputStream(f));
        } catch (IOException e) { return null; }
    }

    @JavascriptInterface public String appVersion() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return new JSONObject().put("name", info.versionName).put("code", versionCode(info))
                    .put("package", activity.getPackageName()).toString();
        } catch (Exception e) { return "{}"; }
    }

    /** getLongVersionCode() exists only on Android 9+; minSdk is 26. */
    @SuppressWarnings("deprecation")
    static long versionCode(PackageInfo info) {
        return android.os.Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    // ---------------------------------------------------------------- wallpapers, screensaver, sounds (1.3.0)

    @JavascriptInterface public boolean isDream() { return false; }
    /** Opens the official content picker (the receiver's file manager); the result arrives via TVRemote.imageImported. */
    @JavascriptInterface public boolean pickImage() { return activity.pickContent(MainActivity.REQ_IMAGE, "image/*"); }
    @JavascriptInterface public boolean pickBackup() { return activity.pickContent(MainActivity.REQ_BACKUP, "*/*"); }
    @JavascriptInterface public String listImages() { return images.list(); }
    @JavascriptInterface public boolean deleteImage(String id) { return images.delete(id); }
    @JavascriptInterface public void soundConfig(boolean on, String style, String level) { sounds.configure(on, style, level); }
    @JavascriptInterface public void sound(String event) { if (event != null) sounds.play(event); }
    @JavascriptInterface public void keepScreenOn(boolean on) { activity.setKeepScreenOn(on); }

    // ---------------------------------------------------------------- HOME role

    /** {isDefault, holder}: holder "android" means no default is set (the system would ask). */
    @JavascriptInterface public String homeStatus() {
        JSONObject out = new JSONObject();
        try {
            ResolveInfo ri = activity.getPackageManager().resolveActivity(
                    new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY);
            String holder = ri == null || ri.activityInfo == null ? "" : ri.activityInfo.packageName;
            out.put("holder", holder).put("isDefault", activity.getPackageName().equals(holder))
                    .put("roleRequest", activity.canRequestHomeRole());
        } catch (Exception e) { Log.w(MainActivity.TAG, "homeStatus failed", e); }
        return out.toString();
    }
    /** Official Android dialog that asks the user to make Solitary TV the default Home app. */
    @JavascriptInterface public boolean requestDefaultHome() { return activity.requestHomeRole(); }
    /** Android's own "Home app" chooser (used to switch back to SMART TV). */
    @JavascriptInterface public boolean openHomeSettings() { return activity.openSystemScreen(Settings.ACTION_HOME_SETTINGS); }
    /** Opens another launcher (e.g. SMART TV) through its Home activity without changing the default. */
    @JavascriptInterface public boolean openLauncher(String pkg) {
        if (pkg == null || !isInstalled(pkg)) return false;
        Intent intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setPackage(pkg)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (activity.getPackageManager().resolveActivity(intent, 0) == null) return false;
        activity.runOnUiThread(() -> {
            try { activity.startActivity(intent); }
            catch (Exception e) { Toast.makeText(activity, R.string.launch_failed, Toast.LENGTH_SHORT).show(); }
        });
        return true;
    }

    /** Copies a backup to Download/SolitaryTV/ through MediaStore (no storage permission). Returns the path or "". */
    @JavascriptInterface public String exportBackup(String json) {
        if (json == null || json.length() > MAX_TEXT) return "";
        // MediaStore.Downloads needs Android 10; on older versions export is unavailable (the in-app backup still works)
        if (android.os.Build.VERSION.SDK_INT < 29) return "";
        try {
            new JSONObject(json);
            String name = "SolitaryTV-backup-" + new java.text.SimpleDateFormat("yyyy-MM-dd-HHmm", java.util.Locale.ROOT)
                    .format(new java.util.Date()) + ".json";
            android.content.ContentValues v = new android.content.ContentValues();
            v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/json");
            v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/SolitaryTV");
            Uri uri = activity.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return "";
            try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
                if (out == null) return "";
                out.write(json.getBytes(StandardCharsets.UTF_8));
            }
            return "Download/SolitaryTV/" + name;
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "exportBackup failed", e);
            return "";
        }
    }

    /** Keeps a copy of the current settings before a restore replaces them. */
    @JavascriptInterface public boolean saveSafetyCopy(String json) {
        try {
            if (json == null || json.length() > MAX_TEXT) return false;
            new JSONObject(json);
            write(new File(activity.getFilesDir(), "solitary-tv-before-restore.json"), json);
            return true;
        } catch (Exception e) { return false; }
    }

    // ---------------------------------------------------------------- persistence

    /** Mirror of the page settings so they survive a cleared WebView storage. */
    @JavascriptInterface public void saveSettings(String json) {
        if (json == null || json.length() > MAX_TEXT) return;
        prefs().edit().putString(SETTINGS_KEY, json).apply();
    }

    @JavascriptInterface public String loadSettings() { return prefs().getString(SETTINGS_KEY, ""); }

    private File documents() {
        File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
        if (dir == null) dir = new File(activity.getFilesDir(), "documents");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private static void write(File file, String text) throws IOException {
        File tmp = new File(file.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) { out.write(text.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(file)) { file.delete(); if (!tmp.renameTo(file)) throw new IOException("rename failed"); }
    }

    private static String read(File file) throws IOException {
        if (!file.isFile() || file.length() > MAX_TEXT) throw new IOException("unreadable");
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }

    /** Writes a backup to the app's private storage and to its documents folder. Returns the saved time or 0. */
    @JavascriptInterface public long saveBackup(String json) {
        try {
            if (json == null || json.length() > MAX_TEXT) return 0;
            new JSONObject(json);
            long now = System.currentTimeMillis();
            write(new File(activity.getFilesDir(), BACKUP_FILE), json);
            try { write(new File(documents(), BACKUP_FILE), json); } catch (IOException ignored) { }
            prefs().edit().putLong("backup.at", now).apply();
            return now;
        } catch (Exception e) {
            Log.w(MainActivity.TAG, "saveBackup failed", e);
            return 0;
        }
    }

    @JavascriptInterface public String loadBackup() {
        for (File file : new File[]{new File(activity.getFilesDir(), BACKUP_FILE), new File(documents(), BACKUP_FILE)}) {
            try { return read(file); } catch (IOException ignored) { }
        }
        return "";
    }

    @JavascriptInterface public long backupTime() { return prefs().getLong("backup.at", 0); }

    /** Import file placed in the app's documents folder (for example SMART TV favorites read from its UI). */
    @JavascriptInterface public String readImport() {
        try { return read(new File(documents(), IMPORT_FILE)); } catch (IOException e) { return ""; }
    }

    // ---------------------------------------------------------------- dashboard

    @JavascriptInterface public void refreshDashboard() {
        repository.forceRefresh();
        if (publishCallback != null) activity.runOnUiThread(publishCallback);
    }

    @JavascriptInterface public String dashboard() { return dashboardJson(repository); }

    /** Prayer state for the page; shared with the screensaver (dream) bridge. */
    static String dashboardJson(DashboardRepository repository) {
        JSONObject result = new JSONObject();
        Instant now = Instant.now();
        DashboardRepository.Snapshot state = repository.snapshot();
        try {
            DashboardData.PrayerDay today = DashboardData.today(state.prayers, now);
            DashboardData.NextPrayer next = DashboardData.nextPrayer(state.prayers, now);
            JSONArray prayers = new JSONArray();
            for (int i = 0; i < PRAYER_KEYS.length; i++) prayers.put(new JSONObject().put("key", PRAYER_KEYS[i])
                    .put("time", today == null ? "" : today.times.get(i).toString()));
            result.put("prayers", prayers).put("prayerReady", today != null)
                    .put("prayerUpdated", state.prayerUpdated).put("prayerError", state.prayerError);
            if (next != null && today != null) {
                result.put("nextKey", PRAYER_KEYS[next.index]).put("nextAt", next.at.toEpochMilli())
                        .put("tomorrow", !next.at.atZone(DashboardData.ZONE).toLocalDate().equals(today.date));
            }
            result.put("fetchedAt", now.toEpochMilli());
        } catch (Exception ignored) { }
        return result.toString();
    }

    public WebResourceResponse icon(String path) {
        String pkg = path.endsWith(".png") ? path.substring(0, path.length() - 4) : "";
        if (!apps.contains(pkg)) return null;
        byte[] data = icons.get(pkg);
        if (data == null) {
            try {
                PackageManager manager = activity.getPackageManager();
                Drawable drawable = manager.getApplicationBanner(pkg);
                boolean banner = drawable != null;
                if (drawable == null) drawable = manager.getApplicationIcon(pkg);
                Bitmap bitmap = Bitmap.createBitmap(banner ? 320 : 180, 180, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                int width = Math.max(1, drawable.getIntrinsicWidth()), height = Math.max(1, drawable.getIntrinsicHeight());
                float scale = Math.min((float) bitmap.getWidth() / width, (float) bitmap.getHeight() / height);
                int w = Math.round(width * scale), h = Math.round(height * scale);
                drawable.setBounds((bitmap.getWidth() - w) / 2, (180 - h) / 2, (bitmap.getWidth() + w) / 2, (180 + h) / 2);
                drawable.draw(canvas);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, output);
                bitmap.recycle();
                data = output.toByteArray();
                icons.put(pkg, data);
            } catch (Exception ignored) { return null; }
        }
        return new WebResourceResponse("image/png", null, 200, "OK",
                Collections.singletonMap("Cache-Control", "max-age=86400"), new ByteArrayInputStream(data));
    }
}
