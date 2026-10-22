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
import android.os.SystemClock;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.style.ImageSpan;
import android.graphics.drawable.Drawable;
import android.view.MotionEvent;
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
import android.widget.EditText;

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
    Button solveInSato, syncAlbum, syncTeam;
    int profileSlot() { return 0; }
    @SuppressWarnings("deprecation")
    android.content.SharedPreferences profiles() { return getSharedPreferences("local-profiles", MODE_PRIVATE | MODE_MULTI_PROCESS); }
    /** Number of EA + SatoDCE account pairs (the first one always exists). */
    int profileCount() { int n = 1; for (int slot = 1; slot < 4; slot++) if (profiles().getBoolean("created-" + slot, false)) n++; return n; }
    /** From the ⚡ menu: opens the next free profile, or the picker once all four exist. */
    void addAccount() {
        if (Build.VERSION.SDK_INT < 28) { toast("Plusieurs comptes nécessitent Android 9 ou plus récent."); return; }
        for (int slot = 1; slot < 4; slot++) if (!profiles().getBoolean("created-" + slot, false)) { nameProfile(slot, true); return; }
        chooseProfile();
    }
    String profileName(int slot) { return profiles().getString("email-" + slot, profiles().getString("name-" + slot, "Adresse e-mail à connecter")); }
    void chooseProfile() {
        if (Build.VERSION.SDK_INT < 28) { toast("Les profils séparés nécessitent Android 9 ou plus récent."); return; }
        String[] labels = new String[5];
        for (int slot = 0; slot < 4; slot++) labels[slot] = (slot == profileSlot() ? "✓ " : "") + profileName(slot) + (profiles().getBoolean("created-" + slot, slot == 0) ? "" : " · Ajouter");
        labels[4] = "Renseigner l’adresse e-mail";
        new AlertDialog.Builder(this).setTitle("Comptes FC + SatoDCE")
            .setItems(labels, (dialog, selected) -> {
                if (selected == 4) { nameProfile(profileSlot(), false); return; }
                if (!profiles().getBoolean("created-" + selected, selected == 0)) nameProfile(selected, true);
                else switchProfile(selected);
            }).setNegativeButton("Fermer", null).show();
    }
    void nameProfile(int slot, boolean open) {
        EditText name = new EditText(this);name.setSingleLine();name.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);name.setHint("adresse@exemple.fr");
        String savedEmail = profiles().getString("email-" + slot, "");name.setText(savedEmail);
        name.setSelectAllOnFocus(true);name.setPadding(dp(20), dp(12), dp(20), dp(12));
        new AlertDialog.Builder(this).setTitle(open ? "Ajouter une paire de comptes" : "Nom du profil")
            .setMessage("Connecte ton compte EA et le compte SatoDCE associé dans ce profil. Leurs sessions et données restent séparées des autres profils.")
            .setView(name).setPositiveButton("Enregistrer", (dialog, which) -> {
                String label = name.getText().toString().trim();
                if (!android.util.Patterns.EMAIL_ADDRESS.matcher(label).matches()) { toast("Renseigne une adresse e-mail valide."); return; }
                profiles().edit().putString("email-" + slot, label).putBoolean("created-" + slot, true).commit();
                if (open) switchProfile(slot);
            }).setNegativeButton("Annuler", null).show();
    }
    void switchProfile(int slot) {
        if (slot == profileSlot()) return;
        CookieManager.getInstance().flush();
        Class<?>[] activities = {MainActivity.class, ProfileOneActivity.class, ProfileTwoActivity.class, ProfileThreeActivity.class};
        profiles().edit().putInt("active", slot).commit();
        Intent next = new Intent(this, activities[slot]);next.putExtra("profile-selected", true);
        // Each profile has its own task and WebView process. Keep its live FC
        // page: cookies alone do not preserve EA's in-memory session.
        next.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(next);
    }
    final Runnable updateActions = new Runnable() {
        @Override public void run() {
            if (!foreground || isFinishing() || isDestroyed()) return;
            if (fc.getVisibility() == View.VISIBLE) fc.evaluateJavascript("!!window.__satoDceHasChallenge?.()", ready -> setChallengeActions("true".equals(ready)));
            else setChallengeActions(false);
            main.postDelayed(this, 2000);
        }
    };
    ValueCallback<Uri[]> fileCallback;
    Updater updater;
    boolean foreground;
    boolean reconnectStarted, connectorRunning, backgroundSync, albumMarketRunning;
    volatile boolean accountConnected;
    boolean accountPanelRequested;
    int readyChecks, disconnectedChecks;
    final Runnable reconnect = new Runnable() {
        @Override public void run() {
            if (!foreground || isFinishing() || isDestroyed()) return;
            if (!accountConnected) { main.postDelayed(this, 2000); return; }
            if (connectorRunning) { main.postDelayed(this, 2000); return; }
            fc.evaluateJavascript("(()=>{try{return !!document.querySelector('button.icon-sbc') && !!window.services?.User?.getUser?.()?.getSelectedPersona?.() && !!window.services?.SBC?.requestSets;}catch{return false;}})()", ready -> {
                if (!foreground || isFinishing() || isDestroyed()) return;
                if (!"true".equals(ready)) {
                    readyChecks = 0;
                    if (++disconnectedChecks >= 3) reconnectStarted = false;
                }
                else if (!reconnectStarted && ++readyChecks >= 3) {
                    disconnectedChecks = 0;
                    reconnectStarted = true;
                    connectorRunning = true;
                    backgroundSync = true;
                    try (InputStream in = getAssets().open("reconnect.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buffer = new byte[16384];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        fc.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception e) { reconnectStarted = false; backgroundSync = false; }
                    connectorRunning = false;
                }
                else if ("true".equals(ready)) disconnectedChecks = 0;
                main.postDelayed(this, reconnectStarted ? 10000 : 2000);
            });
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        // Browser login callbacks are delivered to the launcher activity; send
        // them back to the selected profile before accessing its cookie store.
        if (profileSlot() == 0 && getIntent().getData() != null && profiles().getInt("active", 0) != 0 && Build.VERSION.SDK_INT >= 28) {
            Class<?>[] activities = {MainActivity.class, ProfileOneActivity.class, ProfileTwoActivity.class, ProfileThreeActivity.class};
            startActivity(new Intent(this, activities[profiles().getInt("active", 0)]).setData(getIntent().getData()).putExtra("profile-selected", true));finish();return;
        }
        CookieManager.getInstance().setAcceptCookie(true);
        // Debug builds only: lets Chrome DevTools inspect the screens.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(getColor(R.color.background));
        root.addView(topBar(), new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)));
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
        // A single account never sees the profile picker: it only appears once a second EA account was added.
        if (Build.VERSION.SDK_INT >= 28 && state == null && profileCount() > 1 && !getIntent().getBooleanExtra("profile-selected", false) && getIntent().getData() == null) chooseProfile();
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
        if (profileSlot() == 0 && intent.getData() != null && profiles().getInt("active", 0) != 0 && Build.VERSION.SDK_INT >= 28) {
            Class<?>[] activities = {MainActivity.class, ProfileOneActivity.class, ProfileTwoActivity.class, ProfileThreeActivity.class};
            startActivity(new Intent(this, activities[profiles().getInt("active", 0)]).setData(intent.getData()).putExtra("profile-selected", true));return;
        }
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
        tabSato = tab("Site SatoDCE", v -> show(sato));
        tabLogo(tabFc, R.drawable.ic_fc, "FC Web App");
        tabLogo(tabSato, R.drawable.ic_sato, "Site SatoDCE");
        tabSato.setOnLongClickListener(v -> { connectorMenu(); return true; });
        for (Button b : new Button[]{tabFc, tabSato}) {
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            p.setMargins(dp(4), 0, dp(4), 0);
            bar.addView(b, p);
        }
        return bar;
    }

    View topBar() {
        LinearLayout bar = new LinearLayout(this);
        bar.setBackgroundColor(getColor(R.color.bar));
        bar.setPadding(dp(6), dp(8), dp(6), dp(8));
        Button home = tab("⌂", v -> {
            if (fc.getVisibility() == View.VISIBLE) tapFcControl("button.icon-home", () -> show(sato));
            else sato.evaluateJavascript("document.querySelector('[data-page=home]')?.click();window.scrollTo(0,0)", null);
        });
        home.setContentDescription("Accueil");
        home.setTextSize(26);
        home.setPadding(0, 0, 0, 0);
        home.setMinWidth(0);
        home.setMinimumWidth(0);
        home.setBackground(pill(0xFF293241, 0xFF475569));
        bar.addView(home, new LinearLayout.LayoutParams(dp(46), ViewGroup.LayoutParams.MATCH_PARENT));
        Button accounts = tab("Comptes", v -> chooseProfile());
        accounts.setTextSize(11);accounts.setPadding(0,0,0,0);accounts.setMinWidth(0);accounts.setMinimumWidth(0);
        accounts.setContentDescription("Choisir les comptes FC et SatoDCE");
        accounts.setBackground(pill(0xFF293241, 0xFF475569));
        LinearLayout.LayoutParams accountParams = new LinearLayout.LayoutParams(dp(60), ViewGroup.LayoutParams.MATCH_PARENT);
        accountParams.setMargins(dp(5), 0, 0, 0);bar.addView(accounts, accountParams);
        // Always-visible settings, like the Windows app (the FC menu entry can be hidden on small screens).
        Button settings = tab("⚙", v -> connectorMenu());
        settings.setTextSize(20);settings.setPadding(0,0,0,0);settings.setMinWidth(0);settings.setMinimumWidth(0);
        settings.setContentDescription("Réglages SatoDCE");
        settings.setBackground(pill(0xFF293241, 0xFF475569));
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(dp(46), ViewGroup.LayoutParams.MATCH_PARENT);
        settingsParams.setMargins(dp(5), 0, 0, 0);bar.addView(settings, settingsParams);
        syncTeam = tab("↻ Mon club", v -> runConnector("/import-test.txt"));
        syncTeam.setContentDescription("Synchroniser le club, l’équipe et les DCE");
        syncAlbum = tab("↻ Album", v -> runConnector("/collection-connector.txt"));
        syncAlbum.setContentDescription("Synchroniser l’album");
        solveInSato = tab("Résoudre dans SatoDCE →", v -> fc.evaluateJavascript("window.__satoDceSolve?.().then(()=>SatoFcApp.showSato()).catch(e=>alert(e.message))", null));
        tabLogo(solveInSato, R.drawable.ic_sato, "Résoudre dans SatoDCE");
        solveInSato.setVisibility(View.GONE);
        for (Button b : new Button[]{syncTeam, syncAlbum, solveInSato}) {
            b.setTextSize(14);
            b.setTextColor(Color.WHITE);
            b.setPadding(dp(8), 0, dp(8), 0);
            b.setMaxLines(2);
            b.setBackground(pill(b == solveInSato ? 0xFF2563EB : 0xFF244D83, 0xFF609DF5));
            b.setBackgroundTintList(null);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1);
            p.setMargins(dp(6), 0, 0, 0);
            bar.addView(b, p);
        }
        solveInSato.setTextSize(16);
        return bar;
    }

    GradientDrawable pill(int color, int border) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(16));
        bg.setStroke(dp(1), border);
        return bg;
    }

    void tabLogo(Button button, int icon, String label) {
        Drawable drawable = getDrawable(icon);
        drawable.setBounds(0, 0, dp(24), dp(24));
        SpannableString text = new SpannableString("\uFFFC  " + label);
        text.setSpan(new ImageSpan(drawable, ImageSpan.ALIGN_BOTTOM), 0, 1, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        button.setText(text);
        button.setContentDescription(label);
    }

    void setChallengeActions(boolean challenge) {
        solveInSato.setVisibility(challenge ? View.VISIBLE : View.GONE);
        syncTeam.setVisibility(challenge ? View.GONE : View.VISIBLE);
        syncAlbum.setVisibility(challenge ? View.GONE : View.VISIBLE);
    }

    void runBundledConnector(String asset) {
        if (connectorRunning) return;
        fc.evaluateJavascript("!!document.querySelector('button.icon-sbc')", ready -> {
            if (!"true".equals(ready)) { show(fc); toast("Connecte-toi à FC pour synchroniser."); return; }
            try (InputStream in = getAssets().open(asset)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[16384];
                for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                reconnectStarted = true;
                fc.evaluateJavascript(out.toString("UTF-8"), null);
            } catch (Exception e) { toast("Synchronisation indisponible."); }
        });
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
        if (view == fc) fc.evaluateJavascript("window.__satoSettingsPanel?.close?.();document.querySelector('#satodce-settings-panel')?.remove()", null);
        boolean switching = view.getVisibility() != View.VISIBLE;
        fc.setVisibility(view == fc ? View.VISIBLE : View.GONE);
        sato.setVisibility(view == sato ? View.VISIBLE : View.GONE);
        if (switching) view.requestFocus();
        tabFc.setTextColor(getColor(view == fc ? R.color.text : R.color.muted));
        tabSato.setTextColor(getColor(view == sato ? R.color.text : R.color.muted));
        tabFc.setBackground(pill(view == fc ? 0xFF2563EB : 0xFF202938, view == fc ? 0xFF7AAEFF : 0xFF42506A));
        tabSato.setBackground(pill(view == sato ? 0xFF2563EB : 0xFF202938, view == sato ? 0xFF7AAEFF : 0xFF42506A));
        tabFc.setSelected(view == fc);
        tabSato.setSelected(view == sato);
        if (view == sato) setChallengeActions(false);
    }

    void openAccountPanel() {
        // The site boots asynchronously; wait for its account page to be ready.
        sato.evaluateJavascript("(()=>{if(window.__satoAccountWait)return;let attempts=0;const open=()=>{if(document.documentElement.dataset.ready==='true'){window.dispatchEvent(new Event('satodce-open-account'));return true;}return false;};if(open())return;window.__satoAccountWait=setInterval(()=>{if(open()||++attempts>120){clearInterval(window.__satoAccountWait);window.__satoAccountWait=null;}},250);})()", null);
    }

    /** Replaces the bookmarks: runs the same connector code inside the FC screen. */
    void connectorMenu() {
        show(fc);
        try (InputStream in = getAssets().open("fc-settings-panel.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
            fc.evaluateJavascript(out.toString("UTF-8") + "\nwindow.__satoSettingsPanel.open();", null);
        } catch (Exception e) { toast("Réglages indisponibles. Réessaie."); }
    }

    void loadNativeSettings(int remaining) {
        sato.evaluateJavascript("JSON.stringify(window.__satoSettingsSnapshot?.()||null)", raw -> {
            try {
                Object decoded = new org.json.JSONTokener(raw).nextValue();
                if (!(decoded instanceof String) || "null".equals(decoded)) {
                    if (remaining > 0) main.postDelayed(() -> loadNativeSettings(remaining - 1), 250);
                    else fc.evaluateJavascript("window.__satoSettingsPanel?.status('Ouvre le site SatoDCE et connecte ton compte pour charger les réglages.')", null);
                    return;
                }
                org.json.JSONObject data = new org.json.JSONObject((String) decoded);
                fc.evaluateJavascript("window.__satoSettingsPanel?.render(" + data.toString() + ")", null);
            } catch (Exception e) { toast("Chargement des réglages impossible."); }
        });
    }

    void marketOptions() {
        String[] labels = {"Achat : rechercher automatiquement le moins cher", "Vente : rechercher et préremplir au moins cher"};
        boolean[] checked = {
            getPreferences(MODE_PRIVATE).getBoolean("auto-album-cheapest", false),
            getPreferences(MODE_PRIVATE).getBoolean("auto-sale-cheapest", false)
        };
        new AlertDialog.Builder(this).setTitle("Automatismes du marché")
            .setMultiChoiceItems(labels, checked, (dialog, which, enabled) ->
                getPreferences(MODE_PRIVATE).edit().putBoolean(which == 0 ? "auto-album-cheapest" : "auto-sale-cheapest", enabled).apply())
            .setPositiveButton("Fermer", null).show();
    }

    void runConnector(String path) {
        if (!accountConnected) { show(sato); sato.evaluateJavascript("window.dispatchEvent(new Event('satodce-open-account'))", null); toast("Connecte-toi à SatoDCE avant d’importer."); return; }
        if (connectorRunning) return;
        if (fc.getUrl() == null || !fc.getUrl().contains("/ultimate-team/web-app")) {
            show(fc);
            toast("Ouvre et connecte d’abord la Web App FC, puis relance.");
            return;
        }
        show(fc);
        connectorRunning = true;
        toast("Connexion de SatoDCE à FC…");
        io.execute(() -> {
            try {
                String code = download(SITE + path + "?app=android");
                if (code.startsWith("javascript:")) code = code.substring("javascript:".length());
                if (code.contains("%3D") || code.contains("%7B")) code = URLDecoder.decode(code, "UTF-8");
                final String js = code;
                main.post(() -> { connectorRunning = false; reconnectStarted = true; fc.evaluateJavascript(js, null); });
            } catch (Exception e) {
                main.post(() -> { connectorRunning = false; toast("Connecteur indisponible : vérifie ta connexion internet."); });
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    WebView newWebView(boolean satoSide) {
        WebView w = new WebView(this);
        w.setFocusable(true);
        w.setFocusableInTouchMode(true);
        // Native tabs and popup WebViews can retain focus after a screen switch.
        // Restore it before WebView handles the tap and creates its input connection.
        w.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN && !view.hasFocus())
                view.requestFocus();
            return false;
        });
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
        else w.addJavascriptInterface(new FcBridge(), "SatoFcApp");
        w.setWebViewClient(new WebViewClient() {
            /** EA asks tablets in portrait to rotate; its Web App works fine in portrait, so the warning is hidden. */
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && (url.startsWith(FC_URL) || url.startsWith(SITE))) {
                    try (InputStream in = getAssets().open("price-controls.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        view.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception ignored) { }
                }
                if (url != null && url.contains("ea.com")) view.evaluateJavascript(ALLOW_PORTRAIT, null);
                if (!satoSide && url != null && url.startsWith(FC_URL)) {
                    try (InputStream in = getAssets().open("fc-scroll.js")) { view.evaluateJavascript(new String(in.readAllBytes(), StandardCharsets.UTF_8), null); } catch (Exception ignored) { }
                    try (InputStream in = getAssets().open("market-hints.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        view.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception ignored) { }
                    try (InputStream in = getAssets().open("fc-login-layout.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buffer = new byte[4096];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        view.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception ignored) { }
                }
                if (!satoSide && url != null && url.startsWith(FC_URL)) {
                    try (InputStream in = getAssets().open("fc-settings.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buffer = new byte[4096];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        view.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception ignored) { }
                }
                if (satoSide && url != null && Uri.parse(SITE).getHost().equals(Uri.parse(url).getHost())) {
                    if (accountPanelRequested) { accountPanelRequested = false; openAccountPanel(); }
                    try (InputStream in = getAssets().open("site-controls.js")) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        byte[] buffer = new byte[4096];
                        for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                        view.evaluateJavascript(out.toString("UTF-8"), null);
                    } catch (Exception ignored) { }
                    view.evaluateJavascript("(()=>{try{const d=JSON.parse(localStorage.getItem('satodce-v1'));if(d?.players?.length&&!d.isDemo)SatoApp.enableReconnect();}catch{}if(window.__satoNativeReturn)return;window.__satoNativeReturn=true;window.addEventListener('message',e=>{if(e.origin!=='https://www.ea.com'||e.source!==window.opener||e.data?.type!=='SATODCE_FC'||e.data.token!==new URLSearchParams(location.search).get('fc'))return;if(e.data.kind==='filled')SatoApp.showFc();if(e.data.kind==='connected'&&e.data.resume)setTimeout(()=>{const s=document.querySelector('#fc-status');if(s)s.textContent='FC reconnecté · Club enregistré conservé.';},0);});})()", null);
                }
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
            /** window.opener.focus() returns to the existing FC screen after placement. */
            @Override
            public void onRequestFocus(WebView view) {
                if (view == fc) show(fc);
            }

            /** The connector opens SatoDCE with window.open: it becomes the SatoDCE screen, linked to FC. */
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) {
                if (view != fc) return openExternally(result);
                boolean keepFcVisible = backgroundSync;
                backgroundSync = false;
                getPreferences(MODE_PRIVATE).edit().putBoolean("reconnect", true).apply();
                WebView popup = newWebView(true);
                content.removeView(sato);
                sato.destroy();
                sato = popup;
                content.addView(sato, 0);
                ((WebView.WebViewTransport) result.obj).setWebView(popup);
                result.sendToTarget();
                // Automatic reconnect must not replace the visible FC screen with
                // a newly created, still empty site WebView.
                if (keepFcVisible) show(fc);
                else show(sato);
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
    class FcBridge {
        @JavascriptInterface
        public boolean marketGridEnabled() { return getPreferences(MODE_PRIVATE).getBoolean("market-grid", false); }
        @JavascriptInterface
        public String nativePlatform() { return "android"; }
        @JavascriptInterface
        public boolean autoMarketCheapestEnabled() { return getPreferences(MODE_PRIVATE).getBoolean("auto-album-cheapest", false); }
        @JavascriptInterface
        public String marketView() { return getPreferences(MODE_PRIVATE).getString("market-view", marketGridEnabled() ? "grid" : "normal"); }

        @JavascriptInterface
        public void openSettings() { main.post(() -> connectorMenu()); }
        @JavascriptInterface
        public void loadSettings() { main.post(() -> loadNativeSettings(80)); }

        @JavascriptInterface
        public void saveSettings(String changes) {
            if (changes == null || changes.length() > 200000) return;
            main.post(() -> {
                try {
                    org.json.JSONObject data = new org.json.JSONObject(changes);
                    sato.evaluateJavascript("(()=>{try{window.__satoSettingsSave(" + data.toString() + ");return null;}catch(e){return e.message;}})()", error -> {
                        if (error != null && !"null".equals(error)) fc.evaluateJavascript("window.__satoSettingsPanel?.status(" + error + ")", null);
                    });
                } catch (Exception e) { toast("Réglages invalides."); }
            });
        }

        @JavascriptInterface
        public void checkUpdate() { main.post(() -> updater.check(true)); }


        @JavascriptInterface
        public boolean autoSalePriceEnabled() {
            return getPreferences(MODE_PRIVATE).getBoolean("auto-sale-cheapest", false);
        }
        @JavascriptInterface
        public boolean usePaidSalePriceEnabled() {
            return !autoSalePriceEnabled() && getPreferences(MODE_PRIVATE).getBoolean("use-paid-sale-price", false);
        }

        @JavascriptInterface
        public void marketProgress(String message) {
            if (message == null || message.length() > 1000) return;
            main.post(() -> sato.evaluateJavascript("window.dispatchEvent(new CustomEvent('satodce-market',{detail:{message:" + org.json.JSONObject.quote(message) + "}}))", null));
        }

        @JavascriptInterface
        public void marketResult(boolean success, String message) {
            main.post(() -> {
                albumMarketRunning = false;
                if (message == null || message.length() > 1000) return;
                sato.evaluateJavascript("window.dispatchEvent(new CustomEvent('satodce-market',{detail:{success:" + success + ",message:" + org.json.JSONObject.quote(message) + "}}))", null);
                if (!success) toast(message);
            });
        }

        @JavascriptInterface
        public void showFc() { main.post(() -> show(fc)); }
        @JavascriptInterface
        public void showSato() { main.post(() -> show(sato)); }
    }

    class SatoBridge {
        @JavascriptInterface
        public void copyText(String text) {
            if (text == null || text.length() > 5000) return;
            main.post(() -> {
                android.content.ClipboardManager clipboard = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(android.content.ClipData.newPlainText("SatoDCE", text));
                toast("Nom copié");
            });
        }

        @JavascriptInterface
        public void setMarketSettings(boolean album, boolean sale, boolean grid) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("auto-album-cheapest", album).putBoolean("auto-sale-cheapest", sale).putBoolean("market-grid", grid).apply();
        }
        @JavascriptInterface
        public void setAlbumPriceMargins(int below, int above) {
            if (below < 0 || above < 0 || below > 15000000 || above > 15000000) return;
            getPreferences(MODE_PRIVATE).edit().putInt("album-price-below", below).putInt("album-price-above", above).apply();
        }
        @JavascriptInterface
        public void setPriceSettings(boolean albumRange, boolean paidSale) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("album-price-range", albumRange && !getPreferences(MODE_PRIVATE).getBoolean("auto-album-cheapest", false)).putBoolean("use-paid-sale-price", paidSale && !getPreferences(MODE_PRIVATE).getBoolean("auto-sale-cheapest", false)).apply();
        }
        @JavascriptInterface
        public void setMarketView(String mode) {
            if ("normal".equals(mode) || "list".equals(mode) || "grid".equals(mode)) getPreferences(MODE_PRIVATE).edit().putString("market-view", mode).apply();
        }

        @JavascriptInterface
        public void settingsStatus(String message) {
            if (message == null || message.length() > 1000) return;
            main.post(() -> fc.evaluateJavascript("window.__satoSettingsPanel?.status(" + org.json.JSONObject.quote(message) + ")", null));
        }

        /** Album purchases do not depend on a popup, a token, or the collection connector. */
        @JavascriptInterface
        public void openAlbumMarket(String definitionId) {
            openAlbumMarketAtPrice(definitionId, "");
        }
        @JavascriptInterface
        public void openAlbumMarketAtPrice(String definitionId, String announcedPrice) {
            if (definitionId == null || !definitionId.matches("[1-9][0-9]{0,9}")) return;
            main.post(() -> {
                if (albumMarketRunning) { show(fc); return; }
                show(fc);
                if (fc.getUrl() == null || !fc.getUrl().startsWith(FC_URL)) { toast("Connecte-toi à FC puis réessaie depuis l’album."); return; }
                try (InputStream in = getAssets().open("album-market.js")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    for (int n; (n = in.read(buffer)) > 0;) out.write(buffer, 0, n);
                    albumMarketRunning = true;
                    boolean autoCheapest = getPreferences(MODE_PRIVATE).getBoolean("auto-album-cheapest", false);
                    String price = "null";
                    if (!autoCheapest && getPreferences(MODE_PRIVATE).getBoolean("album-price-range", false) && announcedPrice != null && announcedPrice.matches("[1-9][0-9]{0,7}")) {
                        long parsed = Long.parseLong(announcedPrice);
                        if (parsed <= 15000000) price = Long.toString(parsed);
                    }
                    String code = out.toString("UTF-8") + "\nPromise.resolve().then(()=>window.__satoOpenAlbumMarket(" + definitionId + "," + autoCheapest + "," + price + "," + getPreferences(MODE_PRIVATE).getInt("album-price-below", 300) + "," + getPreferences(MODE_PRIVATE).getInt("album-price-above", 300) + ")).then(r=>SatoFcApp.marketResult(true,r.message)).catch(e=>SatoFcApp.marketResult(false,e.message||'Marché FC indisponible.'));";
                    fc.evaluateJavascript(code, null);
                } catch (Exception e) { albumMarketRunning = false; toast("Recherche du marché indisponible. Réessaie."); }
            });
        }

        @JavascriptInterface
        public void setAccountConnected(boolean connected) {
            main.post(() -> {
                accountConnected = connected;
                if (!connected) {
                    reconnectStarted = false;
                }
            });
        }
        @JavascriptInterface
        public void setProfileEmail(String email) {
            if (email != null && email.length() <= 254 && android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches())
                profiles().edit().putString("email-" + profileSlot(), email).apply();
        }
        @JavascriptInterface
        public void enableReconnect() {
            getPreferences(MODE_PRIVATE).edit().putBoolean("reconnect", true).apply();
        }
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

    final Runnable checkUpdates = new Runnable() {
        @Override public void run() {
            if (isFinishing() || isDestroyed()) return;
            if (updater != null) updater.check(false);
            main.postDelayed(this, 15 * 60 * 1000);
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        // Android Recents can return directly to an existing profile task too.
        if (!isFinishing()) profiles().edit().putInt("active", profileSlot()).commit();
        foreground = true;
        main.removeCallbacks(reconnect);
        main.removeCallbacks(updateActions);
        main.postDelayed(reconnect, 2000);
        main.post(updateActions);
        main.removeCallbacks(checkUpdates);
        main.post(checkUpdates);
    }

    @Override
    protected void onPause() {
        foreground = false;
        CookieManager.getInstance().flush();
        main.removeCallbacks(reconnect);
        main.removeCallbacks(updateActions);
        main.removeCallbacks(checkUpdates);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacks(checkUpdates);
        main.removeCallbacks(reconnect);
        main.removeCallbacks(updateActions);
        io.shutdownNow();
        if (fc != null) { fc.stopLoading(); fc.destroy(); }
        if (sato != null) { sato.stopLoading(); sato.destroy(); }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (fc.getVisibility() == View.VISIBLE) {
            // FC is a single-page app: its own Back control does not always
            // create a WebView history entry.
            tapFcControl(".ut-navigation-button-control", () -> {
                if (fc.canGoBack()) fc.goBack();
                else show(sato);
            });
            return;
        }
        if (sato.canGoBack()) sato.goBack();
        else {
            // At the root, stay inside the app and return to its home screen.
            sato.evaluateJavascript("(()=>{const b=document.querySelector('[data-page=home]');if(b)b.click();})()", null);
        }
    }

    void tapFcControl(String selector, Runnable fallback) {
        fc.evaluateJavascript("(()=>{const b=document.querySelector('" + selector + "');if(!b||!b.getClientRects().length)return null;const r=b.getBoundingClientRect();return [(r.x+r.width/2)*devicePixelRatio,(r.y+r.height/2)*devicePixelRatio];})()", result -> {
            try {
                org.json.JSONArray point = new org.json.JSONArray(result);
                float x = (float) point.getDouble(0), y = (float) point.getDouble(1);
                long time = SystemClock.uptimeMillis();
                MotionEvent down = MotionEvent.obtain(time, time, MotionEvent.ACTION_DOWN, x, y, 0);
                MotionEvent up = MotionEvent.obtain(time, time + 80, MotionEvent.ACTION_UP, x, y, 0);
                fc.dispatchTouchEvent(down);
                fc.dispatchTouchEvent(up);
                down.recycle(); up.recycle();
            } catch (Exception e) { fallback.run(); }
        });
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
