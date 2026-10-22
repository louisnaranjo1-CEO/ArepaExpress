package com.un2x3.cliente;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/**
 * AppWidgetProvider para el Home Screen Widget de Un 2x3.
 * Muestra el seguimiento en vivo de pedidos y entregas con barra de 4 pasos.
 */
public class OrderTrackerWidget extends AppWidgetProvider {

    private static final String PREFS_NAME = "Un2x3OrderPrefs";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        // Si recibimos un broadcast de actualización, refrescar todos los widgets instalados
        if (AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(intent.getAction())) {
            updateAllWidgets(context);
        }
    }

    /**
     * Actualiza todas las instancias instaladas del widget en la pantalla de inicio.
     */
    public static void updateAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        ComponentName thisWidget = new ComponentName(context, OrderTrackerWidget.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
        if (appWidgetIds != null && appWidgetIds.length > 0) {
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    /**
     * Renderiza la vista RemoteViews para una instancia específica del widget.
     */
    public static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean hasActiveOrder = prefs.getBoolean("has_active_order", false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_tracker);

        // Click en cualquier parte del widget abre la aplicación principal
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        if (hasActiveOrder) {
            String restaurant = prefs.getString("restaurant_name", "Un 2x3 Pedido");
            String status = prefs.getString("status_text", "En proceso");
            int step = prefs.getInt("step", 1);
            if (step < 1) step = 1;
            if (step > 4) step = 4;
            String eta = prefs.getString("eta_text", "");
            String driver = prefs.getString("driver_name", "");

            views.setViewVisibility(R.id.layout_active_order, View.VISIBLE);
            views.setViewVisibility(R.id.layout_idle_order, View.GONE);

            views.setTextViewText(R.id.tv_widget_restaurant, restaurant);
            views.setTextViewText(R.id.tv_widget_status, status);
            views.setTextViewText(
                R.id.tv_widget_eta,
                (eta != null && !eta.trim().isEmpty()) ? "⏱ " + eta : "⏱ En curso"
            );

            // Barra de progreso de 4 pasos
            views.setProgressBar(R.id.progress_widget_steps, 4, step, false);

            // Resaltar en color dorado #FFD100 los pasos completados
            int activeColor = 0xFFFFD100;
            int inactiveColor = 0xFF94A3B8;
            views.setTextColor(R.id.tv_step_1, step >= 1 ? activeColor : inactiveColor);
            views.setTextColor(R.id.tv_step_2, step >= 2 ? activeColor : inactiveColor);
            views.setTextColor(R.id.tv_step_3, step >= 3 ? activeColor : inactiveColor);
            views.setTextColor(R.id.tv_step_4, step >= 4 ? activeColor : inactiveColor);

            // Conductor / Repartidor
            if (driver != null && !driver.trim().isEmpty()) {
                views.setViewVisibility(R.id.tv_widget_driver, View.VISIBLE);
                views.setTextViewText(R.id.tv_widget_driver, "🛵 Repartidor: " + driver);
            } else {
                views.setViewVisibility(R.id.tv_widget_driver, View.GONE);
            }
        } else {
            views.setViewVisibility(R.id.layout_active_order, View.GONE);
            views.setViewVisibility(R.id.layout_idle_order, View.VISIBLE);
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
