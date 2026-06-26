import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/app_colors.dart';
import '../../data/routine_grid_repository.dart';

/// Teacher Class Routine — pick a teacher and see their full weekly schedule
/// across every section (built from the shared routine). Mirrors the website's
/// teacher-routine view.
class TeacherRoutineScreen extends StatefulWidget {
  const TeacherRoutineScreen({super.key});

  @override
  State<TeacherRoutineScreen> createState() => _TeacherRoutineScreenState();
}

class _TeacherRoutineScreenState extends State<TeacherRoutineScreen> {
  late Future<TeacherRoutineData> _future = RoutineGridRepository.instance.loadTeacherRoutine();
  String _query = '';

  static const _accent = Color(0xFF14B8A6);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Teacher Routine'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/info'),
        ),
      ),
      body: FutureBuilder<TeacherRoutineData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: AppColors.accent));
          }
          final data = snap.data;
          if (data == null || data.teachers.isEmpty) {
            return _empty();
          }
          final teachers = _query.isEmpty
              ? data.teachers
              : data.teachers
                  .where((t) =>
                      t.name.toLowerCase().contains(_query) ||
                      t.acr.toLowerCase().contains(_query))
                  .toList();
          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v.toLowerCase().trim()),
                  decoration: const InputDecoration(
                    hintText: 'Search teacher by name or initials…',
                    prefixIcon: Icon(Icons.search, size: 18, color: AppColors.muted),
                  ),
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  color: AppColors.accent,
                  backgroundColor: AppColors.card,
                  onRefresh: () async {
                    RoutineGridRepository.instance.invalidate();
                    setState(() => _future = RoutineGridRepository.instance.loadTeacherRoutine());
                    await _future;
                  },
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(14, 6, 14, 24),
                    itemCount: teachers.length,
                    itemBuilder: (_, i) {
                      final t = teachers[i];
                      return _teacherCard(t.acr, t.name, t.classes,
                          data.byTeacher[t.acr] ?? const []);
                    },
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _teacherCard(String acr, String name, int classes, List<TeacherClass> list) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => _TeacherDetailScreen(name: name, acr: acr, classes: list),
          )),
          child: Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: _accent.withValues(alpha: 0.3)),
                  ),
                  child: Text(_initials(name, acr),
                      style: const TextStyle(
                          color: _accent, fontWeight: FontWeight.w800, fontSize: 14)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: AppColors.textBright,
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              height: 1.25)),
                      const SizedBox(height: 3),
                      Text('$acr · $classes class${classes == 1 ? '' : 'es'} / week',
                          style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.muted, size: 22),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _initials(String name, String acr) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return acr.isNotEmpty ? acr.substring(0, acr.length.clamp(0, 2)) : '?';
    if (parts.length == 1) return parts.first.substring(0, parts.first.length.clamp(0, 2)).toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  Widget _empty() => Center(
        child: Padding(
          padding: const EdgeInsets.all(34),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.person_search_rounded, color: AppColors.muted, size: 40),
              const SizedBox(height: 12),
              const Text('No teacher routine available right now.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: () => setState(
                    () => _future = RoutineGridRepository.instance.loadTeacherRoutine()),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
}

class _TeacherDetailScreen extends StatelessWidget {
  final String name, acr;
  final List<TeacherClass> classes;
  const _TeacherDetailScreen({required this.name, required this.acr, required this.classes});

  static const _accent = Color(0xFF14B8A6);
  static const _dayOrder = ['SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  @override
  Widget build(BuildContext context) {
    // Group by day, preserving routine day order.
    final byDay = <String, List<TeacherClass>>{};
    for (final c in classes) {
      byDay.putIfAbsent(c.day, () => []).add(c);
    }
    final days = _dayOrder.where(byDay.containsKey).toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(title: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 28),
        children: [
          _header(),
          const SizedBox(height: 16),
          for (final day in days) ..._daySection(day, byDay[day]!),
        ],
      ),
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _accent.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: _accent.withValues(alpha: 0.25)),
        ),
        child: Row(
          children: [
            const Icon(Icons.calendar_month_rounded, color: _accent, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text('$acr · ${classes.length} class${classes.length == 1 ? '' : 'es'} per week',
                  style: const TextStyle(
                      color: AppColors.textBright, fontWeight: FontWeight.w700, fontSize: 13.5)),
            ),
          ],
        ),
      );

  List<Widget> _daySection(String day, List<TeacherClass> list) {
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(2, 4, 2, 8),
        child: Row(
          children: [
            Text(_title(day),
                style: const TextStyle(
                    color: AppColors.accentBright, fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.4)),
            const SizedBox(width: 8),
            Expanded(child: Container(height: 1, color: AppColors.border)),
            const SizedBox(width: 8),
            Text('${list.length}', style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
          ],
        ),
      ),
      ...list.map(_classCard),
      const SizedBox(height: 12),
    ];
  }

  Widget _classCard(TeacherClass c) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 62,
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            decoration: BoxDecoration(
              color: _accent.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Center(
              child: Text(c.time,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: _accent, fontWeight: FontWeight.w700, fontSize: 11.5, height: 1.2)),
            ),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(c.code,
                        style: const TextStyle(
                            color: AppColors.accentBright,
                            fontWeight: FontWeight.w800,
                            fontSize: 12.5,
                            fontFamily: 'monospace')),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Text('${c.batch}-${c.section}',
                          style: const TextStyle(
                              color: AppColors.textSecondary, fontSize: 10.5, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                if (c.courseName.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(c.courseName,
                      style: const TextStyle(color: AppColors.text, fontSize: 12.5, height: 1.3)),
                ],
                if (c.room.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      const Icon(Icons.meeting_room_outlined, size: 12, color: AppColors.muted),
                      const SizedBox(width: 4),
                      Text('Room ${c.room}',
                          style: const TextStyle(color: AppColors.muted, fontSize: 11)),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _title(String day) =>
      day.isEmpty ? day : day[0] + day.substring(1).toLowerCase();
}
