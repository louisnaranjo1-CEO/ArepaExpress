package com.arepaexpress.admin;

import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.app.NotificationManager;
import android.app.PendingIntent;
import androidx.core.app.NotificationCompat;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationHelper")
public class LocationHelperPlugin extends Plugin {

    private static PowerManager.WakeLock wakeLock = null;

    @PluginMethod
    public void isLocationEnabled(PluginCall call) {
        Context context = getContext();
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        boolean isGpsEnabled = false;
        boolean isNetworkEnabled = false;
        try {
            isGpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception ignored) {}
        try {
            isNetworkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}

        JSObject ret = new JSObject();
        ret.put("enabled", isGpsEnabled || isNetworkEnabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void enableLocation(PluginCall call) {
        Context context = getContext();
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        boolean isGpsEnabled = false;
        boolean isNetworkEnabled = false;
        try {
            isGpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
        } catch (Exception ignored) {}
        try {
            isNetworkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}

        if (isGpsEnabled || isNetworkEnabled) {
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
            return;
        }

        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivityForResult(call, intent, "locationSettingsResult");
        } catch (Exception ex) {
            openSettings(call);
        }
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                getContext().startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception ex) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception e2) {
                call.reject("Cannot open location settings", e2);
            }
        }
    }

    @ActivityCallback
    private void locationSettingsResult(PluginCall call, ActivityResult result) {
        Context context = getContext();
        LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        boolean enabled = false;
        try {
            enabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception ignored) {}
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        try {
            Context context = getContext();
            String packageName = context.getPackageName();
            boolean isIgnoring = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    isIgnoring = pm.isIgnoringBatteryOptimizations(packageName);
                    if (!isIgnoring) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + packageName));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(intent);
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("requested", true);
            ret.put("ignoring", isIgnoring);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Error requesting battery optimization exemption", ex);
        }
    }

    @PluginMethod
    public void acquireWakeLock(PluginCall call) {
        try {
            Context context = getContext();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                if (wakeLock == null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ArepaExpress:DriverWakeLock");
                }
                if (!wakeLock.isHeld()) {
                    wakeLock.acquire(2 * 60 * 60 * 1000L); // Max 2 hours continuous lock per renewal
                }
            }
            JSObject ret = new JSObject();
            ret.put("acquired", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Error acquiring wake lock", ex);
        }
    }

    @PluginMethod
    public void releaseWakeLock(PluginCall call) {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            JSObject ret = new JSObject();
            ret.put("released", true);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Error releasing wake lock", ex);
        }
    }

    @PluginMethod
    public void postNotification(PluginCall call) {
        try {
            Context context = getContext();
            String title = call.getString("title", "Alerta Un 2x3");
            String body = call.getString("body", "Tienes una nueva actualización");
            String channelId = call.getString("channelId", "un_2x3_high_priority");
            int notifId = call.getInt("id", (int) (System.currentTimeMillis() % Integer.MAX_VALUE));

            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            PendingIntent pendingIntent = null;
            if (launchIntent != null) {
                launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                pendingIntent = PendingIntent.getActivity(context, notifId, launchIntent, flags);
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
                .setSmallIcon(context.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true);

            if (pendingIntent != null) {
                builder.setContentIntent(pendingIntent);
            }

            // High vibration pattern
            builder.setVibrate(new long[]{0, 400, 200, 400});

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notifId, builder.build());
            }

            JSObject ret = new JSObject();
            ret.put("posted", true);
            ret.put("id", notifId);
            call.resolve(ret);
        } catch (Exception ex) {
            call.reject("Error posting native notification", ex);
        }
    }
}
