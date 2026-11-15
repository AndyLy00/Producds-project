package io.github.andyly00.korzina;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.getWebView().addJavascriptInterface(new AppWindow(), "AppWindow");
    }

    /**
     * Lets the web app recolor the window behind the system bars when its own light/dark theme
     * changes. On devices whose WebView is not drawn edge to edge that area shows the window
     * background rather than the page. Called from src/native/main.tsx.
     */
    private class AppWindow {

        @JavascriptInterface
        public void setBackground(String color) {
            final int parsed;
            try {
                parsed = Color.parseColor(color);
            } catch (IllegalArgumentException e) {
                return;
            }
            runOnUiThread(() -> getWindow().getDecorView().setBackgroundColor(parsed));
        }
    }
}
