import 'dart:convert';
import 'package:http/http.dart' as http;
import 'constants.dart';

/// A fetched sheet tab: GVIZ column labels and parsed string rows.
class SheetTable {
  final List<String> cols;
  final List<List<String>> rows;
  const SheetTable({required this.cols, required this.rows});
}

/// One parsed group from a stacked Google Sheet tab (mirrors
/// script.js `parseStudentSheet`): a single-cell row starts a new group whose
/// next row is the header, and the remaining rows are the data.
class SheetGroup {
  final String title;
  final List<String> headers;
  final List<List<String>> rows;
  const SheetGroup({required this.title, required this.headers, required this.rows});
}

/// Fetches Google Sheet tabs via the Cloudflare Worker (GVIZ JSON) and parses
/// them. Same endpoints the website's sheets.js uses.
class SheetsApi {
  SheetsApi._();
  static final instance = SheetsApi._();

  // ── Session cache ──────────────────────────────────────────────────────────
  // Sheet data is effectively static within an app session, yet every screen
  // re-fetched it on each visit (slow, repeated GVIZ round-trips). We memoise
  // the in-flight/last future per request key for a short TTL so re-navigating
  // is instant and concurrent identical requests are de-duplicated. A failed
  // fetch evicts itself so transient errors don't get pinned.
  static const Duration _ttl = Duration(minutes: 5);
  final Map<String, ({DateTime at, Future<dynamic> future})> _cache = {};

  Future<T> _cached<T>(String key, Future<T> Function() build) {
    final hit = _cache[key];
    if (hit != null && DateTime.now().difference(hit.at) < _ttl) {
      return hit.future as Future<T>;
    }
    late final Future<T> f;
    f = () async {
      try {
        return await build();
      } catch (e) {
        if (identical(_cache[key]?.future, f)) _cache.remove(key);
        rethrow;
      }
    }();
    _cache[key] = (at: DateTime.now(), future: f);
    return f;
  }

  /// Drop all cached sheet responses so the next fetch hits the network.
  /// Call this from pull-to-refresh handlers.
  void clearCache() => _cache.clear();

  /// A fetched sheet: GVIZ column labels + parsed string rows.
  Future<SheetTable> _fetch(String path) => _cached('fetch:$path', () => _fetchRaw(path));

  Future<SheetTable> _fetchRaw(String path) async {
    final r = await http
        .get(Uri.parse('${K.workerUrl}$path'),
            headers: const {'Origin': K.portalOrigin})
        .timeout(const Duration(seconds: 12));
    if (r.statusCode != 200) throw Exception('sheet ${r.statusCode}');
    final json = jsonDecode(r.body) as Map<String, dynamic>;
    final table = json['table'] as Map<String, dynamic>?;
    final cols = ((table?['cols'] as List?) ?? const [])
        .map<String>((c) => ((c as Map)['label'] ?? '').toString().trim())
        .toList();
    final rows = ((table?['rows'] as List?) ?? const [])
        .map<List<String>>((row) {
      final cells = ((row as Map)['c'] as List?) ?? const [];
      return cells.map<String>((c) {
        if (c == null) return '';
        final m = c as Map;
        final v = m['v'];
        final f = m['f'];
        // Prefer the formatted string (dates/times already pretty).
        if (f != null && f.toString().isNotEmpty) return f.toString();
        if (v == null) return '';
        return _gvizValue(v.toString());
      }).toList();
    }).toList();
    return SheetTable(cols: cols, rows: rows);
  }

  /// Convert GVIZ "Date(y,m,d[,h,mi,s])" sentinels to a readable string.
  static String _gvizValue(String s) {
    final m = RegExp(r'^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+))?').firstMatch(s);
    if (m == null) return s;
    final y = int.parse(m[1]!);
    final mo = int.parse(m[2]!); // 0-based month
    final d = int.parse(m[3]!);
    if (m[4] != null) {
      var h = int.parse(m[4]!);
      final mi = int.parse(m[5]!);
      final ap = h >= 12 ? 'PM' : 'AM';
      h = h % 12 == 0 ? 12 : h % 12;
      return '$h:${mi.toString().padLeft(2, '0')} $ap';
    }
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '$d ${months[mo % 12]} $y';
  }

  Future<List<List<String>>> sheet(String name) async =>
      (await _fetch('/sheet?name=${Uri.encodeComponent(name)}')).rows;

  /// Raw rows from a "bot" spreadsheet tab (AutoBOT, Deadlines) — same as the
  /// site's fetchBotSheet (`&type=bot`). Returns un-prettified cell values so
  /// callers keep the GVIZ `Date(y,m,d,h,mi,s)` sentinels for countdowns.
  Future<List<List<String>>> botSheetRaw(String name) =>
      _cached('bot:$name', () => _botSheetRawNet(name));

  Future<List<List<String>>> _botSheetRawNet(String name) async {
    final r = await http
        .get(Uri.parse('${K.workerUrl}/sheet?name=${Uri.encodeComponent(name)}&type=bot'),
            headers: const {'Origin': K.portalOrigin})
        .timeout(const Duration(seconds: 12));
    if (r.statusCode != 200) throw Exception('bot sheet ${r.statusCode}');
    final json = jsonDecode(r.body) as Map<String, dynamic>;
    final table = json['table'] as Map<String, dynamic>?;
    return ((table?['rows'] as List?) ?? const []).map<List<String>>((row) {
      final cells = ((row as Map)['c'] as List?) ?? const [];
      return cells
          .map<String>((c) => c == null ? '' : (((c as Map)['v'])?.toString() ?? ''))
          .toList();
    }).toList();
  }

  Future<SheetTable> sheetTable(String name) =>
      _fetch('/sheet?name=${Uri.encodeComponent(name)}');

  Future<List<List<String>>> byId(String id, {String? tab, bool raw = false}) async =>
      (await tableById(id, tab: tab, raw: raw)).rows;

  Future<SheetTable> tableById(String id, {String? tab, bool raw = false}) {
    var q = '/fetch?id=${Uri.encodeComponent(id)}';
    if (tab != null) q += '&sheet=${Uri.encodeComponent(tab)}';
    if (raw) q += '&raw=1';
    return _fetch(q);
  }

  /// Parse stacked groups (title row → header row → data rows).
  static List<SheetGroup> parseGroups(List<List<String>> rows) {
    final groups = <SheetGroup>[];
    String? title;
    List<String>? headers;
    List<List<String>> data = [];

    void flush() {
      final h = headers;
      final t = title;
      if (t != null && h != null && h.isNotEmpty) {
        groups.add(SheetGroup(title: t, headers: h, rows: data));
      }
    }

    for (final raw in rows) {
      final values = _trimTrailing(raw);
      if (values.isEmpty) continue;
      if (values.length == 1) {
        flush();
        title = values[0];
        headers = null;
        data = [];
        continue;
      }
      if (title == null) continue;
      if (headers == null) {
        headers = values;
        continue;
      }
      final h = headers;
      data.add(
          List.generate(h.length, (i) => i < values.length ? values[i] : ''));
    }
    flush();
    return groups;
  }

  static List<String> _trimTrailing(List<String> cells) {
    var end = cells.length;
    while (end > 0 && cells[end - 1].trim().isEmpty) {
      end--;
    }
    return cells.sublist(0, end).map((e) => e.trim()).toList();
  }
}
