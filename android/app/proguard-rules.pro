# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve Capacitor Plugin and Widget Provider classes
-keep class com.un2x3.cliente.OrderLiveNotificationPlugin { *; }
-keep class com.un2x3.cliente.OrderTrackerWidget { *; }
-keep class com.un2x3.cliente.LocationHelperPlugin { *; }

# Preserve RemoteViews references in Widget
-keepclassmembers class * extends android.appwidget.AppWidgetProvider {
    public *;
}
