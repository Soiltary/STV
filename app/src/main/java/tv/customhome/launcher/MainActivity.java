package tv.customhome.launcher;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;

import org.json.JSONObject;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.util.Collections;

import tv.customhome.launcher.dashboard.DashboardRepository;

public final class MainActivity extends Activity {
    static final String TAG = "SolitaryTV";
    private static final String START_URL = "https://appassets.androidplatform.net/assets/site/index.html";
    /** Codes sent to JavaScript. 13 = OK (short press), 1000 = OK long press, 1001 = Menu. */
    private static final int KEY_OK = 13, KEY_LONG_OK = 1000, KEY_MENU = 1001;
    static final int REQ_IMAGE = 41, REQ_BACKUP = 42, REQ_HOME = 43;
    /** Android TV ships this package with do-nothing "Documents" stubs; never send the user there. */
    private static final String STUB_PACKAGE = "com.android.tv.frameworkpackagestubs";
    private final java.util.concurrent.ExecutorService worker = java.util.concurrent.Executors.newSingleThreadExecutor();

    private WebView web;
    private EditText searchField;
    private NativeBridge bridge;
    private DashboardRepository repository;
    private final Handler timer = new Handler(Looper.getMainLooper());
    private boolean okDown, okLongSent, pageReady;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            repository.refreshIfNeeded();
            publish();
            timer.postDelayed(this, 60_000);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        repository = new DashboardRepository(this);
        bridge = new NativeBridge(this, repository);
        bridge.setPublishCallback(this::publish);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        web.setBackgroundColor(0xFF03060D);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // The page draws its own focus ring; the WebView itself must not take D-pad focus traversal.
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/app-icons/", bridge::icon)
                .addPathHandler("/ambient-images/", bridge::ambientImage)
                .addPathHandler("/user-images/", bridge.images::serve)
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                WebResourceResponse local = loader.shouldInterceptRequest(uri);
                if (local != null) return local;
                if ("https".equals(uri.getScheme()) && "api.open-meteo.com".equals(uri.getHost())
                        && "/v1/forecast".equals(uri.getPath()) && "GET".equals(request.getMethod())) return null;
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(),
                        new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !START_URL.equals(request.getUrl().toString());
            }
            @Override public void onPageFinished(WebView view, String url) { pageReady = true; publish(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                String text = message.message() + " @" + message.lineNumber();
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.e(TAG, text);
                else Log.i(TAG, text);
                return true;
            }
        });
        web.addJavascriptInterface(bridge, "AndroidTV");
        FrameLayout root = new FrameLayout(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        searchField = new EditText(this);
        searchField.setSingleLine(true);
        searchField.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        searchField.setImeOptions(EditorInfo.IME_ACTION_SEARCH | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        searchField.setAlpha(0.01f);
        searchField.setBackground(null);
        searchField.setOnEditorActionListener((v, actionId, event) -> {
            hideKeyboard();
            web.evaluateJavascript("window.TVRemote && window.TVRemote.searchDone()", null);
            return true;
        });
        root.addView(searchField, new FrameLayout.LayoutParams(2, 2));
        setContentView(root);
        web.requestFocus();
        web.loadUrl(START_URL);
    }

    private void publish() {
        if (web != null && pageReady)
            web.evaluateJavascript("window.TVPersonal && window.TVPersonal.update(" + bridge.dashboard() + ")", null);
    }

    private void sendKey(int key) {
        if (web != null) web.evaluateJavascript("window.TVRemote && window.TVRemote.key(" + key + ")", null);
    }

    @Override protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        repository.listen(this::publish);
        repository.refreshIfNeeded();
        publish();
        web.evaluateJavascript("window.TVRemote && window.TVRemote.resume()", null);
        bridge.sounds.resume();
        timer.removeCallbacks(tick);
        timer.postDelayed(tick, 60_000);
    }

    @Override protected void onPause() {
        bridge.sounds.pause();
        timer.removeCallbacks(tick);
        repository.listen(null);
        okDown = false;
        okLongSent = false;
        web.evaluateJavascript("window.TVRemote && window.TVRemote.pause && window.TVRemote.pause()", null);
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        web.evaluateJavascript("window.TVRemote && window.TVRemote.home()", null);
    }

    /**
     * All remote keys are routed here before the WebView sees them, so focus handling is
     * deterministic and does not depend on WebView spatial navigation or DOM focus.
     */
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        boolean up = event.getAction() == KeyEvent.ACTION_UP;
        if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER || code == KeyEvent.KEYCODE_BUTTON_A) {
            if (down) {
                if (event.getRepeatCount() == 0) { okDown = true; okLongSent = false; }
                else if (okDown && !okLongSent && (event.getRepeatCount() >= 1 || event.isLongPress())) {
                    okLongSent = true;
                    sendKey(KEY_LONG_OK);
                }
            } else if (up) {
                if (okDown && !okLongSent && !event.isCanceled()) sendKey(KEY_OK);
                okDown = false;
                okLongSent = false;
            }
            return true;
        }
        int key = browserKey(code);
        if (key != 0) {
            if (down && (key != 27 || event.getRepeatCount() == 0)) sendKey(key);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private int browserKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return 37;
            case KeyEvent.KEYCODE_DPAD_UP: return 38;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return 39;
            case KeyEvent.KEYCODE_DPAD_DOWN: return 40;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE: return 27;
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_INFO:
            case KeyEvent.KEYCODE_SETTINGS: return KEY_MENU;
            default: return 0;
        }
    }

    /**
     * Search typing goes through a real (visually hidden) EditText: WebView inputs cannot reliably
     * receive IME focus from a remote key, so the Android keyboard would open with nothing to type into.
     */
    void showKeyboard(String current) {
        runOnUiThread(() -> {
            searchField.removeTextChangedListener(searchWatcher);
            searchField.setText(current == null ? "" : current);
            searchField.setSelection(searchField.getText().length());
            searchField.addTextChangedListener(searchWatcher);
            searchField.requestFocus();
            timer.postDelayed(() -> {
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(searchField, InputMethodManager.SHOW_IMPLICIT);
            }, 80);
        });
    }

    void hideKeyboard() {
        runOnUiThread(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(searchField.getWindowToken(), 0);
            if (searchField.hasFocus()) web.requestFocus();
        });
    }

    private final TextWatcher searchWatcher = new TextWatcher() {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) { }
        @Override public void afterTextChanged(Editable s) {
            web.evaluateJavascript("window.TVRemote && window.TVRemote.searchText(" + JSONObject.quote(s.toString()) + ")", null);
        }
    };

    /** Called from JavaScript when Back is pressed on the first Home tile: hand control back to the launcher. */
    void leave() {
        runOnUiThread(() -> { if (!moveTaskToBack(true)) finish(); });
    }

    private void js(String code) { runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); }); }

    /** Screen stays on while Solitary TV runs its own screensaver timer, so the system screensaver does not cut in first. */
    void setKeepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    /** Official content picker (ACTION_GET_CONTENT). Returns false when the receiver has no real picker. */
    boolean pickContent(int request, String mime) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime);
        java.util.List<android.content.pm.ResolveInfo> handlers = new java.util.ArrayList<>();
        for (android.content.pm.ResolveInfo ri : getPackageManager().queryIntentActivities(intent, 0))
            if (!STUB_PACKAGE.equals(ri.activityInfo.packageName)) handlers.add(ri);
        if (handlers.isEmpty()) return false;
        if (handlers.size() == 1)
            intent.setClassName(handlers.get(0).activityInfo.packageName, handlers.get(0).activityInfo.name);
        final Intent launch = handlers.size() == 1 ? intent : Intent.createChooser(intent, null);
        runOnUiThread(() -> {
            try { startActivityForResult(launch, request); }
            catch (Exception e) {
                Log.w(TAG, "picker failed", e);
                js(request == REQ_IMAGE ? "window.TVRemote && TVRemote.imageImported({ok:false,error:'nopicker'})"
                        : "window.TVRemote && TVRemote.backupPicked({ok:false,error:'nopicker'})");
            }
        });
        return true;
    }

    boolean canRequestHomeRole() {
        if (android.os.Build.VERSION.SDK_INT < 29) return false;
        android.app.role.RoleManager rm = getSystemService(android.app.role.RoleManager.class);
        return rm != null && rm.isRoleAvailable(android.app.role.RoleManager.ROLE_HOME);
    }

    /** Shows Android's own "make this the default Home app" dialog; the user confirms it. */
    boolean requestHomeRole() {
        // explicit API check (same result as canRequestHomeRole) so Android Lint can see RoleManager is API 29+
        if (android.os.Build.VERSION.SDK_INT < 29 || !canRequestHomeRole()) return false;
        android.app.role.RoleManager rm = getSystemService(android.app.role.RoleManager.class);
        Intent intent = rm.createRequestRoleIntent(android.app.role.RoleManager.ROLE_HOME);
        runOnUiThread(() -> {
            try { startActivityForResult(intent, REQ_HOME); }
            catch (Exception e) { Log.w(TAG, "role request failed", e); js("window.TVRemote && TVRemote.homeChanged()"); }
        });
        return true;
    }

    /** Opens a system settings screen, skipping Android TV's empty stub activities. */
    boolean openSystemScreen(String action) {
        Intent intent = new Intent(action);
        for (android.content.pm.ResolveInfo ri : getPackageManager().queryIntentActivities(intent, 0)) {
            if (ri.activityInfo.name.endsWith("EmptyStubActivity") || STUB_PACKAGE.equals(ri.activityInfo.packageName)) continue;
            Intent target = new Intent(action).setClassName(ri.activityInfo.packageName, ri.activityInfo.name)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            runOnUiThread(() -> {
                try { startActivity(target); } catch (Exception e) { Log.w(TAG, "open screen failed", e); }
            });
            return true;
        }
        return false;
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        final Uri uri = data == null ? null : data.getData();
        if (requestCode == REQ_IMAGE) {
            if (resultCode != RESULT_OK || uri == null) { js("window.TVRemote && TVRemote.imageImported({ok:false,error:'cancel'})"); return; }
            worker.execute(() -> {
                String result = bridge.images.importUri(uri).toString();
                js("window.TVRemote && TVRemote.imageImported(" + result + ")");
            });
        } else if (requestCode == REQ_BACKUP) {
            if (resultCode != RESULT_OK || uri == null) { js("window.TVRemote && TVRemote.backupPicked({ok:false,error:'cancel'})"); return; }
            worker.execute(() -> {
                JSONObject out = new JSONObject();
                try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                    if (in == null) throw new java.io.IOException("unreadable");
                    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) != -1) {
                        buf.write(b, 0, n);
                        if (buf.size() > 512 * 1024) throw new java.io.IOException("large");
                    }
                    out.put("ok", true).put("text", buf.toString("UTF-8"));
                } catch (Exception e) {
                    try { out.put("ok", false).put("error", "large".equals(e.getMessage()) ? "large" : "unreadable"); } catch (Exception ignored) { }
                }
                js("window.TVRemote && TVRemote.backupPicked(" + out + ")");
            });
        } else if (requestCode == REQ_HOME) {
            js("window.TVRemote && TVRemote.homeChanged()");
        }
    }

    @Override protected void onDestroy() {
        worker.shutdownNow();
        timer.removeCallbacks(tick);
        repository.close();
        web.removeJavascriptInterface("AndroidTV");
        web.destroy();
        super.onDestroy();
    }
}
