package fr.satodce.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;

/**
 * Updates the app from its GitHub releases: the latest release tag (v1.2.0) is
 * compared with the installed version, its APK is downloaded and installed over
 * the current one (same signing key), after the user confirms.
 */
class Updater {
    static final int PERMISSION_REQUEST = 42;
    static final String ACTION_STATUS = "fr.satodce.app.INSTALL_STATUS";
    final Activity activity;
    final Handler main = new Handler(Looper.getMainLooper());
    volatile boolean checking;
    String pendingUrl, pendingVersion;

    Updater(Activity activity) {
        this.activity = activity;
    }

    /** Check on every launch, including when the previous check failed. */
    void check(boolean manual) {
        if (checking) return;
        checking = true;
        if (manual) toast("Recherche d’une mise à jour…");
        java.util.concurrent.ExecutorService worker = Executors.newSingleThreadExecutor();
        worker.execute(() -> {
            try {
                JSONObject release = new JSONObject(MainActivity.download("https://api.github.com/repos/" + BuildConfig.GITHUB_REPO + "/releases/latest"));
                String version = release.getString("tag_name").replaceFirst("^v", "");
                String apk = null;
                JSONArray assets = release.getJSONArray("assets");
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if (asset.getString("name").endsWith(".apk")) apk = asset.getString("browser_download_url");
                }
                final String url = apk;
                if (url != null && newer(version, BuildConfig.VERSION_NAME)) main.post(() -> offer(version, url, release.optString("body", "")));
                else if (manual) main.post(() -> toast("SatoDCE est à jour (version " + BuildConfig.VERSION_NAME + ")."));
            } catch (Exception e) {
                if (manual) main.post(() -> toast("Impossible de vérifier les mises à jour pour le moment."));
            } finally {
                checking = false;
                worker.shutdown();
            }
        });
    }

    static boolean newer(String candidate, String current) {
        String[] a = candidate.split("\\."), b = current.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int x = i < a.length ? parse(a[i]) : 0, y = i < b.length ? parse(b[i]) : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    static int parse(String part) {
        try { return Integer.parseInt(part.replaceAll("\\D.*", "")); } catch (Exception e) { return 0; }
    }

    void offer(String version, String url, String notes) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        String message = "La version " + version + " est disponible (installée : " + BuildConfig.VERSION_NAME + ").";
        if (!notes.isEmpty()) message += "\n\n" + (notes.length() > 600 ? notes.substring(0, 600) + "…" : notes);
        new AlertDialog.Builder(activity)
            .setTitle("Mise à jour de SatoDCE")
            .setMessage(message)
            .setPositiveButton("Mettre à jour", (d, w) -> { pendingUrl = url; pendingVersion = version; install(); })
            .setNegativeButton("Plus tard", null)
            .show();
    }

    /** Android asks once for permission to install apps from SatoDCE. */
    void install() {
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            toast("Autorise SatoDCE à installer ses mises à jour, puis reviens.");
            activity.startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())), PERMISSION_REQUEST);
            return;
        }
        toast("Téléchargement de la version " + pendingVersion + "…");
        String url = pendingUrl;
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                int id = installer.createSession(params);
                try (PackageInstaller.Session session = installer.openSession(id)) {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setInstanceFollowRedirects(true);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "SatoDCE-Android/" + BuildConfig.VERSION_NAME);
                    try (InputStream in = c.getInputStream(); OutputStream out = session.openWrite("SatoDCE.apk", 0, -1)) {
                        byte[] buffer = new byte[65536];
                        for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
                        session.fsync(out);
                    }
                    Intent status = new Intent(ACTION_STATUS).setPackage(activity.getPackageName());
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                    main.post(this::listen);
                    session.commit(PendingIntent.getBroadcast(activity, id, status, flags).getIntentSender());
                }
            } catch (Exception e) {
                main.post(() -> toast("Mise à jour impossible : " + e.getMessage()));
            }
        });
    }

    /** Called when the user comes back from the "install unknown apps" settings. */
    void resume() {
        if (pendingUrl == null) return;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            toast("Autorisation refusée : mise à jour annulée.");
            return;
        }
        install();
    }

    boolean listening;

    void listen() {
        if (listening) return;
        listening = true;
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                    if (confirm != null) activity.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } else if (status != PackageInstaller.STATUS_SUCCESS) {
                    toast("Installation annulée ou impossible.");
                }
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_STATUS);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    void toast(String text) { Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }
}
