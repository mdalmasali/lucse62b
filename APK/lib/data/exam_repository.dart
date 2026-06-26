import '../core/sheets_api.dart';

class ExamItem {
  final String course;
  final String courseName; // from CPG_Courses (code → title)
  final String date; // dd-mm-yyyy (normalized)
  final String time;
  final String weekday;
  final String dayLabel; // e.g. "Day-1"
  final DateTime? dateObj;
  const ExamItem({
    required this.course,
    this.courseName = '',
    required this.date,
    required this.time,
    required this.weekday,
    this.dayLabel = '',
    this.dateObj,
  });
}

/// Parses the mid/final term exam routine. Unlike the class routine, the exam
/// sheet is a single transposed block: header rows give Day-N / date / time /
/// weekday per column, then each (batch, section) row holds the exam cell for
/// every day column. Mirrors exam.js.
class ExamRepository {
  ExamRepository._();
  static final instance = ExamRepository._();

  final _api = SheetsApi.instance;

  Future<List<String>> _ids(String keyword) async {
    try {
      final rows = await _api.sheet('Routine');
      for (final row in rows) {
        if (row.isEmpty) continue;
        if (!row[0].toLowerCase().contains(keyword.toLowerCase())) continue;
        final ids = <String>[];
        for (final cell in row) {
          final m = RegExp(r'spreadsheets/d/([a-zA-Z0-9_-]+)').firstMatch(cell);
          if (m != null && !ids.contains(m.group(1))) ids.add(m.group(1)!);
        }
        return ids;
      }
    } catch (_) {}
    return const [];
  }

  Map<String, String>? _titles;

  Future<Map<String, String>> _courseTitles() async {
    if (_titles != null) return _titles!;
    final map = <String, String>{};
    try {
      final rows = await _api.sheet('CPG_Courses');
      for (final r in rows) {
        if (r.length < 2) continue;
        final code = r[1].trim().toUpperCase();
        final title = r[0].trim();
        if (code.isEmpty || ['code', 'title', 'course'].contains(r[1].trim().toLowerCase())) continue;
        if (title.isNotEmpty) map[code] = title;
      }
    } catch (_) {}
    return _titles = map;
  }

  /// [type] is 'mid' or 'final'.
  Future<List<ExamItem>> load(String type,
      {String batch = '62', String section = 'B'}) async {
    final keyword = type == 'final' ? 'final term' : 'mid term';
    final res = await Future.wait([_ids(keyword), _courseTitles()]);
    final ids = res[0] as List<String>;
    final titles = res[1] as Map<String, String>;
    if (ids.isEmpty) return const [];

    final allRows = <List<String>>[];
    for (final id in ids) {
      try {
        final t = await _api.tableById(id, raw: true);
        allRows.addAll(t.rows);
      } catch (_) {}
    }
    if (allRows.isEmpty) return const [];
    return _parse(allRows, batch, section, titles);
  }

  List<ExamItem> _parse(
      List<List<String>> rows, String batch, String section, Map<String, String> titles) {
    final dateRe = RegExp(r'^\s*\d{1,2}[-/]\d{1,2}[-/]\d{4}');
    final timeRe = RegExp(r'\d{1,2}:\d{2}');

    int findRow(bool Function(List<String>) test) {
      for (var i = 0; i < rows.length; i++) {
        if (test(rows[i])) return i;
      }
      return -1;
    }

    final headerIdx =
        findRow((r) => r.isNotEmpty && r[0].toLowerCase().trim() == 'batch');
    if (headerIdx < 0) return const [];

    final dayIdx = findRow((r) => r.any((c) => RegExp(r'day[\s-]*\d+', caseSensitive: false).hasMatch(c)));
    final dateIdx = findRow((r) => r.any((c) => dateRe.hasMatch(c)));
    final timeIdx = findRow((r) => r.any((c) => timeRe.hasMatch(c)));
    final weekdayIdx = findRow((r) =>
        r.any((c) => RegExp(r'^(sun|mon|tue|wed|thu|fri|sat)', caseSensitive: false).hasMatch(c.trim())));

    final header = rows[headerIdx];
    final dateRow = dateIdx >= 0 ? rows[dateIdx] : const <String>[];
    final timeRow = timeIdx >= 0 ? rows[timeIdx] : const <String>[];
    final dayRow = dayIdx >= 0 ? rows[dayIdx] : const <String>[];
    final weekdayRow = weekdayIdx >= 0 ? rows[weekdayIdx] : const <String>[];

    // Day columns start at index 2 (after Batch, Section).
    final dayCols = <int>[];
    for (var c = 2; c < header.length; c++) {
      final hasDate = c < dateRow.length && dateRe.hasMatch(dateRow[c]);
      final hasDay = c < dayRow.length &&
          RegExp(r'day[\s-]*\d+', caseSensitive: false).hasMatch(dayRow[c]);
      if (hasDate || hasDay || (c < header.length && header[c].trim().isNotEmpty)) {
        dayCols.add(c);
      }
    }

    final out = <ExamItem>[];
    var curBatch = '';
    for (var r = headerIdx + 1; r < rows.length; r++) {
      final row = rows[r];
      if (row.isEmpty) continue;
      final b = row[0].replaceAll(RegExp(r'\.0+$'), '').trim();
      if (b.isNotEmpty) curBatch = b;
      final sec = row.length > 1 ? row[1].trim().toUpperCase() : '';
      if (curBatch != batch || sec != section) continue;

      for (final c in dayCols) {
        var cell = c < row.length ? row[c].trim() : '';
        if (cell.isEmpty || cell == '-' || cell == '--' || cell == '–') continue;
        // Strip a trailing "(2)" credit marker like the website does.
        cell = cell.replaceAll(RegExp(r'\s*\(\d+\)\s*'), '').trim();
        if (cell.isEmpty) continue;
        final date = dateRow.length > c ? _normDate(dateRow[c]) : '';
        final wd = weekdayRow.length > c ? weekdayRow[c].trim() : '';
        out.add(ExamItem(
          course: cell,
          courseName: titles[cell.toUpperCase()] ?? '',
          date: date,
          time: timeRow.length > c ? timeRow[c].trim() : '',
          weekday: wd.isNotEmpty ? wd : (header.length > c ? header[c].trim() : ''),
          dayLabel: dayRow.length > c ? dayRow[c].trim() : '',
          dateObj: _dateObj(date),
        ));
      }
      break; // section row found
    }

    out.sort((a, b) {
      if (a.dateObj == null || b.dateObj == null) return 0;
      return a.dateObj!.compareTo(b.dateObj!);
    });
    return out;
  }

  String _normDate(String s) {
    final m = RegExp(r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})').firstMatch(s);
    if (m == null) return s.trim();
    return '${m[1]!.padLeft(2, '0')}-${m[2]!.padLeft(2, '0')}-${m[3]}';
  }

  DateTime? _dateObj(String s) {
    final m = RegExp(r'(\d{1,2})-(\d{1,2})-(\d{4})').firstMatch(s);
    if (m == null) return null;
    return DateTime(int.parse(m[3]!), int.parse(m[2]!), int.parse(m[1]!));
  }
}
