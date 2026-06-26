import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_colors.dart';
import '../../core/sheets_api.dart';
import '../../data/routine_grid_repository.dart';
import '../../data/session.dart';
import '../../shared/app_toast.dart';
import '../../shared/avatar_badge.dart';
import '../../shared/folder_card.dart';
import '../notifications/notification_bell.dart';
import '../search/app_search.dart';

class _NavItem {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color accent;
  final String? route;
  const _NavItem(this.icon, this.title, this.subtitle, this.accent, [this.route]);
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  // Content folders shown on the home grid. The website's header pages live in
  // the slide-out drawer instead. Classwork is a content hub here that also
  // holds the Presentation / Tutorial / Lab Report / Viva / Lab Final / Project
  // categories.
  static const _items = <_NavItem>[
    _NavItem(Icons.assignment_rounded, 'Classwork', 'Tasks, categories & deadlines', Color(0xFF059669), '/classwork'),
    _NavItem(Icons.photo_library_rounded, 'Gallery', 'Class photos & events', Color(0xFFEC4899), '/gallery'),
    _NavItem(Icons.groups_rounded, 'Students', 'Class directory', Color(0xFF6366F1), '/students'),
    _NavItem(Icons.sports_esports_rounded, 'Games', 'Play with friends', Color(0xFFFB923C)),
  ];

  // The website's header/navbar pages — surfaced in the slide-out drawer.
  static const _menuPages = <({String label, IconData icon, String route})>[
    (label: 'Notice', icon: Icons.campaign_rounded, route: '/notice'),
    (label: 'Info', icon: Icons.event_note_rounded, route: '/info'),
    (label: 'Resources', icon: Icons.menu_book_rounded, route: '/resources'),
    (label: 'Results', icon: Icons.bar_chart_rounded, route: '/results'),
    (label: 'Cover Page', icon: Icons.description_rounded, route: '/cover-page'),
    (label: 'User Guide', icon: Icons.help_outline_rounded, route: '/user-guide'),
  ];

