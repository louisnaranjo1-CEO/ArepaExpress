package deliexpress.app;

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
                // High Priority Channel for Client & Store (Orders & Chat)
                NotificationChannel orderChannel = new NotificationChannel(
                    "un_2x3_high_priority",
                    "Alertas y Pedidos Un 2x3",
                    NotificationManager.IMPORTANCE_HIGH
                );
                orderChannel.setDescription("Notificaciones prioritarias de compras, chats y estados de orden");
                orderChannel.enableVibration(true);
                orderChannel.setVibrationPattern(new long[]{0, 250, 100, 250});
                orderChannel.setShowBadge(true);
                orderChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(orderChannel);

                // Maximum Priority Channel for Drivers (Dispatch Radar & Trip Requests)
                NotificationChannel driverChannel = new NotificationChannel(
                    "driver_dispatch_channel",
                    "Despachos y Radares de Conductores",
                    NotificationManager.IMPORTANCE_HIGH
                );
                driverChannel.setDescription("Alertas urgentes de viajes y entregas para conductores");
                driverChannel.enableVibration(true);
                driverChannel.setVibrationPattern(new long[]{0, 500, 200, 500});
                driverChannel.setShowBadge(true);
                driverChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(driverChannel);
            }
        }
    }
}
