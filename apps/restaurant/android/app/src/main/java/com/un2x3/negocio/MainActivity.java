package com.un2x3.negocio;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocationHelperPlugin.class);
        super.onCreate(savedInstanceState);
        createHighPriorityNotificationChannels();
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
