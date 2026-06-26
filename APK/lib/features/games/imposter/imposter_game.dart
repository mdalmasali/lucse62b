import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/supa.dart';
import '../game_identity.dart';
import 'imposter_models.dart';

/// Settings chosen by the host when creating a room.
class ImposterSettings {
  String wordPack = 'random';
  int imposterCount = 1;
  int discussionTime = 60;
  int votingTime = 60;
  int rounds = 1;
  int maxPlayers = 8;
  bool isPrivate = false;
  bool guestsAllowed = true;
  bool skipVote = false;
  bool revealAtEnd = true;
}

/// Drives one Imposter session — mirrors the website's host-authoritative state
/// machine over `game_rooms` / `game_players`, the `room:CODE` realtime channel
/// (postgres changes + presence) and the `bump_standing` RPC, so app and web
/// players share the same rooms and overall standings.
class ImposterGame extends ChangeNotifier {
  ImposterGame(this.identity);
  final GameIdentity identity;

  SupabaseClient get _sb => Supa.client;
  String get _pid => identity.playerId;
  String get _pname => identity.playerName;

  ImposterRoom? room;
  List<ImposterPlayer> players = [];
  ImposterPlayer? me;
  bool isHost = false;
  String? roomCode;
  String? myVote;
  Set<String> online = {};

  RealtimeChannel? _channel;
  final Map<String, Timer> _discTimers = {};
  Timer? _ticker;
  bool _disposed = false;

  // ── Queries ──
  Future<ImposterRoom?> _getRoom(String code) async {
    final data = await _sb.from('game_rooms').select().eq('room_code', code).maybeSingle();
    return data == null ? null : ImposterRoom.fromMap(data);
  }

  Future<List<ImposterPlayer>> _getPlayers(String code) async {
    final rows = await _sb.from('game_players').select().eq('room_code', code).order('joined_at');
    return (rows as List).map((r) => ImposterPlayer.fromMap(r as Map<String, dynamic>)).toList();
  }

  Future<void> _updateRoom(Map<String, dynamic> patch) async {
    if (roomCode == null) return;
    await _sb.from('game_rooms').update(patch).eq('room_code', roomCode!);
  }

  Future<void> _updatePlayer(String pid, Map<String, dynamic> patch) async {
    if (roomCode == null) return;
    await _sb.from('game_players').update(patch).eq('room_code', roomCode!).eq('player_id', pid);
  }

  Future<void> _refreshPlayers() async {
    if (roomCode == null) return;
    players = await _getPlayers(roomCode!);
    final mine = players.where((p) => p.playerId == _pid).toList();
    me = mine.isEmpty ? null : mine.first;
  }

  List<ImposterPlayer> get activePlayers => players.where((p) => p.active).toList();

