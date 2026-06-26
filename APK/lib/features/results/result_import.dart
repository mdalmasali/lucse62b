import 'dart:convert';

/// Client-side parser for a saved / copied LU result page — a Dart port of the
/// website's result-dashboard.html (`importParse` → `parseLuResult` /
/// `parseLuResultText`). LU's live result page now sits behind a CAPTCHA, so the
/// student opens it once, copies the result, and pastes it here; the parsed JSON
/// is sent to the Worker's `/result-import` and served on future loads.
///
/// Returns a map shaped like the live `/result` payload:
/// `{ success, student: {...}, results: { year: [ {name, gpa, credit, courses[]} ] } }`.
Map<String, dynamic> importParse(String raw) {
  final html = _mhtmlToHtml(raw) ?? raw;
  final fromHtml = _parseLuResultHtml(html);
  if (fromHtml['success'] == true) return fromHtml;
  return _parseLuResultText(raw);
}

String _strip(String s) => s
    .replaceAll(RegExp(r'<[^>]+>'), '')
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', ' ')
    .replaceAll(RegExp(r'&#0?39;|&apos;'), "'")
    .replaceAll('&quot;', '"')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// Parse server-rendered LU result HTML (saved "HTML only" / pasted source).
Map<String, dynamic> _parseLuResultHtml(String html) {
  final student = <String, dynamic>{};
  final cardM = RegExp(
          r'<table[^>]*>(?:(?!</table>)[\s\S])*?Student ID(?:(?!</table>)[\s\S])*?</table>',
          caseSensitive: false)
      .firstMatch(html);
  if (cardM != null) {
    final cells = RegExp(r'<(th|td)[^>]*>([\s\S]*?)</\1>', caseSensitive: false)
        .allMatches(cardM.group(0)!)
        .map((m) => _strip(m.group(2)!))
        .toList();
    const map = {
      'studentid': 'id', 'name': 'name', 'semester': 'semester', 'program': 'degree',
      'department': 'department', 'creditcompleted': 'credit', 'cgpa': 'cgpa', 'grade': 'grade',
    };
    for (var i = 0; i < cells.length - 1; i++) {
      final k = cells[i].toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
      if (map.containsKey(k)) {
        student[map[k]!] = cells[i + 1];
        i++;
      }
    }
  }

  final results = <String, List<Map<String, dynamic>>>{};
  final tableRe = RegExp(
      r'<table[^>]*class="[^"]*result-table[^"]*"[^>]*>([\s\S]*?)</table>',
      caseSensitive: false);
  for (final tm in tableRe.allMatches(html)) {
    final before = html.substring(0, tm.start);
    final hMatches =
        RegExp(r'<h2[^>]*>([\s\S]*?)</h2>', caseSensitive: false).allMatches(before).toList();
    final semName = hMatches.isNotEmpty ? _strip(hMatches.last.group(1)!) : 'Semester';
    final ym = RegExp(r'(20\d{2})').firstMatch(semName);
    final year = ym != null ? ym.group(1)! : 'Other';
    final bodyM =
        RegExp(r'<tbody[^>]*>([\s\S]*?)</tbody>', caseSensitive: false).firstMatch(tm.group(1)!);
    final body = bodyM != null ? bodyM.group(1)! : tm.group(1)!;
    final courses = <Map<String, dynamic>>[];
    double gpSum = 0, crSum = 0;
    for (final r in RegExp(r'<tr[^>]*>([\s\S]*?)</tr>', caseSensitive: false).allMatches(body)) {
      final tds = RegExp(r'<td[^>]*>([\s\S]*?)</td>', caseSensitive: false)
          .allMatches(r.group(1)!)
          .map((m) => _strip(m.group(1)!))
          .toList();
      if (tds.length < 5) continue;
      final code = tds[0];
      if (code.isEmpty || RegExp(r'course\s*code', caseSensitive: false).hasMatch(code)) continue;
      final credit = double.tryParse(tds[2]) ?? 0;
      final gp = double.tryParse(tds[3]) ?? 0;
      courses.add({
        'course_code': code,
        'course_title': tds[1],
        'credit': credit,
        'gpa': gp,
        'grade': tds[4],
      });
      gpSum += gp * credit;
      crSum += credit;
    }
    if (courses.isEmpty) continue;
    (results[year] ??= []).add({
      'name': semName,
      'gpa': crSum > 0 ? double.parse((gpSum / crSum).toStringAsFixed(2)) : 0,
      'credit': crSum,
      'grade': '',
      'courses': courses,
    });
  }

  final id = (student['id'] ?? '').toString();
  return {'success': id.isNotEmpty && results.isNotEmpty, 'student': student, 'results': results};
}