  @override
  Widget build(BuildContext context) {
    final student = Session.instance.student;
    return Scaffold(
      backgroundColor: AppColors.bg,
      drawer: _HomeDrawer(pages: _menuPages, student: student),
      bottomNavigationBar: _searchBar(context),
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              floating: true,
              backgroundColor: AppColors.bg,
              elevation: 0,
              titleSpacing: 4,
              leading: Builder(
                builder: (ctx) => IconButton(
                  icon: const Icon(Icons.menu_rounded, color: AppColors.textSecondary),
                  tooltip: 'Menu',
                  onPressed: () => Scaffold.of(ctx).openDrawer(),
                ),
              ),
              title: const Text('CSE 62B · PORTAL',
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5,
                      color: AppColors.accentBright)),
              actions: [
                const NotificationBell(),
                Padding(
                  padding: const EdgeInsets.only(left: 2, right: 12),
                  child: GestureDetector(
                    onTap: () => context.push('/profile'),
                    child: student == null
                        ? const Icon(Icons.account_circle_outlined,
                            color: AppColors.textSecondary)
                        : AvatarBadge(name: student.name, size: 32, radius: 10),
                  ),
                ),
              ],
            ),
            SliverToBoxAdapter(child: _greeting(student?.name)),
            if (student != null && !Session.instance.isDemo)
              const SliverToBoxAdapter(child: _ClassStatusCard()),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(14, 6, 14, 28),
              sliver: SliverGrid(
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.18,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, i) {
                    final it = _items[i];
                    return FolderCard(
                      icon: it.icon,
                      title: it.title,
                      subtitle: it.subtitle,
                      accent: it.accent,
                      index: i,
                      onTap: () {
                        if (it.route != null) {
                          context.push(it.route!);
                        } else {
                          AppToast.show(context, '${it.title} — coming soon');
                        }
                      },
                    );
                  },
                  childCount: _items.length,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _greeting(String? name) {
    final hour = DateTime.now().hour;
    final part = hour < 12
        ? 'Good morning'
        : hour < 17
            ? 'Good afternoon'
            : 'Good evening';
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 8, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(part,
              style: const TextStyle(
                  color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 2),
          Text(
            name != null ? name.split(' ').first : 'Welcome',
            style: const TextStyle(
                color: AppColors.textBright,
                fontSize: 24,
                fontWeight: FontWeight.w700),
          ),
        ],
      ).animate().fadeIn(duration: 300.ms).moveY(begin: 8, end: 0),
    );
  }

  /// Bottom global-search bar — tapping opens the searchable function list
  /// (most-used by default, live-filtered as you type).
  Widget _searchBar(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 6, 14, 10),
        child: Material(
          color: AppColors.card,
          borderRadius: BorderRadius.circular(14),
          elevation: 8,
          shadowColor: Colors.black.withValues(alpha: 0.4),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => showAppSearch(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.borderAccent),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded, color: AppColors.accentBright, size: 20),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('Search anything in the portal…',
                        style: TextStyle(color: AppColors.muted, fontSize: 13.5)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.accent.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text('Search',
                        style: TextStyle(
                            color: AppColors.accentBright,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Live "Now Running / Next Class" strip on the home page — mirrors the
/// website's quick-info bar. Reads today's 62B routine (from the cached grid)
/// and ticks a live clock + countdowns every second.
class _ClassStatusCard extends StatefulWidget {
  const _ClassStatusCard();

  @override
  State<_ClassStatusCard> createState() => _ClassStatusCardState();
}

class _ClassStatusCardState extends State<_ClassStatusCard> {
  RoutineGridData? _data;
  bool _loading = true;
  Timer? _ticker;

  // Today's regular bus times (minutes-from-midnight), per direction.
  List<({String time, int t})> _toLU = const [];
  List<({String time, int t})> _fromLU = const [];

  static const _green = Color(0xFF34D399);
  static const _accent = Color(0xFF818CF8);
  static const _busColor = Color(0xFF22D3EE);

  static const Map<int, String> _weekdayName = {
    DateTime.saturday: 'SATURDAY',
    DateTime.sunday: 'SUNDAY',
    DateTime.monday: 'MONDAY',
    DateTime.tuesday: 'TUESDAY',
    DateTime.wednesday: 'WEDNESDAY',
    DateTime.thursday: 'THURSDAY',
    DateTime.friday: 'FRIDAY',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    // Routine (cached) + bus, in parallel. Bus failing must not block classes.
    final results = await Future.wait([
      RoutineGridRepository.instance.load().then<Object?>((d) => d).catchError((_) => null),
      SheetsApi.instance.sheet('Bus').catchError((_) => <List<String>>[]),
    ]);
    if (!mounted) return;
    setState(() {
      _data = results[0] as RoutineGridData?;
      _parseBus(results[1] as List<List<String>>);
      _loading = false;
    });
  }

  /// Parse today's regular bus times into To-LU / From-LU lists. Mirrors the
  /// website's quick-info bus logic (day-group match + direction).
  void _parseBus(List<List<String>> rows) {
    final to = <({String time, int t})>[];
    final from = <({String time, int t})>[];
    final wd = DateTime.now().weekday;
    final isFri = wd == DateTime.friday;
    final isSat = wd == DateTime.saturday;
    final start = (rows.isNotEmpty && rows[0].isNotEmpty &&
            rows[0][0].toLowerCase().trim() == 'schedule')
        ? 1
        : 0;
    for (var i = start; i < rows.length; i++) {
      final r = rows[i];
      if (r.length < 4) continue;
      final sched = r[0].trim();
      if (sched != 'Regular') continue;
      final gl = r[1].trim().toLowerCase();
      final dir = r[2].trim();
      final match = (isFri && gl.contains('fri')) ||
          (isSat && gl == 'saturday') ||
          (!isFri && !isSat && (gl.contains('sun') || gl.contains('sat') || gl.contains('mon')));
      if (!match) continue;
      final t = _toMinAmPm(r[3].trim());
      if (t < 0) continue;
      if (dir == 'From LU') {
        from.add((time: r[3].trim(), t: t));
      } else if (dir == 'To LU') {
        to.add((time: r[3].trim(), t: t));
      }
    }
    to.sort((a, b) => a.t.compareTo(b.t));
    from.sort((a, b) => a.t.compareTo(b.t));
    _toLU = to;
    _fromLU = from;
  }

  // Routine time-slot label ("8:30") → minutes (hours < 8 are afternoon).
  static int _toMin(String t) {
    final m = RegExp(r'(\d{1,2}):(\d{2})').firstMatch(t);
    if (m == null) return 9999;
    var h = int.parse(m[1]!);
    final mi = int.parse(m[2]!);
    if (h < 8) h += 12;
    return h * 60 + mi;
  }

  // "7:30 AM" → minutes from midnight.
  static int _toMinAmPm(String s) {
    final m = RegExp(r'(\d{1,2}):(\d{2})\s*(AM|PM)', caseSensitive: false).firstMatch(s);
    if (m == null) return -1;
    var h = int.parse(m[1]!);
    final mi = int.parse(m[2]!);
    final pm = m[3]!.toUpperCase() == 'PM';
    if (pm && h != 12) h += 12;
    if (!pm && h == 12) h = 0;
    return h * 60 + mi;
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final clock =
        '${_pad(now.hour > 12 ? now.hour - 12 : (now.hour == 0 ? 12 : now.hour))}:${_pad(now.minute)}:${_pad(now.second)} ${now.hour >= 12 ? 'PM' : 'AM'}';
    final dayName = _weekdayName[now.weekday] ?? '';
    final nowMin = now.hour * 60 + now.minute;

    // Today's 62B non-break slots, sorted by start time.
    final slots = <({String code, String name, String time, String room, int start})>[];
    final today = _data?.schedule[dayName];
    if (today != null) {
      for (final s in today) {
        if (s.isBreak || s.code.isEmpty) continue;
        slots.add((
          code: s.code,
          name: _data!.nameFor(s),
          time: s.time,
          room: s.room,
          start: _toMin(s.time),
        ));
      }
      slots.sort((a, b) => a.start.compareTo(b.start));
    }

    // Resolve current + next.
    ({String code, String name, String time, String room, int start})? current;
    ({String code, String name, String time, String room, int start})? next;
    int? currentEnd;
    for (var i = 0; i < slots.length; i++) {
      final s = slots[i];
      if (s.start > nowMin && next == null) next = s;
      final end = i + 1 < slots.length ? slots[i + 1].start : s.start + 90;
      if (s.start <= nowMin && nowMin < end) {
        current = s;
        currentEnd = end;
      }
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 2, 14, 6),
      padding: const EdgeInsets.fromLTRB(15, 13, 15, 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [_accent.withValues(alpha: 0.10), _green.withValues(alpha: 0.06)],
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderAccent),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt_rounded, size: 16, color: _accent),
              const SizedBox(width: 6),
              Text(_loading ? 'CLASS STATUS' : (dayName.isEmpty ? 'TODAY' : dayName),
                  style: const TextStyle(
                      color: AppColors.accentBright,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6)),
              const Spacer(),
              Text(clock,
                  style: const TextStyle(
                      color: AppColors.textBright,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()])),
            ],
          ),
          const SizedBox(height: 12),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Loading today’s schedule…',
                  style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
            )
          else ...[
            _statusRow(
              dot: _green,
              label: 'NOW RUNNING',
              value: current != null
                  ? (current.name.isNotEmpty ? '${current.code} · ${current.name}' : current.code)
                  : (today == null ? 'No class today' : 'No class right now'),
              trailing: current != null && currentEnd != null
                  ? _fmt('ends ', currentEnd - nowMin)
                  : null,
              muted: current == null,
            ),
            const SizedBox(height: 10),
            _statusRow(
              dot: _accent,
              label: 'NEXT CLASS',
              value: next != null
                  ? (next.name.isNotEmpty ? '${next.code} · ${next.name}' : next.code)
                  : 'No more classes',
              trailing: next != null ? _fmt('', next.start - nowMin) : null,
              muted: next == null,
            ),
            if (next != null) ...[
              const SizedBox(height: 9),
              Padding(
                padding: const EdgeInsets.only(left: 18),
                child: Row(
                  children: [
                    _infoChip(Icons.schedule_rounded, 'Time', next.time, _accent),
                    const SizedBox(width: 8),
                    _infoChip(Icons.meeting_room_rounded, 'Room',
                        next.room.isEmpty ? '—' : next.room, _accent),
                  ],
                ),
              ),
            ],
            _busSection(nowMin),
          ],
        ],
      ),
    );
  }

  /// Next Bus — To LU / From LU with live "in Xm" countdowns, like the website.
  Widget _busSection(int nowMin) {
    final nextTo = _toLU.where((b) => b.t >= nowMin).firstOrNull;
    final nextFrom = _fromLU.where((b) => b.t >= nowMin).firstOrNull;
    if (_toLU.isEmpty && _fromLU.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 12, bottom: 8),
          child: Divider(height: 1, color: AppColors.border),
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(Icons.directions_bus_rounded, size: 15, color: _busColor),
            ),
            const SizedBox(width: 10),
            const Text('NEXT BUS',
                style: TextStyle(
                    color: AppColors.muted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
            const Spacer(),
          ],
        ),
        const SizedBox(height: 7),
        Padding(
          padding: const EdgeInsets.only(left: 25),
          child: Row(
            children: [
              Expanded(child: _busCol('To LU', nextTo, nowMin)),
              Container(width: 1, height: 30, color: AppColors.border, margin: const EdgeInsets.symmetric(horizontal: 10)),
              Expanded(child: _busCol('From LU', nextFrom, nowMin)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _busCol(String dir, ({String time, int t})? bus, int nowMin) {
    final cd = bus != null ? _fmt('', bus.t - nowMin) : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(dir,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontWeight: FontWeight.w600)),
        const SizedBox(height: 1),
        Row(
          children: [
            Text(bus?.time ?? 'No more',
                style: TextStyle(
                    color: bus != null ? AppColors.textBright : AppColors.muted,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
            if (cd != null) ...[
              const SizedBox(width: 6),
              Text(cd, style: const TextStyle(color: _busColor, fontSize: 10.5, fontWeight: FontWeight.w700)),
            ],
          ],
        ),
      ],
    );
  }

  /// Small labelled value chip (used for Time / Room).
  Widget _infoChip(IconData icon, String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text('$label ',
              style: const TextStyle(color: AppColors.muted, fontSize: 10.5, fontWeight: FontWeight.w600)),
          Text(value,
              style: const TextStyle(
                  color: AppColors.textBright, fontSize: 12, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _statusRow({
    required Color dot,
    required String label,
    required String value,
    String? subtitle,
    String? trailing,
    required bool muted,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: muted ? AppColors.muted : dot,
              shape: BoxShape.circle,
              boxShadow: muted
                  ? null
                  : [BoxShadow(color: dot.withValues(alpha: 0.6), blurRadius: 6, spreadRadius: 1)],
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      color: AppColors.muted, fontSize: 9.5, fontWeight: FontWeight.w800, letterSpacing: 0.6)),
              const SizedBox(height: 2),
              Text(value,
                  style: TextStyle(
                      color: muted ? AppColors.textSecondary : AppColors.textBright,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      height: 1.25)),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(subtitle,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 11.5)),
                ),
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: dot.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(trailing,
                style: TextStyle(color: dot, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ],
      ],
    );
  }

  static String _pad(int n) => n.toString().padLeft(2, '0');

  /// "in 1h 20m" / "ends in 25m" style countdown (minute granularity).
  static String? _fmt(String prefix, int diffMin) {
    if (diffMin <= 0) return null;
    if (diffMin < 60) return '${prefix}in ${diffMin}m';
    final h = diffMin ~/ 60, m = diffMin % 60;
    return m > 0 ? '${prefix}in ${h}h ${m}m' : '${prefix}in ${h}h';
  }
}

/// Slide-out navigation drawer (opened by the ☰ button). Holds the website's
/// header pages plus Profile and Sign Out.
class _HomeDrawer extends StatelessWidget {
  final List<({String label, IconData icon, String route})> pages;
  final dynamic student;
  const _HomeDrawer({required this.pages, required this.student});

  @override
  Widget build(BuildContext context) {
    void open(String route) {
      Scaffold.of(context).closeDrawer();
      context.push(route);
    }

    return Drawer(
      backgroundColor: AppColors.surface,
      width: 292,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(18, MediaQuery.of(context).padding.top + 18, 18, 18),
            decoration: const BoxDecoration(gradient: AppColors.accentGradient),
            child: Row(
              children: [
                if (student != null) AvatarBadge(name: student.name, size: 46, radius: 14),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(student != null ? student.name : 'CSE 62B · PORTAL',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700)),
                      if (student != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Text(student.id,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white70, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                for (final p in pages) _tile(p.icon, p.label, () => open(p.route)),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.border),
          _tile(Icons.person_outline_rounded, 'Profile', () => open('/profile')),
          _tile(Icons.logout_rounded, 'Sign Out', () async {
            Scaffold.of(context).closeDrawer();
            await Session.instance.signOut();
            if (context.mounted) context.go('/login');
          }, danger: true),
          SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String label, VoidCallback onTap, {bool danger = false}) {
    final color = danger ? AppColors.red : AppColors.accentBright;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(11)),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(width: 14),
            Text(label,
                style: TextStyle(
                    color: danger ? AppColors.red : AppColors.text, fontSize: 15, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
