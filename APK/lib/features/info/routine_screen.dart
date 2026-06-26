import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_colors.dart';
import '../../data/routine_grid_repository.dart';
import '../../data/session.dart';

/// Class Routine — a weekly grid (days × time slots) for any batch/section,
/// with today highlighting and a "My Courses" filter. Mirrors the website's
/// routine grid.
class RoutineScreen extends StatefulWidget {
  const RoutineScreen({super.key});

  @override
  State<RoutineScreen> createState() => _RoutineScreenState();
}

class _RoutineScreenState extends State<RoutineScreen> {
  final _repo = RoutineGridRepository.instance;
  RoutineGridData? _data;
  bool _loading = true;
  String? _error;
  Set<String> _excluded = {};

  static const _dayW = 92.0;
  static const _timeW = 118.0;

  String? get _studentId {
    final s = Session.instance.student;
    return (s != null && !s.isDemo) ? s.id : null;
  }

  bool get _is62B => _data?.batch == '62' && _data?.section == 'B';

  String get _todayName {
    const map = {
      DateTime.saturday: 'SATURDAY',
      DateTime.sunday: 'SUNDAY',
      DateTime.monday: 'MONDAY',
      DateTime.tuesday: 'TUESDAY',
      DateTime.wednesday: 'WEDNESDAY',
      DateTime.thursday: 'THURSDAY',
      DateTime.friday: 'FRIDAY',
    };
    return map[DateTime.now().weekday] ?? '';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load({bool refresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    if (refresh) _repo.invalidate();
    try {
      final data = await _repo.load();
      final id = _studentId;
      if (id != null) _excluded = await _repo.loadExcluded(id);
      if (mounted) {
        setState(() {
          _data = data;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = 'Could not load the routine right now.';
        });
      }
    }
  }

  void _select(String batch, String section) {
    setState(() => _data = _repo.buildFor(batch, section));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Class Routine'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/info'),
        ),
        actions: [
          if (_studentId != null && _is62B && !_loading)
            IconButton(
              tooltip: 'My Courses',
              icon: const Icon(Icons.checklist_rounded, size: 22),
              onPressed: _openMyCourses,
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.accent))
          : _error != null || _data == null
              ? _errorView()
              : _body(_data!),
    );
  }

  Widget _body(RoutineGridData d) {
    return RefreshIndicator(
      color: AppColors.accent,
      backgroundColor: AppColors.card,
      onRefresh: () => _load(refresh: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 28),
        children: [
          if (d.available.length > 1) _selector(d),
          _syncBadge(d),
          const SizedBox(height: 14),
          if (d.groups.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: Center(
                child: Text('No schedule found for Batch ${d.batch}, Section ${d.section}.',
                    style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
              ),
            )
          else
            for (var i = 0; i < d.groups.length; i++) ...[
              if (i > 0) const SizedBox(height: 16),
              _gridTable(d, d.groups[i]),
            ],
        ],
      ),
    );
  }

  Widget _selector(RoutineGridData d) {
    final batches = {for (final c in d.available) c.batch}.toList();
    final sections = d.available.where((c) => c.batch == d.batch).map((c) => c.section).toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.search, size: 16, color: AppColors.accentBright),
          const SizedBox(width: 8),
          const Text('Batch', style: TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
          const SizedBox(width: 6),
          _dropdown(d.batch, batches, (v) {
            if (v == null) return;
            final secs = d.available.where((c) => c.batch == v).map((c) => c.section).toList();
            _select(v, secs.contains(d.section) ? d.section : (secs.isNotEmpty ? secs.first : 'A'));
          }),
          const SizedBox(width: 14),
          const Text('Section', style: TextStyle(color: AppColors.textSecondary, fontSize: 12.5)),
          const SizedBox(width: 6),
          _dropdown(d.section, sections, (v) {
            if (v != null) _select(d.batch, v);
          }),
        ],
      ),
    );
  }

  Widget _dropdown(String value, List<String> items, ValueChanged<String?> onChanged) {
    final safe = items.contains(value) ? value : (items.isNotEmpty ? items.first : value);
    return DropdownButton<String>(
      value: safe,
      isDense: true,
      dropdownColor: AppColors.card,
      underline: const SizedBox.shrink(),
      style: const TextStyle(color: AppColors.text, fontSize: 13, fontWeight: FontWeight.w700),
      icon: const Icon(Icons.arrow_drop_down, color: AppColors.muted, size: 20),
      items: items.map((e) => DropdownMenuItem(value: e, child: Text(e))).toList(),
      onChanged: onChanged,
    );
  }

  Widget _syncBadge(RoutineGridData d) {
    final now = TimeOfDay.now();
    final h12 = now.hourOfPeriod == 0 ? 12 : now.hourOfPeriod;
    final t = '$h12:${now.minute.toString().padLeft(2, '0')} ${now.period == DayPeriod.am ? 'AM' : 'PM'}';
    return Row(
      children: [
        Container(width: 7, height: 7, decoration: const BoxDecoration(color: Color(0xFF34D399), shape: BoxShape.circle)),
        const SizedBox(width: 7),
        Expanded(
          child: Text('Live sync · ${d.semester} · Updated $t',
              style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
        ),
      ],
    );
  }

  Widget _gridTable(RoutineGridData d, GridGroup g) {
    // day → time → slots
    final lookup = <String, Map<String, List<GridSlot>>>{};
    for (final day in g.days) {
      lookup[day] = {};
      for (final s in d.schedule[day] ?? <GridSlot>[]) {
        lookup[day]!.putIfAbsent(s.time, () => []).add(s);
      }
    }
    final visibleDays = g.days.where((day) => (d.schedule[day] ?? []).any((s) => !s.isBreak)).toList();

    final rows = <TableRow>[
      TableRow(
        decoration: const BoxDecoration(color: AppColors.surface),
        children: [
          _headCell('Day'),
          for (final time in g.allTimes) _headCell(time, isBreak: g.breakTimes.contains(time)),
        ],
      ),
    ];
    for (final day in visibleDays) {
      final isToday = day == _todayName;
      rows.add(TableRow(
        decoration: BoxDecoration(
          color: isToday ? AppColors.accent.withValues(alpha: 0.08) : null,
        ),
        children: [
          _dayCell(day, isToday),
          for (final time in g.allTimes)
            _bodyCell(d, lookup[day]?[time] ?? const [], g.breakTimes.contains(time)),
        ],
      ));
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SizedBox(
        width: _dayW + _timeW * g.allTimes.length,
        child: Table(
          border: TableBorder.all(color: AppColors.border, width: 1),
          defaultColumnWidth: const FixedColumnWidth(_timeW),
          columnWidths: const {0: FixedColumnWidth(_dayW)},
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          children: rows,
        ),
      ),
    );
  }

  Widget _headCell(String text, {bool isBreak = false}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 9),
        child: Text(text,
            textAlign: TextAlign.center,
            style: TextStyle(
                color: isBreak ? AppColors.muted : AppColors.textSecondary,
                fontSize: 10.5,
                fontWeight: FontWeight.w700)),
      );

  Widget _dayCell(String day, bool isToday) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_title(day),
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: isToday ? AppColors.accentBright : AppColors.textBright,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700)),
            if (isToday) ...[
              const SizedBox(height: 4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                    gradient: AppColors.accentGradient, borderRadius: BorderRadius.circular(4)),
                child: const Text('Today',
                    style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w800)),
              ),
            ],
          ],
        ),
      );

  Widget _bodyCell(RoutineGridData d, List<GridSlot> slots, bool isBreakCol) {
    if (isBreakCol) {
      final isBreak = slots.any((s) => s.isBreak);
      return Padding(
        padding: const EdgeInsets.all(6),
        child: Center(
          child: Text(isBreak ? '☕ Break' : '',
              style: const TextStyle(color: AppColors.muted, fontSize: 10)),
        ),
      );
    }
    final courses = slots.where((s) => !s.isBreak).where((s) {
      if (_is62B && _excluded.contains(s.code.toUpperCase())) return false;
      return true;
    }).toList();
    if (courses.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(8),
        child: Center(child: Text('—', style: TextStyle(color: AppColors.muted, fontSize: 13))),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(5),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: courses.map((s) => _courseCard(d, s)).toList(),
      ),
    );
  }

  Widget _courseCard(RoutineGridData d, GridSlot s) {
    final color = _courseColor(s.code);
    final name = d.nameFor(s);
    final teacher = d.teacherFor(s);
    return Container(
      margin: const EdgeInsets.only(bottom: 3),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(name.isNotEmpty ? name : s.code,
              textAlign: TextAlign.center,
              style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 9.5, height: 1.2)),
          if (name.isNotEmpty)
            Text(s.code,
                textAlign: TextAlign.center,
                style: TextStyle(color: color.withValues(alpha: 0.7), fontSize: 8, fontWeight: FontWeight.w700)),
          if (teacher.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(teacher,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 8.5, height: 1.2)),
            ),
          if (s.room.isNotEmpty)
            Text(s.room,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted, fontSize: 8)),
        ],
      ),
    );
  }

  Future<void> _openMyCourses() async {
    final d = _data;
    final id = _studentId;
    if (d == null || id == null) return;
    // All 62B course codes (unique) → name.
    final codes = <String, String>{};
    for (final slots in d.schedule.values) {
      for (final s in slots) {
        if (!s.isBreak && s.code.isNotEmpty) {
          codes[s.code.toUpperCase()] = d.nameFor(s);
        }
      }
    }
    final entries = codes.entries.toList()..sort((a, b) => a.key.compareTo(b.key));
    final checked = {for (final e in entries) e.key: !_excluded.contains(e.key)};

    final saved = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.card,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.7,
          maxChildSize: 0.9,
          builder: (ctx, scroll) => Column(
            children: [
              const SizedBox(height: 12),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(2))),
              const Padding(
                padding: EdgeInsets.fromLTRB(18, 14, 18, 4),
                child: Text('My 62B Courses',
                    style: TextStyle(color: AppColors.textBright, fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(18, 0, 18, 8),
                child: Text('Uncheck the courses you are NOT taking this semester. They’ll be hidden from your routine.',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 12.5, height: 1.4)),
              ),
              Expanded(
                child: ListView(
                  controller: scroll,
                  padding: const EdgeInsets.fromLTRB(14, 4, 14, 8),
                  children: entries.map((e) {
                    return CheckboxListTile(
                      value: checked[e.key],
                      onChanged: (v) => setSheet(() => checked[e.key] = v ?? true),
                      activeColor: AppColors.accent,
                      controlAffinity: ListTileControlAffinity.leading,
                      dense: true,
                      title: Text(e.key,
                          style: const TextStyle(
                              color: AppColors.accentBright,
                              fontWeight: FontWeight.w700,
                              fontFamily: 'monospace',
                              fontSize: 13)),
                      subtitle: e.value.isEmpty
                          ? null
                          : Text(e.value, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    );
                  }).toList(),
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(16, 6, 16, MediaQuery.of(ctx).padding.bottom + 14),
                child: SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => Navigator.pop(ctx, true),
                    icon: const Icon(Icons.check, size: 18),
                    label: const Text('Save My Courses'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.accent,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved == true) {
      final excluded = {for (final e in entries) if (checked[e.key] == false) e.key};
      setState(() => _excluded = excluded);
      _repo.saveExcluded(id, excluded);
    }
  }

  Widget _errorView() => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.calendar_month_rounded, color: AppColors.muted, size: 34),
            const SizedBox(height: 12),
            Text(_error ?? 'Could not load the routine.',
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
            const SizedBox(height: 14),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );

  String _title(String day) => day[0] + day.substring(1, 3).toLowerCase();

  Color _courseColor(String code) {
    var h = 0;
    for (var i = 0; i < code.length; i++) {
      h = (h * 31 + code.codeUnitAt(i)) & 0x7FFFFFFF;
    }
    const palette = [
      Color(0xFFA78BFA), Color(0xFF38BDF8), Color(0xFF34D399),
      Color(0xFFF87171), Color(0xFFFBBF24), Color(0xFFF472B6),
      Color(0xFF22D3EE), Color(0xFFC084FC),
    ];
    return palette[h % palette.length];
  }
}
