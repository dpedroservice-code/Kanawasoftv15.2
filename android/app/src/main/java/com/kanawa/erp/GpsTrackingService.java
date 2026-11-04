package com.kanawa.erp;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class GpsTrackingService extends Service implements LocationListener {
    static final String ACTION_STOP = "com.kanawa.erp.STOP_GPS";
    private static final String CHANNEL_ID = "kanawa_gps_tracking";
    private static final int NOTIFICATION_ID = 1541;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private LocationManager locationManager;
    private JSONObject config;
    private String lastMessage = "A aguardar posição GPS";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAndSync(startId);
            return START_NOT_STICKY;
        }
        try {
            String saved = SecureStore.loadSession(this);
            if (saved == null) throw new IllegalStateException("Sessão GPS segura não encontrada.");
            config = new JSONObject(saved);
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                stopSelf(startId);
                return START_NOT_STICKY;
            }
            startForegroundCompat();
            startLocationUpdates();
            SecureStore.setActive(this, true);
        } catch (Exception error) {
            lastMessage = "GPS não iniciado: " + error.getMessage();
            stopForeground(true);
            stopSelf(startId);
            SecureStore.setActive(this, false);
        }
        return START_STICKY;
    }

    private void startForegroundCompat() {
        Notification notification = buildNotification("GPS ativo · " + lastMessage);
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startLocationUpdates() throws SecurityException {
        if (locationManager == null) throw new IllegalStateException("Serviço de localização indisponível.");
        if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            lastMessage = "Ative a localização/GPS do Android";
            updateNotification();
        }
        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 20f, this, Looper.getMainLooper());
        if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 30000L, 50f, this, Looper.getMainLooper());
        }
        Location last = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
        if (last != null) onLocationChanged(last);
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null || config == null) return;
        try {
            JSONObject point = new JSONObject();
            point.put("lat", location.getLatitude());
            point.put("lng", location.getLongitude());
            point.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            point.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            point.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            point.put("timestamp", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                    .format(new java.util.Date(location.getTime())));

            JSONArray trail = config.optJSONArray("trail");
            if (trail == null) trail = new JSONArray();
            trail.put(new JSONObject().put("lat", point.getDouble("lat"))
                    .put("lng", point.getDouble("lng"))
                    .put("accuracy", point.opt("accuracy"))
                    .put("timestamp", point.getString("timestamp")));
            while (trail.length() > 100) {
                JSONArray trimmed = new JSONArray();
                for (int i = 1; i < trail.length(); i++) trimmed.put(trail.get(i));
                trail = trimmed;
            }
            config.put("trail", trail);
            config.put("lastPoint", point);
            SecureStore.saveSession(this, config.toString());
            lastMessage = "Última posição " + point.getString("timestamp");
            updateNotification();
            final JSONObject snapshot = new JSONObject(config.toString());
            final JSONObject position = new JSONObject(point.toString());
            network.execute(() -> uploadPosition(snapshot, position, "active"));
        } catch (Exception error) {
            lastMessage = "Erro ao preparar posição: " + error.getMessage();
            updateNotification();
        }
    }

    private void uploadPosition(JSONObject session, JSONObject point, String status) {
        try {
            JSONObject payload = new JSONObject();
            String recordId = session.getString("recordId");
            payload.put("id", recordId.matches("\\d+") ? Long.parseLong(recordId) : recordId);
            payload.put("trackingKey", session.getString("deviceKey"));
            payload.put("deviceLabel", session.optString("deviceLabel", "Dispositivo Android"));
            payload.put("veiculo", session.optString("vehicleLabel", "Dispositivo móvel"));
            payload.put("lat", point.optDouble("lat"));
            payload.put("lng", point.optDouble("lng"));
            payload.put("coordinates_valid", true);
            payload.put("location_source", "gps");
            payload.put("tracking_mode", "android-foreground-service");
            payload.put("status", status);
            payload.put("accuracy", point.opt("accuracy"));
            payload.put("speed", point.opt("speed"));
            payload.put("heading", point.opt("heading"));
            payload.put("ultimaAtualizacao", point.optString("timestamp", java.time.Instant.now().toString()));
            payload.put("trail", session.optJSONArray("trail") == null ? new JSONArray() : session.optJSONArray("trail"));

            JSONObject row = new JSONObject();
            row.put("company_id", session.getString("companyId"));
            row.put("store_key", "gpsTracking");
            row.put("record_id", recordId);
            row.put("payload", payload);

            int response = sendUpsert(session, row);
            if (response == 401) {
                JSONObject refreshed = refreshSession(session);
                if (refreshed != null) {
                    SecureStore.saveSession(this, refreshed.toString());
                    response = sendUpsert(refreshed, row);
                }
            }
            if (response >= 200 && response < 300) {
                lastMessage = status.equals("active") ? "GPS ativo · sincronizado" : "GPS parado · sincronizado";
                updateNotification();
            } else {
                lastMessage = "GPS recolhido; sincronização pendente (HTTP " + response + ")";
                updateNotification();
            }
        } catch (Exception error) {
            lastMessage = "GPS recolhido; sem sincronização: " + error.getMessage();
            updateNotification();
        }
    }

    private int sendUpsert(JSONObject session, JSONObject row) throws Exception {
        String endpoint = session.getString("supabaseUrl") +
                "/rest/v1/ks_records?on_conflict=company_id%2Cstore_key%2Crecord_id";
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);
            connection.setRequestProperty("apikey", session.getString("publishableKey"));
            connection.setRequestProperty("Authorization", "Bearer " + session.getString("accessToken"));
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal");
            byte[] body = row.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
            int code = connection.getResponseCode();
            if (code >= 400) lastMessage = "Servidor recusou GPS (HTTP " + code + ")";
            return code;
        } finally { connection.disconnect(); }
    }

    private JSONObject refreshSession(JSONObject oldSession) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(oldSession.getString("supabaseUrl") + "/auth/v1/token?grant_type=refresh_token");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);
            connection.setRequestProperty("apikey", oldSession.getString("publishableKey"));
            connection.setRequestProperty("Content-Type", "application/json");
            JSONObject body = new JSONObject().put("refresh_token", oldSession.getString("refreshToken"));
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return null;
            String response = readResponse(connection.getInputStream());
            JSONObject token = new JSONObject(response);
            JSONObject updated = new JSONObject(oldSession.toString());
            updated.put("accessToken", token.getString("access_token"));
            updated.put("refreshToken", token.getString("refresh_token"));
            return updated;
        } catch (Exception error) {
            lastMessage = "Sessão GPS expirou; volte a abrir o Kanawa e inicie o GPS.";
            updateNotification();
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readResponse(InputStream stream) throws Exception {
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private void stopAndSync(int startId) {
        try { if (locationManager != null) locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
        SecureStore.setActive(this, false);
        if (config == null) {
            try {
                String saved = SecureStore.loadSession(this);
                if (saved != null) config = new JSONObject(saved);
            } catch (Exception ignored) {}
        }
        if (config == null || !config.has("lastPoint")) {
            stopForeground(true);
            stopSelf(startId);
            return;
        }
        try {
            JSONObject point = config.getJSONObject("lastPoint");
            JSONObject snapshot = new JSONObject(config.toString());
            network.execute(() -> {
                uploadPosition(snapshot, point, "stopped");
                stopForeground(true);
                stopSelf(startId);
            });
        } catch (Exception error) {
            stopForeground(true);
            stopSelf(startId);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Rastreamento GPS Kanawa",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Notificação persistente enquanto a localização da frota está ativa.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 1541, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return builder.setContentTitle("Kanawa Soft · GPS da frota")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pending)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(lastMessage));
    }

    @Override
    public void onDestroy() {
        try { if (locationManager != null) locationManager.removeUpdates(this); } catch (SecurityException ignored) {}
        network.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
