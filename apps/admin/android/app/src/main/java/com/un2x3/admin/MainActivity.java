package com.un2x3.admin;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createHighPriorityNotificationChannels();
    }

    private void createHighPriorityNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                NotificationChannel adminChannel = new NotificationChannel(
                    "un_2x3_high_priority",
                    "Alertas y Pedidos Un 2x3",
                    NotificationManager.IMPORTANCE_HIGH
                );
                adminChannel.setDescription("Notificaciones prioritarias del panel administrativo");
                adminChannel.enableVibration(true);
                adminChannel.setVibrationPattern(new long[]{0, 250, 100, 250});
                adminChannel.setShowBadge(true);
                adminChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(adminChannel);
            }
        }
    }
}
