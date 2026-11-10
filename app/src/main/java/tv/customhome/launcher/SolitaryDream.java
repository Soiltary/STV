package tv.customhome.launcher;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.service.dreams.DreamService;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.Collections;

import tv.customhome.launcher.dashboard.DashboardRepository;

/**
 * Optional system screensaver. Android starts it only when the user picks "Solitary TV" in
 * Settings › Device Preferences › Screen saver; the app never selects it by itself. It shows the same
 * screensaver as the in-app one, read-only (it never writes settings). Any remote key ends it (the
 * dream is not interactive), which is the standard Android behaviour.
 */
public final class SolitaryDream extends DreamService {
    private static final String URL = "https://appassets.androidplatform.net/assets/site/index.html?dream=1";
    private WebView web;
    private DashboardRepository repository;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        repository = new DashboardRepository(this);
        ImageLibrary images = new ImageLibrary(this);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.setBackgroundColor(0xFF000000);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/user-images/", images::serve)
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
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        web.addJavascriptInterface(new Bridge(this, repository, images), "AndroidTV");
        setContentView(web);
        web.loadUrl(URL);
    }

    @Override public void onDreamingStarted() {
        super.onDreamingStarted();
        if (web != null) { web.onResume(); web.resumeTimers(); }
        if (repository != null) repository.refreshIfNeeded();
    }

    @Override public void onDreamingStopped() {
        if (web != null) { web.onPause(); }
        super.onDreamingStopped();
    }

    @Override public void onDetachedFromWindow() {
        if (web != null) { web.removeJavascriptInterface("AndroidTV"); web.destroy(); web = null; }
        if (repository != null) { repository.close(); repository = null; }
        super.onDetachedFromWindow();
    }

    /** Read-only subset of NativeBridge for the screensaver page. */
    public static final class Bridge {
        private final Context context;
        private final DashboardRepository repository;
        private final ImageLibrary images;
        Bridge(Context context, DashboardRepository repository, ImageLibrary images) {
            this.context = context; this.repository = repository; this.images = images;
        }
        @JavascriptInterface public boolean isDream() { return true; }
        @JavascriptInterface public String loadSettings() {
            SharedPreferences p = context.getSharedPreferences("solitary", Context.MODE_PRIVATE);
            return p.getString("settings.v3", "");
        }
        @JavascriptInterface public String dashboard() { return NativeBridge.dashboardJson(repository); }
        @JavascriptInterface public String listImages() { return images.list(); }
        @JavascriptInterface public String appVersion() {
            try {
                PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
                return new JSONObject().put("name", info.versionName).put("code", info.getLongVersionCode()).toString();
            } catch (Exception e) { Log.w(MainActivity.TAG, "dream version", e); return "{}"; }
        }
    }
}
