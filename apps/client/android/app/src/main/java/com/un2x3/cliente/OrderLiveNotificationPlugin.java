package com.un2x3.cliente;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin de Capacitor para gestionar la notificación persistente en vivo (Ongoing Notification)
 * con barra de progreso de 4 pasos y sincronizar el Home Screen Widget de Un 2x3.
 */
@CapacitorPlugin(name = "OrderLiveNotification")
public class OrderLiveNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "un2x3_live_orders";
    private static final String CHANNEL_NAME = "Pedidos y Entregas en Vivo";
    private static final int LIVE_NOTIFICATION_ID = 2001;
    private static final String PREFS_NAME = "Un2x3OrderPrefs";

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
    }

    /**
     * Inicia o actualiza la notificación persistente de progreso y el widget de escritorio.
     * Recibe: orderId, restaurantName, statusText, step (1 a 4), etaText, driverName.
     */
    @PluginMethod
    public void startOrUpdateOrder(PluginCall call) {
        String orderId = call.getString("orderId", "");
        String restaurantName = call.getString("restaurantName", "Un 2x3 Pedido");
        String statusText = call.getString("statusText", "Procesando pedido...");
        int step = call.getInt("step", 1);
        if (step < 1) step = 1;
        if (step > 4) step = 4;
        String etaText = call.getString("etaText", "");
        String driverName = call.getString("driverName", "");

        Context context = getContext();
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        // 1. Guardar en SharedPreferences para el widget y persistencia
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("has_active_order", true);
        editor.putString("order_id", orderId);
        editor.putString("restaurant_name", restaurantName);
        editor.putString("status_text", statusText);
        editor.putInt("step", step);
        editor.putString("eta_text", etaText);
        editor.putString("driver_name", driverName);
        editor.putLong("updated_at", System.currentTimeMillis());
        editor.apply();

        // 2. Construir PendingIntent hacia MainActivity al tocar la notificación
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("orderId", orderId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // Subtítulo con formato de paso y conductor si está asignado
        String contentInfo = "Paso " + step + " de 4";
        if (driverName != null && !driverName.trim().isEmpty()) {
            contentInfo += " • Repartidor: " + driverName;
        }

        // Obtener icono de la aplicación
        int smallIcon = context.getApplicationInfo().icon;
        if (smallIcon == 0) {
            smallIcon = android.R.drawable.ic_dialog_info;
        }

        // 3. Crear notificación Ongoing con barra de progreso horizontal
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIcon)
            .setContentTitle(restaurantName)
            .setContentText(statusText)
            .setSubText(etaText != null && !etaText.trim().isEmpty() ? etaText : "Un 2x3")
            .setContentInfo(contentInfo)
            .setProgress(4, step, false)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setColor(0xFFFFD100) // Amarillo corporativo Un 2x3
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (notificationManager != null) {
            notificationManager.notify(LIVE_NOTIFICATION_ID, builder.build());
        }

        // 4. Notificar al Widget mediante broadcast y llamada directa
        broadcastWidgetUpdate(context);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("orderId", orderId);
        result.put("step", step);
        call.resolve(result);
    }

    /**
     * Finaliza y cancela la notificación persistente y regresa el widget al estado de reposo.
     */
    @PluginMethod
    public void stopOrder(PluginCall call) {
        Context context = getContext();
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        // Cancelar notificación de la barra de estado
        if (notificationManager != null) {
            notificationManager.cancel(LIVE_NOTIFICATION_ID);
        }

        // Marcar en SharedPreferences que no hay orden activa
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("has_active_order", false);
        editor.remove("order_id");
        editor.remove("restaurant_name");
        editor.remove("status_text");
        editor.remove("step");
        editor.remove("eta_text");
        editor.remove("driver_name");
        editor.apply();

        // Actualizar el widget a estado reposo
        broadcastWidgetUpdate(context);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Envía el broadcast de actualización al AppWidgetProvider del sistema.
     */
    private void broadcastWidgetUpdate(Context context) {
        try {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName widgetComponent = new ComponentName(context, OrderTrackerWidget.class);
            int[] widgetIds = appWidgetManager.getAppWidgetIds(widgetComponent);

            Intent updateIntent = new Intent(context, OrderTrackerWidget.class);
            updateIntent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            updateIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds);
            context.sendBroadcast(updateIntent);

            // Actualización directa en memoria para respuesta inmediata
            OrderTrackerWidget.updateAllWidgets(context);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Crea el canal de notificación prioritario de baja intrusión sonora para evitar timbres continuos.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW
                );
                channel.setDescription("Notificación persistente de seguimiento de orden con barra de progreso");
                channel.setShowBadge(true);
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
