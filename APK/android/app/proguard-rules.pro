# Flutter / plugins keep rules for release (R8) builds.
# Most app logic is Dart (untouched by R8); these protect the native plugin
# bridges that use reflection / platform channels.

# Flutter embedding
-keep class io.flutter.** { *; }
-dontwarn io.flutter.**

# In-app OTA update plugin
-keep class sk.fourq.otaupdate.** { *; }

# Plugins that apply KGP / use reflection
-keep class dev.fluttercommunity.plus.packageinfo.** { *; }
-keep class dev.fluttercommunity.plus.device_info.** { *; }

# Firebase / Google Play services (FCM)
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Keep annotations & generic signatures
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
