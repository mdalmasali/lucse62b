import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../core/supa.dart';
import 'session.dart';

/// Background isolate handler — must be a top-level function.
@pragma('vm:entry-point')
Future<void> _bgHandler(RemoteMessage message) async {
  // Firebase shows the system notification automatically when the app is in
  // the background/terminated; nothing else needed here.
}

/// Firebase Cloud Messaging integration: registers the device token (linked to
/// the logged-in student), shows foreground notifications, and keeps the token
/// fresh. The Worker sends pushes to the `fcm_tokens` table on the server side.
class PushService {
  PushService._();
  static final instance = PushService._();

  final _local = FlutterLocalNotificationsPlugin();
  String? _token;
  bool _ready = false;

  static const _channel = AndroidNotificationChannel(
    'lu62b_default',
    'Notifications',
    description: 'CSE 62B Portal notifications',
    importance: Importance.high,
  );

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(_bgHandler);

      // Local notifications (used to display foreground messages).
      const initSettings = InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      );
      await _local.initialize(settings: initSettings);
      await _local
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.createNotificationChannel(_channel);

      // Permission (iOS + Android 13+).
      await FirebaseMessaging.instance.requestPermission();

      // Show foreground messages ourselves.
      FirebaseMessaging.onMessage.listen(_showForeground);

      // Token registration + refresh.
      _token = await FirebaseMessaging.instance.getToken();
      await _register();
      FirebaseMessaging.instance.onTokenRefresh.listen((t) {
        _token = t;
        _register();
      });

      _ready = true;
    } catch (e) {
      debugPrint('PushService init failed: $e');
    }
  }

  /// Upsert the current token with the logged-in student id (if any).
  Future<void> _register() async {
    final token = _token;
    if (token == null) return;
    try {
      await Supa.client.from('fcm_tokens').upsert({
        'token': token,
        'student_id': Session.instance.student?.id,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'updated_at': DateTime.now().toUtc().toIso8601String(),
      });
    } catch (e) {
      debugPrint('fcm_tokens upsert failed: $e');
    }
  }

  /// Re-link the token after a login/logout so pushes target the right student.
  Future<void> onAuthChanged() async {
    if (_ready) await _register();
  }

  void _showForeground(RemoteMessage m) {
    final n = m.notification;
    if (n == null) return;
    _local.show(
      id: n.hashCode,
      title: n.title,
      body: n.body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          'lu62b_default',
          'Notifications',
          channelDescription: 'CSE 62B Portal notifications',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: DarwinNotificationDetails(),
      ),
    );
  }
}
