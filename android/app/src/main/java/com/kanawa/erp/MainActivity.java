package com.kanawa.erp;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.util.Collections;

public final class MainActivity extends Activity {
    private static final int REQUEST_LOCATION = 4101;
    private WebView webView;
    private boolean pendingStart = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);

        final String allowedHost = Uri.parse(BuildConfig.WEB_APP_URL).getHost();
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && allowedHost != null && allowedHost.equalsIgnoreCase(uri.getHost())
                        && "https".equalsIgnoreCase(uri.getScheme())) return false;
                if (uri != null && ("https".equalsIgnoreCase(uri.getScheme()) ||
                        "mailto".equalsIgnoreCase(uri.getScheme()) || "tel".equalsIgnoreCase(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installBridgeScript();
            }
        });

        installSecureWebMessageBridge(allowedHost);
        webView.loadUrl(BuildConfig.WEB_APP_URL);
    }

    private void installSecureWebMessageBridge(String host) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Toast.makeText(this, "WebView Android sem suporte ao canal seguro de integração.", Toast.LENGTH_LONG).show();
            return;
        }
        final String origin = "https://" + host;
        WebViewCompat.addWebMessageListener(webView, "KanawaNative",
                Collections.singleton(origin),
                (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                    if (!isMainFrame || sourceOrigin == null || !"https".equalsIgnoreCase(sourceOrigin.getScheme()) ||
                            !host.equalsIgnoreCase(sourceOrigin.getHost())) return;
                    String requestId = "";
                    try {
                        JSONObject request = new JSONObject(message.getData());
                        requestId = request.optString("id", "");
                        String action = request.optString("action", "");
                        String result;
                        if ("start".equals(action)) {
                            result = startTracking(request.optJSONObject("payload"));
                        } else if ("stop".equals(action)) {
                            result = stopTracking();
                        } else if ("status".equals(action)) {
                            result = status();
                        } else {
                            result = new JSONObject().put("accepted", false).put("message", "Ação nativa desconhecida.").toString();
                        }
                        replyProxy.postMessage(new JSONObject().put("id", requestId).put("result", result).toString());
                    } catch (Exception error) {
                        try {
                            replyProxy.postMessage(new JSONObject().put("id", requestId)
                                    .put("result", new JSONObject().put("accepted", false)
                                            .put("message", "Falha na ponte Android: " + error.getMessage()).toString()).toString());
                        } catch (Exception ignored) {}
                    }
                });
    }

    private void installBridgeScript() {
        String script = "(function(){if(window.KanawaAndroid||!window.KanawaNative)return;" +
                "var seq=0,pending={};" +
                "function call(action,payload){return new Promise(function(resolve,reject){" +
                "var id=String(++seq),timer=setTimeout(function(){delete pending[id];reject(new Error('Tempo esgotado na comunicação Android.'));},12000);" +
                "pending[id]={resolve:resolve,reject:reject,timer:timer};" +
                "window.KanawaNative.postMessage(JSON.stringify({id:id,action:action,payload:payload||{}}));" +
                "});}" +
                "window.KanawaNative.addEventListener('message',function(event){try{var d=JSON.parse(event.data),p=pending[d.id];if(!p)return;" +
                "clearTimeout(p.timer);delete pending[d.id];p.resolve(JSON.parse(d.result));}catch(error){}});" +
                "window.KanawaAndroid={native:true,startTracking:function(config){return call('start',config);}," +
                "stopTracking:function(){return call('stop',{});},getStatus:function(){return call('status',{});}};" +
                "})();";
        webView.evaluateJavascript(script, null);
    }

    private String startTracking(JSONObject config) {
        try {
            if (config == null) throw new IllegalArgumentException("Configuração de rastreamento vazia.");
            String url = config.optString("supabaseUrl", "");
            if (!"https://jiehrswweoyesbabrpjf.supabase.co".equals(url)) {
                throw new IllegalArgumentException("Projeto de sincronização não autorizado.");
            }
            if (config.optString("accessToken", "").isEmpty() ||
                    config.optString("refreshToken", "").isEmpty() ||
                    config.optString("companyId", "").isEmpty() ||
                    config.optString("recordId", "").isEmpty()) {
                throw new IllegalArgumentException("Sessão, empresa ou dispositivo incompleto.");
            }
            SecureStore.saveSession(this, config.toString());
            pendingStart = true;
            runOnUiThread(this::ensureLocationPermissionAndStart);
            return new JSONObject().put("accepted", true).put("status", "permission_flow").toString();
        } catch (Exception error) {
            try { return new JSONObject().put("accepted", false).put("message", error.getMessage()).toString(); }
            catch (Exception ignored) { return "{\"accepted\":false}"; }
        }
    }

    private void ensureLocationPermissionAndStart() {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.POST_NOTIFICATIONS}, REQUEST_LOCATION);
            } else {
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION}, REQUEST_LOCATION);
            }
            return;
        }
        startLocationService();
    }

    private void startLocationService() {
        if (!pendingStart) return;
        pendingStart = false;
        Intent intent = new Intent(this, GpsTrackingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent);
        else startService(intent);
        Toast.makeText(this, "Rastreamento GPS Android iniciado.", Toast.LENGTH_SHORT).show();
    }

    private String stopTracking() {
        runOnUiThread(() -> {
            Intent intent = new Intent(this, GpsTrackingService.class);
            intent.setAction(GpsTrackingService.ACTION_STOP);
            startService(intent);
            pendingStart = false;
        });
        try { return new JSONObject().put("accepted", true).put("status", "stopping").toString(); }
        catch (Exception ignored) { return "{\"accepted\":true}"; }
    }

    private String status() {
        try {
            return new JSONObject().put("accepted", true)
                    .put("native", true).put("active", SecureStore.isActive(this))
                    .put("webAppUrl", BuildConfig.WEB_APP_URL).toString();
        } catch (Exception ignored) { return "{\"accepted\":true,\"native\":true}"; }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (fine) startLocationService();
            else {
                pendingStart = false;
                Toast.makeText(this, "Autorize localização precisa para iniciar o GPS.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
