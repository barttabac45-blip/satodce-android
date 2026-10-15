package fr.satodce.app;

import android.app.Application;
import android.os.Build;
import android.webkit.WebView;

/** A separate WebView store holds both FC and SatoDCE for each local profile. */
public class SatoApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 28) {
            String process = Application.getProcessName();
            int separator = process.indexOf(':');
            if (separator >= 0) WebView.setDataDirectorySuffix(process.substring(separator + 1));
        }
    }
}
