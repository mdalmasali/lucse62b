import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

import '../../data/session.dart';

/// A player's identity for the multiplayer games. Matches the website exactly
/// so app and web players share rooms and standings:
///   • logged-in student → `student_<id>` (only these count toward standings)
///   • guest / demo       → a persisted `guest_<rnd>` id
class GameIdentity {
  final String playerId;
  final String playerName;
  final bool isGuest;
  const GameIdentity({required this.playerId, required this.playerName, required this.isGuest});

  static Future<GameIdentity> resolve({String? guestName}) async {
    final s = Session.instance.student;
    if (s != null && !Session.instance.isDemo && s.id.isNotEmpty) {
      return GameIdentity(
        playerId: 'student_${s.id}',
        playerName: s.name.isNotEmpty ? s.name : s.id,
        isGuest: false,
      );
    }
    final prefs = await SharedPreferences.getInstance();
    var gid = prefs.getString('game_guest_id');
    if (gid == null) {
      gid = 'guest_${Random().nextInt(1 << 32).toRadixString(36)}${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}';
      await prefs.setString('game_guest_id', gid);
    }
    final name = (guestName ?? prefs.getString('game_guest_name') ?? '').trim();
    if (guestName != null && guestName.trim().isNotEmpty) {
      await prefs.setString('game_guest_name', guestName.trim());
    }
    return GameIdentity(playerId: gid, playerName: name, isGuest: true);
  }

  /// Student id without the `student_` prefix (for display).
  String get shortId => playerId.startsWith('student_') ? playerId.substring(8) : playerId;
}
