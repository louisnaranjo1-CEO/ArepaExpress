package com.un2x3.negocio;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private static final int RECORD_AUDIO_REQUEST_CODE = 1002;
    private PermissionRequest pendingAudioPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationHelperPlugin.class);
        super.onCreate(savedInstanceState);
        setupWebRTCAndAudioSettings();
        createHighPriorityNotificationChannels();
    }

    /**
     * Configura el WebView de Capacitor para WebRTC:
     * Habilita reproducción de audio automática y gestiona permisos de micrófono nativos.
     */
    private void setupWebRTCAndAudioSettings() {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            WebSettings settings = webView.getSettings();

            // Evita bloqueos de audio en llamadas entrantes
            settings.setMediaPlaybackRequiresUserGesture(false);

            webView.setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    boolean requiresAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            requiresAudio = true;
                            break;
                        }
                    }

                    if (requiresAudio) {
                        if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            runOnUiThread(() -> {
                                try {
                                    request.grant(request.getResources());
                                } catch (Exception e) {
                                    e.printStackTrace();
                                }
                            });
                        } else {
                            pendingAudioPermissionRequest = request;
                            ActivityCompat.requestPermissions(
                                MainActivity.this,
                                new String[]{Manifest.permission.RECORD_AUDIO},
                                RECORD_AUDIO_REQUEST_CODE
                            );
                        }
                    } else {
                        super.onPermissionRequest(request);
                    }
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == RECORD_AUDIO_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (pendingAudioPermissionRequest != null) {
                    runOnUiThread(() -> {
                        try {
                            pendingAudioPermissionRequest.grant(pendingAudioPermissionRequest.getResources());
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                        pendingAudioPermissionRequest = null;
                    });
                }
            } else {
                if (pendingAudioPermissionRequest != null) {
                    runOnUiThread(() -> {
                        try {
                            pendingAudioPermissionRequest.deny();
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                        pendingAudioPermissionRequest = null;
                    });
                }
            }
        }
    }

    private void createHighPriorityNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                NotificationChannel orderChannel = new NotificationChannel(
                    "un_2x3_high_priority",
                    "Alertas y Pedidos Un 2x3",
                    NotificationManager.IMPORTANCE_HIGH
                );
                orderChannel.setDescription("Notificaciones prioritarias de nuevos pedidos y reservas");
                orderChannel.enableVibration(true);
                orderChannel.setVibrationPattern(new long[]{0, 300, 150, 300});
                orderChannel.setShowBadge(true);
                orderChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(orderChannel);
            }
        }
    }
}