  // ── Create / Join ──
  static String _genCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    final r = Random();
    return List.generate(6, (_) => chars[r.nextInt(chars.length)]).join();
  }

  /// Returns null on success, else an error message.
  Future<String?> createRoom(ImposterSettings s) async {
    if (_pname.trim().isEmpty) return 'Please enter your name first.';
    final code = _genCode();
    try {
      await _sb.from('game_rooms').insert({
        'room_code': code,
        'host_id': _pid,
        'word_pack': s.wordPack,
        'imposter_count': s.imposterCount,
        'discussion_time': s.discussionTime,
        'voting_time': s.votingTime,
        'rounds_total': s.rounds,
        'max_players': s.maxPlayers,
        'is_private': s.isPrivate,
        'guests_allowed': s.guestsAllowed,
        'allow_any_name': true,
        'skip_vote': s.skipVote,
        'reveal_at_end': s.revealAtEnd,
      });
      await _sb.from('game_players').insert({
        'room_code': code,
        'player_id': _pid,
        'player_name': _pname,
        'is_host': true,
        'is_approved': true,
      });
      roomCode = code;
      room = await _getRoom(code);
      isHost = true;
      await _refreshPlayers();
      _subscribe(code);
      notifyListeners();
      return null;
    } catch (e) {
      return 'Could not create room.';
    }
  }

  /// Returns null on success, else an error message. [pendingApproval] is set
  /// true if we joined a private room and are waiting for the host.
  Future<String?> joinRoom(String rawCode) async {
    if (_pname.trim().isEmpty) return 'Please enter your name first.';
    final code = rawCode.trim().toUpperCase();
    if (code.length != 6) return 'Enter a 6-character room code.';
    final r = await _getRoom(code);
    if (r == null) return 'Room not found.';
    if (identity.isGuest && !r.guestsAllowed) return 'This room requires login.';

    if (r.status != 'lobby') {
      if (identity.isGuest) return 'Game has already started.';
      // logged-in: rejoin running game
      final running = await _getPlayers(code);
      final was = running.where((p) => p.playerId == _pid).toList();
      if (was.isEmpty) {
        await _sb.from('game_players').insert({
          'room_code': code, 'player_id': _pid, 'player_name': _pname, 'is_host': false, 'is_approved': true,
        });
      } else {
        await _sb.from('game_players').update({'left_at': null}).eq('room_code', code).eq('player_id', _pid);
      }
      await _enter(code, r);
      return null;
    }

    final existing = await _getPlayers(code);
    final approved = existing.where((p) => p.isApproved).length;
    if (approved >= r.maxPlayers) return 'Room is full.';

    final alreadyIn = existing.any((p) => p.playerId == _pid);
    if (!alreadyIn) {
      final isApproved = !r.isPrivate;
      await _sb.from('game_players').insert({
        'room_code': code, 'player_id': _pid, 'player_name': _pname, 'is_host': false, 'is_approved': isApproved,
      });
    }
    await _enter(code, r);
    return null;
  }

  Future<void> _enter(String code, ImposterRoom r) async {
    roomCode = code;
    room = r;
    isHost = _pid == r.hostId;
    await _refreshPlayers();
    myVote = me?.voteFor;
    _subscribe(code);
    notifyListeners();
  }

  // ── Realtime ──
  void _subscribe(String code) {
    if (_channel != null) {
      _sb.removeChannel(_channel!);
      _channel = null;
    }
    online = {};
    final ch = _sb.channel('room:$code');
    ch
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'game_rooms',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'room_code', value: code),
          callback: (payload) => _onRoomChange(payload, code),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'game_players',
          filter: PostgresChangeFilter(type: PostgresChangeFilterType.eq, column: 'room_code', value: code),
          callback: (_) => _onPlayersChange(code),
        )
        .onPresenceSync((_) => _refreshPresence())
        .onPresenceLeave((payload) {
          for (final p in payload.leftPresences) {
            final pid = p.payload['player_id'];
            if (pid is String) _scheduleDisconnect(pid);
          }
        })
        .subscribe((status, error) async {
          if (status == RealtimeSubscribeStatus.subscribed) {
            await ch.track({'player_id': _pid, 'player_name': _pname});
            if (roomCode != null) {
              await _sb.from('game_players').update({'left_at': null}).eq('room_code', roomCode!).eq('player_id', _pid);
            }
          }
        });
    _channel = ch;
    _startTicker();
  }

  Future<void> _onRoomChange(PostgresChangePayload payload, String code) async {
    final rec = payload.newRecord;
    room = rec.isNotEmpty ? ImposterRoom.fromMap(rec) : await _getRoom(code);
    isHost = _pid == room?.hostId;
    await _refreshPlayers();
    notifyListeners();
  }

  Future<void> _onPlayersChange(String code) async {
    await _refreshPlayers();
    // Self-heal a stale "left" mark on me.
    if (me?.leftAt != null) {
      await _sb.from('game_players').update({'left_at': null}).eq('room_code', code).eq('player_id', _pid);
      return;
    }
    notifyListeners();
    final st = room?.status;
    if (isHost && (st == 'role_reveal' || st == 'discuss' || st == 'vote')) {
      if (activePlayers.length < 2) {
        await _updateRoom({'status': 'result', 'rounds_current': room!.roundsTotal, 'phase_ends_at': null});
        return;
      }
    }
    if (isHost && st == 'vote') {
      final active = activePlayers;
      if (active.isNotEmpty && active.every((p) => p.voteFor != null)) {
        await _advanceFromVote();
      }
    }
  }

  void _refreshPresence() {
    if (_channel == null) return;
    final ids = <String>{};
    for (final st in _channel!.presenceState()) {
      for (final p in st.presences) {
        final pid = p.payload['player_id'];
        if (pid is String) ids.add(pid);
      }
    }
    online = ids;
    for (final pid in ids) {
      _discTimers.remove(pid)?.cancel();
    }
    notifyListeners();
  }

  void _scheduleDisconnect(String pid) {
    _discTimers[pid]?.cancel();
    _discTimers[pid] = Timer(const Duration(seconds: 7), () async {
      _discTimers.remove(pid);
      if (online.contains(pid)) return;
      if (!isHost || roomCode == null) return;
      if (room?.status == 'lobby') {
        await _sb.from('game_players').delete().eq('room_code', roomCode!).eq('player_id', pid);
      } else {
        await _sb
            .from('game_players')
            .update({'left_at': DateTime.now().toUtc().toIso8601String()})
            .eq('room_code', roomCode!)
            .eq('player_id', pid)
            .isFilter('left_at', null);
      }
    });
  }

  // ── Host phase timer ──
  void _startTicker() {
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) async {
      if (_disposed) return;
      notifyListeners(); // refresh countdown UI
      final r = room;
      if (!isHost || r?.phaseEndsAt == null) return;
      if (DateTime.now().toUtc().isBefore(r!.phaseEndsAt!.toUtc())) return;
      if (r.status == 'discuss') {
        await _updateRoom({'phase_ends_at': null}); // close window first
        await advanceFromDiscuss();
      } else if (r.status == 'vote') {
        await _advanceFromVote();
      }
    });
  }

  int get secondsLeft {
    final end = room?.phaseEndsAt;
    if (end == null) return -1;
    return max(0, end.toUtc().difference(DateTime.now().toUtc()).inSeconds);
  }

  // ── Host / player actions ──
  Future<void> updateSettings(Map<String, dynamic> patch) async {
    if (!isHost) return;
    await _updateRoom(patch);
  }

  Future<void> approve(String pid) => _updatePlayer(pid, {'is_approved': true});
  Future<void> reject(String pid) async {
    if (roomCode == null) return;
    await _sb.from('game_players').delete().eq('room_code', roomCode!).eq('player_id', pid);
  }

  Future<String?> startGame() async {
    if (!isHost || room == null) return null;
    final approved = activePlayers;
    if (approved.length < 2) return 'Need at least 2 players.';
    final word = pickWord(room!.wordPack, room!.usedWords);
    final shuffled = [...approved]..shuffle();
    final impCount = min(room!.imposterCount, shuffled.length - 1);
    for (var i = 0; i < shuffled.length; i++) {
      await _updatePlayer(shuffled[i].playerId,
          {'is_imposter': i < impCount, 'is_ready': false, 'vote_for': null});
    }
    await _updateRoom({
      'status': 'role_reveal',
      'word': word,
      'used_words': [...room!.usedWords, word],
      'rounds_current': room!.roundsCurrent,
    });
    return null;
  }

  Future<void> markReady() => _updatePlayer(_pid, {'is_ready': true});

  Future<void> startDiscussion() async {
    if (!isHost || room == null) return;
    final dt = room!.discussionTime;
    final end = dt > 0 ? DateTime.now().toUtc().add(Duration(seconds: dt)).toIso8601String() : null;
    await _updateRoom({'status': 'discuss', 'phase_ends_at': end});
  }

  Future<void> advanceFromDiscuss() async {
    if (!isHost || room == null) return;
    if (room!.skipVote) {
      await _updateRoom({'status': 'result', 'phase_ends_at': null});
    } else {
      final vt = room!.votingTime;
      final end = vt > 0 ? DateTime.now().toUtc().add(Duration(seconds: vt)).toIso8601String() : null;
      await _updateRoom({'status': 'vote', 'phase_ends_at': end});
    }
  }

  Future<void> castVote(String targetId) async {
    if (myVote != null) return;
    myVote = targetId;
    notifyListeners();
    await _updatePlayer(_pid, {'vote_for': targetId});
    await _refreshPlayers();
    if (isHost) {
      final active = activePlayers;
      final allVoted = active.every((p) => p.playerId == _pid || p.voteFor != null);
      if (allVoted) await _advanceFromVote();
    }
  }

  Future<void> _advanceFromVote() async {
    if (!isHost || room == null) return;
    final ps = await _getPlayers(roomCode!);
    final imposters = ps.where((p) => p.isApproved && p.isImposter).toList();
    final counts = <String, int>{};
    for (final p in ps.where((p) => p.isApproved)) {
      if (p.voteFor != null) counts[p.voteFor!] = (counts[p.voteFor!] ?? 0) + 1;
    }
    final maxVotes = counts.values.isEmpty ? 0 : counts.values.reduce(max);
    final top = counts.entries.where((e) => e.value == maxVotes).map((e) => e.key).toList();
    final crewWon = maxVotes > 0 && top.length == 1 && imposters.any((p) => p.playerId == top.first);
    await _updateRoom({
      'status': 'result',
      'phase_ends_at': null,
      'crewmate_score': room!.crewmateScore + (crewWon ? 1 : 0),
      'imposter_score': room!.imposterScore + (crewWon ? 0 : 1),
    });
  }

  Future<void> endGame() async {
    if (!isHost || room == null) return;
    await _updateRoom({'status': 'result', 'phase_ends_at': null, 'rounds_current': room!.roundsTotal});
  }

  Future<void> nextRound() async {
    if (!isHost || room == null) return;
    for (final p in players.where((p) => p.isApproved)) {
      await _updatePlayer(p.playerId, {'is_imposter': false, 'is_ready': false, 'vote_for': null});
    }
    await _updateRoom({
      'status': 'lobby',
      'word': null,
      'phase_ends_at': null,
      'rounds_current': room!.roundsCurrent + 1,
    });
    myVote = null;
  }

  Future<void> backToLobby() async {
    if (!isHost || roomCode == null) return;
    await _sb.from('game_players').delete().eq('room_code', roomCode!).not('left_at', 'is', null);
    for (final p in activePlayers) {
      await _updatePlayer(p.playerId, {'is_imposter': false, 'is_ready': false, 'vote_for': null});
    }
    await _updateRoom({
      'status': 'lobby',
      'word': null,
      'phase_ends_at': null,
      'rounds_current': 1,
      'crewmate_score': 0,
      'imposter_score': 0,
      'used_words': <String>[],
      'standings_done': false,
    });
    myVote = null;
  }

  /// Award overall standings once at the end of a match (host only).
  Future<void> recordStandings() async {
    final r = room;
    if (!isHost || r == null || r.standingsDone) return;
    await _updateRoom({'standings_done': true});
    final ps = activePlayers;
    if (ps.length < 2) return;
    final crewWon = r.crewmateScore >= r.imposterScore;
    for (final p in ps) {
      if (!p.playerId.startsWith('student_')) continue;
      final isWinner = crewWon ? !p.isImposter : p.isImposter;
      try {
        await _sb.rpc('bump_standing', params: {
          'p_id': p.playerId,
          'p_name': p.playerName,
          'p_points': 5 + (isWinner ? 10 : 0),
          'p_won': isWinner,
          'p_bucket': 'imposter',
        });
      } catch (_) {}
    }
  }

  Future<void> leaveRoom() async {
    if (roomCode == null) return;
    final code = roomCode!;
    final activeGame = room?.status != null && room?.status != 'lobby';
    final others = players.where((p) => p.active && p.playerId != _pid).toList();
    if (_channel != null) {
      _sb.removeChannel(_channel!);
      _channel = null;
    }
    _ticker?.cancel();
    if (others.isEmpty) {
      await _sb.from('game_rooms').delete().eq('room_code', code);
    } else {
      if (isHost) {
        final newHost = others.first;
        await _sb.from('game_players').update({'is_host': true}).eq('room_code', code).eq('player_id', newHost.playerId);
        await _sb.from('game_rooms').update({'host_id': newHost.playerId}).eq('room_code', code);
      }
      if (activeGame) {
        await _sb.from('game_players').update({'left_at': DateTime.now().toUtc().toIso8601String()}).eq('room_code', code).eq('player_id', _pid);
      } else {
        await _sb.from('game_players').delete().eq('room_code', code).eq('player_id', _pid);
      }
    }
    roomCode = null;
    room = null;
    players = [];
    me = null;
    myVote = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _ticker?.cancel();
    for (final t in _discTimers.values) {
      t.cancel();
    }
    if (_channel != null) _sb.removeChannel(_channel!);
    super.dispose();
  }
}