/// Parse "Select All → Copy" text from the LU result page (tab/space separated).
Map<String, dynamic> _parseLuResultText(String text) {
  text = text.replaceAll('\r', '').replaceAll(' ', ' ');
  final lines = text
      .split('\n')
      .map((l) => l.replaceAll('\t', ' ').replaceAll(RegExp(r' {2,}'), ' ').trim())
      .where((l) => l.isNotEmpty)
      .toList();
  final all = lines.join('\n');
  String grab(RegExp re) {
    final m = re.firstMatch(all);
    return m != null ? m.group(1)!.trim() : '';
  }

  final student = <String, dynamic>{
    'id': grab(RegExp(r'Student\s*ID[^0-9]{0,6}(\d{8,16})', caseSensitive: false)),
    'cgpa': grab(RegExp(r'CGPA[^0-9]{0,8}([\d.]+)', caseSensitive: false)),
    'credit': grab(RegExp(r'Credit\s*Completed[^0-9]{0,8}([\d.]+)', caseSensitive: false)),
    'name': grab(RegExp(
        r'\bName\b[:\s]+([A-Za-z][A-Za-z.\- ]{2,60}?)(?:\s+Semester|\s+Program|\s+Department|\n|$)',
        caseSensitive: false)),
  };

  final results = <String, List<Map<String, dynamic>>>{};
  final semRe = RegExp(r'\b(Spring|Summer|Fall)\s*[-–]?\s*(20\d{2})\b', caseSensitive: false);
  final courseRe = RegExp(
      r'^([A-Za-z]{2,4}[-\s]?\d{3,4})\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+(A\+|A-|A|B\+|B-|B|C\+|C|D|F)(?=\s|$)',
      caseSensitive: false);
  Map<String, dynamic>? curSem;
  for (final l in lines) {
    final sm = semRe.firstMatch(l);
    if (sm != null && l.replaceAll(semRe, '').replaceAll(RegExp(r'[^a-zA-Z]'), '').length < 3) {
      curSem = {'name': '${sm.group(1)} - ${sm.group(2)}', 'courses': <Map<String, dynamic>>[]};
      (results[sm.group(2)!] ??= []).add(curSem);
      continue;
    }
    final cm = courseRe.firstMatch(l);
    if (cm != null && curSem != null) {
      (curSem['courses'] as List).add({
        'course_code': cm.group(1)!.toUpperCase().replaceAll(RegExp(r'\s+'), '-'),
        'course_title': cm.group(2)!.trim(),
        'credit': double.tryParse(cm.group(3)!) ?? 0,
        'gpa': double.tryParse(cm.group(4)!) ?? 0,
        'grade': cm.group(5)!.toUpperCase(),
      });
    }
  }

  for (final semList in results.values) {
    for (final s in semList) {
      double g = 0, c = 0;
      for (final x in (s['courses'] as List)) {
        g += (x['gpa'] as num) * (x['credit'] as num);
        c += (x['credit'] as num);
      }
      s['gpa'] = c > 0 ? double.parse((g / c).toStringAsFixed(2)) : 0;
      s['credit'] = c;
      s['grade'] = '';
    }
  }
  for (final y in results.keys.toList()) {
    results[y] = results[y]!.where((s) => (s['courses'] as List).isNotEmpty).toList();
    if (results[y]!.isEmpty) results.remove(y);
  }

  final id = (student['id'] ?? '').toString();
  return {'success': id.isNotEmpty && results.isNotEmpty, 'student': student, 'results': results};
}

/// Android Chrome "Download page" saves .mhtml — pull the HTML part out. Returns
/// null when the input isn't an MHTML document.
String? _mhtmlToHtml(String raw) {
  if (!RegExp(r'content-type:\s*multipart/related', caseSensitive: false).hasMatch(raw) &&
      !RegExp(r'^(From:|MIME-Version:)', caseSensitive: false, multiLine: true).hasMatch(raw)) {
    return null;
  }
  final bm = RegExp(r'boundary="?([^";\r\n]+)"?', caseSensitive: false).firstMatch(raw);
  if (bm == null) return null;
  for (final part in raw.split('--${bm.group(1)}')) {
    if (!RegExp(r'content-type:\s*text/html', caseSensitive: false).hasMatch(part)) continue;
    final enc =
        (RegExp(r'content-transfer-encoding:\s*([\w-]+)', caseSensitive: false).firstMatch(part)?.group(1)) ??
            '';
    final idx = part.indexOf(RegExp(r'\r?\n\r?\n'));
    if (idx < 0) continue;
    var body = part.substring(idx).replaceFirst(RegExp(r'^\r?\n\r?\n'), '');
    if (RegExp(r'quoted-printable', caseSensitive: false).hasMatch(enc)) {
      body = _decodeQuotedPrintable(body);
    } else if (RegExp(r'base64', caseSensitive: false).hasMatch(enc)) {
      try {
        body = utf8.decode(base64.decode(body.replaceAll(RegExp(r'\s+'), '')));
      } catch (_) {}
    }
    return body;
  }
  return null;
}

String _decodeQuotedPrintable(String s) {
  s = s.replaceAll(RegExp(r'=\r?\n'), '');
  final bytes = <int>[];
  for (var i = 0; i < s.length; i++) {
    if (s[i] == '=' &&
        i + 2 < s.length &&
        RegExp(r'^[0-9A-Fa-f]{2}$').hasMatch(s.substring(i + 1, i + 3))) {
      bytes.add(int.parse(s.substring(i + 1, i + 3), radix: 16));
      i += 2;
    } else {
      bytes.add(s.codeUnitAt(i) & 0xff);
    }
  }
  try {
    return utf8.decode(bytes);
  } catch (_) {
    return s;
  }
}
