package fr.satodce.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Two screens in one app: the official FC Web App and SatoDCE. The SatoDCE
 * connector (the same code as the bookmark) runs inside the FC screen with one
 * tap, so Android users never have to create a bookmark.
 */
public class MainActivity extends Activity {
    static final String SITE = BuildConfig.SITE;
    static final String FC_URL = "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/";
    static final int FILE_REQUEST = 41;
    static final String ALLOW_PORTRAIT = "(()=>{if(document.getElementById('satodce-portrait'))return;const s=document.createElement('style');s.id='satodce-portrait';s.textContent='.ui-orientation-warning,.ea-dialog-view-type--rotate{display:none!important}';(document.head||document.documentElement).append(s);})()";

    final ExecutorService io = Executors.newSingleThreadExecutor();
    final Handler main = new Handler(Looper.getMainLooper());
    FrameLayout content;
    WebView fc, sato;
    Button tabFc, tabSato;
    ValueCallback<Uri[]> fileCallback;
    Updater updater;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        CookieManager.getInstance().setAcceptCookie(true);
        // Debug builds only: lets Chrome DevTools inspect the screens.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(getColor(R.color.background));
        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        root.addView(bottomBar(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)));
        setContentView(root);

        fc = newWebView(false);
        sato = newWebView(true);
        content.addView(sato);
        content.addView(fc);
        if (state != null) { fc.restoreState(state.getBundle("fc")); sato.restoreState(state.getBundle("sato")); }
        else { fc.loadUrl(FC_URL); sato.loadUrl(SITE + "/"); }
        show(fc);

        updater = new Updater(this);
        updater.check(false);
        handleLogin(getIntent());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        Bundle a = new Bundle(), b = new Bundle();
        fc.saveState(a); sato.saveState(b);
        out.putBundle("fc", a); out.putBundle("sato", b);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleLogin(intent);
    }

    /** satodce://login?code=… comes back from app-login.html after the Google sign-in in the browser. */
    void handleLogin(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"satodce".equals(data.getScheme())) return;
        String code = data.getQueryParameter("code");
        if (code == null || !code.matches("[a-f0-9]{16,128}")) return;
        show(sato);
        // A fetch keeps the current page (and an open FC connection); the cookie is set by the response.
        sato.evaluateJavascript("fetch('/app-redeem?json=1&code=" + code + "',{credentials:'same-origin'}).then(r=>r.json()).then(d=>{if(!d.ok)alert('Lien de connexion expiré : touche à nouveau « Continuer avec Google ».');location.reload();}).catch(()=>alert('Connexion impossible : vérifie ta connexion internet.'));", null);
        toast("Connexion à SatoDCE…");
    }

    View bottomBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setBackgroundColor(getColor(R.color.bar));
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(6), dp(6), dp(6), dp(6));
        tabFc = tab("FC Web App", v -> show(fc));
        Button connect = tab("⚡ SatoDCE", v -> connectorMenu());
        connect.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.accent));
        bg.setCornerRadius(dp(12));
        connect.setBackground(bg);
        connect.setBackgroundTintList(null);
        connect.setTextColor(Color.WHITE);
        tabSato = tab("Site SatoDCE", v -> show(sato));
        for (Button b : new Button[]{tabFc, connect, tabSato}) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            p.setMargins(dp(4), 0, dp(4), 0);
            bar.addView(b, p);
        }
        return bar;
    }

    Button tab(String text, View.OnClickListener click) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextSize(13);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(getColor(R.color.muted));
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setOnClickListener(click);
        return b;
    }

    void show(WebView view) {
        fc.setVisibility(view == fc ? View.VISIBLE : View.GONE);
        sato.setVisibility(view == sato ? View.VISIBLE : View.GONE);
        tabFc.setTextColor(getColor(view == fc ? R.color.text : R.color.muted));
        tabSato.setTextColor(getColor(view == sato ? R.color.text : R.color.muted));
    }

    /** Replaces the bookmarks: runs the same connector code inside the FC screen. */
    void connectorMenu() {
        String[] items = {
            "Importer mon équipe et le DCE ouvert",
            "Synchroniser ma collection (album)",
            "Ouvrir la Web App FC",
            "Rechercher une mise à jour de l’appli"
        };
        new AlertDialog.Builder(this)
            .setTitle("SatoDCE")
            .setItems(items, (d, which) -> {
                if (which == 0) runConnector("/import-test.txt");
                else if (which == 1) runConnector("/collection-connector.txt");
                else if (which == 2) { show(fc); fc.loadUrl(FC_URL); }
                else updater.check(true);
            })
            .show();
    }

    void runConnector(String path) {
        if (fc.getUrl() == null || !fc.getUrl().contains("/ultimate-team/web-app")) {
            show(fc);
            toast("Ouvre et connecte d’abord la Web App FC, puis relance.");
            return;
        }
        show(fc);
        toast("Connexion de SatoDCE à FC…");
        io.execute(() -> {
            try {
                String code = download(SITE + path + "?app=android");
                if (code.startsWith("javascript:")) code = code.substring("javascript:".length());
                if (code.contains("%3D") || code.contains("%7B")) code = URLDecoder.decode(code, "UTF-8");
                final String js = code;
                main.post(() -> fc.evaluateJavascript(js, null));
            } catch (Exception e) {
                main.post(() -> toast("Connecteur indisponible : vérifie ta connexion internet."));
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    WebView newWebView(boolean satoSide) {
        WebView w = new WebView(this);
        w.setBackgroundColor(getColor(R.color.background));
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        // Honour the sites' mobile viewport like a regular browser (FC refuses a too small window otherwise).
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Present a regular mobile Chrome: some sites refuse the WebView marker.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+(\\.\\d+)* ", ""));
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        if (satoSide) w.addJavascriptInterface(new SatoBridge(), "SatoApp");
        w.setWebViewClient(new WebViewClient() {
            /** EA asks tablets in portrait to rotate; its Web App works fine in portrait, so the warning is hidden. */
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.contains("ea.com")) view.evaluateJavascript(ALLOW_PORTRAIT, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            /** The connector opens SatoDCE with window.open: it becomes the SatoDCE screen, linked to FC. */
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) {
                if (view != fc) return openExternally(result);
                WebView popup = newWebView(true);
                content.removeView(sato);
                sato.destroy();
                sato = popup;
                content.addView(sato, 0);
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                show(sato);
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                if (window == sato) { show(fc); }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        // Exports made by the site (blob: links) are saved into Downloads through the bridge.
        w.setDownloadListener((url, ua, disposition, mime, length) -> {
            if (url.startsWith("blob:")) {
                w.evaluateJavascript("fetch('" + url + "').then(r=>r.blob()).then(b=>new Promise(ok=>{const f=new FileReader();f.onload=()=>ok(f.result);f.readAsDataURL(b);})).then(d=>SatoApp.saveFile(d,document.querySelector('a[download]')?.download||'satodce-export.json'));", null);
            } else {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
            }
        });
        return w;
    }

    /** New windows opened by the SatoDCE site (PayPal, external links) go to the phone browser. */
    boolean openExternally(Message result) {
        WebView probe = new WebView(this);
        probe.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) { }
                view.destroy();
                return true;
            }
        });
        ((WebView.WebViewTransport) result.obj).setWebView(probe);
        result.sendToTarget();
        return true;
    }

    /** Functions the SatoDCE site may call when it runs inside the app. */
    class SatoBridge {
        @JavascriptInterface
        public void openLogin() {
            main.post(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(SITE + "/app-login.html"))); }
                catch (Exception e) { toast("Aucun navigateur pour la connexion Google."); }
            });
        }

        @JavascriptInterface
        public String version() { return BuildConfig.VERSION_NAME; }

        /** After "Placer dans le DCE FC": show the filled DCE in the FC tab. */
        @JavascriptInterface
        public void showFc() { main.post(() -> show(fc)); }

        @JavascriptInterface
        public void saveFile(String dataUrl, String name) {
            try {
                int comma = dataUrl.indexOf(',');
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String safe = name.replaceAll("[^\\w.-]", "_");
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri target = Build.VERSION.SDK_INT >= 29 ? getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) : null;
                if (target == null) throw new IllegalStateException();
                try (OutputStream out = getContentResolver().openOutputStream(target)) { out.write(bytes); }
                main.post(() -> toast("Enregistré dans Téléchargements : " + safe));
            } catch (Exception e) {
                main.post(() -> toast("Enregistrement impossible sur cet appareil."));
            }
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
        if (request == Updater.PERMISSION_REQUEST) updater.resume();
    }

    @Override
    public void onBackPressed() {
        WebView current = sato.getVisibility() == View.VISIBLE ? sato : fc;
        if (current.canGoBack()) current.goBack();
        else super.onBackPressed();
    }

    static String download(String address) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "SatoDCE-Android/" + BuildConfig.VERSION_NAME);
        if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode());
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16384];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }

    int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

}
