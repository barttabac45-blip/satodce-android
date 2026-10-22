package fr.satodce.app;

import android.app.Application;
import android.os.Build;
import android.webkit.WebView;

import java.io.File;

/** A separate WebView store holds both FC and SatoDCE for each local profile. */
public class SatoApplication extends Application {
    /** Set by "Supprimer un compte": that profile's data is erased when its process next starts. */
    static final String WIPE = "wipe-";
    static final String[] ACTIVITY_PREFERENCES = {"MainActivity", "ProfileOneActivity", "ProfileTwoActivity", "ProfileThreeActivity"};

    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 28) {
            String process = Application.getProcessName();
            int separator = process.indexOf(':');
            String suffix = separator >= 0 ? process.substring(separator + 1) : null;
            if (suffix != null) WebView.setDataDirectorySuffix(suffix);
            int slot = suffix == null ? 0 : suffix.startsWith("profile") ? Integer.parseInt(suffix.substring(7)) : -1;
            if (slot >= 0) wipeIfDeleted(slot, suffix);
        }
    }

    @SuppressWarnings("deprecation")
    void wipeIfDeleted(int slot, String suffix) {
        android.content.SharedPreferences profiles = getSharedPreferences("local-profiles", MODE_PRIVATE | MODE_MULTI_PROCESS);
        if (!profiles.getBoolean(WIPE + slot, false)) return;
        // No WebView exists yet in this process, so its directories are not in use.
        String name = suffix == null ? "webview" : "webview_" + suffix;
        delete(getDir(name, MODE_PRIVATE));
        delete(new File(getCacheDir(), suffix == null ? "WebView" : "WebView/" + suffix));
        deleteSharedPreferences(ACTIVITY_PREFERENCES[slot]);
        profiles.edit().remove(WIPE + slot).commit();
    }

    static void delete(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        file.delete();
    }
}
