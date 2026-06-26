import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One downloaded file, recorded so it can be re-opened offline.
class DownloadEntry {
  final String fileId, name, path, mime, source;
  final int size;
  final DateTime savedAt;
  const DownloadEntry({
    required this.fileId,
    required this.name,
    required this.path,
    required this.mime,
    required this.source,
    required this.size,
    required this.savedAt,
  });

  Map<String, dynamic> toJson() => {
        'fileId': fileId,
        'name': name,
        'path': path,
        'mime': mime,
        'source': source,
        'size': size,
        'savedAt': savedAt.toIso8601String(),
      };

  static DownloadEntry fromJson(Map<String, dynamic> j) => DownloadEntry(
        fileId: '${j['fileId']}',
        name: '${j['name']}',
        path: '${j['path']}',
        mime: '${j['mime'] ?? ''}',
        source: '${j['source'] ?? ''}',
        size: (j['size'] is int) ? j['size'] as int : int.tryParse('${j['size']}') ?? 0,
        savedAt: DateTime.tryParse('${j['savedAt']}') ?? DateTime.now(),
      );
}

/// Downloads Google-Drive files into the app's storage and opens them with the
/// device's default viewer (PDF reader, etc.) via `open_filex`. Once saved, a
/// file opens instantly and works fully offline — no re-download, no Drive.
class DownloadService {
  DownloadService._();
  static final instance = DownloadService._();

  static const _indexKey = 'downloads_index_v1';

  Future<Directory> _dir() async {
    final base = await getApplicationDocumentsDirectory();
    final d = Directory('${base.path}/downloads');
    if (!await d.exists()) await d.create(recursive: true);
    return d;
  }

  Future<Map<String, dynamic>> _index() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_indexKey);
    if (raw == null) return {};
    try {
      return (jsonDecode(raw) as Map).cast<String, dynamic>();
    } catch (_) {
      return {};
    }
  }

  Future<void> _saveIndex(Map<String, dynamic> idx) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_indexKey, jsonEncode(idx));
  }

  /// Ids of everything currently downloaded (and still present on disk).
  Future<Set<String>> downloadedIds() async {
    final idx = await _index();
    final out = <String>{};
    for (final e in idx.entries) {
      final p = (e.value as Map)['path']?.toString() ?? '';
      if (p.isNotEmpty && await File(p).exists()) out.add(e.key);
    }
    return out;
  }

  Future<DownloadEntry?> entry(String fileId) async {
    final idx = await _index();
    final e = idx[fileId];
    if (e == null) return null;
    final ent = DownloadEntry.fromJson((e as Map).cast<String, dynamic>());
    if (!await File(ent.path).exists()) return null;
    return ent;
  }

  Future<bool> isDownloaded(String fileId) async => (await entry(fileId)) != null;

  /// Download [fileId] from Drive to local storage. Returns the saved entry, or
  /// null if it failed (e.g. a very large file that hits Drive's confirm page).
  Future<DownloadEntry?> download(
    String fileId,
    String name, {
    String mime = '',
    String source = '',
    void Function(double progress)? onProgress,
  }) async {
    try {
      final dir = await _dir();
      final safe = _ensureExt(_sanitize(name.isEmpty ? fileId : name), mime);
      final file = File('${dir.path}/${fileId}__$safe');
      final url = 'https://drive.google.com/uc?export=download&id=${Uri.encodeComponent(fileId)}';
      final client = http.Client();
      try {
        final resp = await client
            .send(http.Request('GET', Uri.parse(url)))
            .timeout(const Duration(seconds: 90));
        if (resp.statusCode != 200) return null;
        // A virus-scan / confirm interstitial comes back as HTML, not the file.
        final ct = (resp.headers['content-type'] ?? '').toLowerCase();
        if (ct.contains('text/html')) return null;
        final total = resp.contentLength ?? 0;
        final sink = file.openWrite();
        var received = 0;
        await for (final chunk in resp.stream) {
          sink.add(chunk);
          received += chunk.length;
          if (total > 0) onProgress?.call(received / total);
        }
        await sink.close();
        if (received == 0) {
          try { await file.delete(); } catch (_) {}
          return null;
        }
        final ent = DownloadEntry(
          fileId: fileId,
          name: name,
          path: file.path,
          mime: mime,
          source: source,
          size: received,
          savedAt: DateTime.now(),
        );
        final idx = await _index();
        idx[fileId] = ent.toJson();
        await _saveIndex(idx);
        return ent;
      } finally {
        client.close();
      }
    } catch (_) {
      return null;
    }
  }

  /// Open an already-downloaded file with the device's default app.
  Future<bool> open(String fileId) async {
    final ent = await entry(fileId);
    if (ent == null) return false;
    final r = await OpenFilex.open(ent.path);
    return r.type == ResultType.done;
  }

  Future<List<DownloadEntry>> list() async {
    final idx = await _index();
    final out = <DownloadEntry>[];
    for (final e in idx.values) {
      try {
        final ent = DownloadEntry.fromJson((e as Map).cast<String, dynamic>());
        if (await File(ent.path).exists()) out.add(ent);
      } catch (_) {}
    }
    out.sort((a, b) => b.savedAt.compareTo(a.savedAt));
    return out;
  }

  Future<void> delete(String fileId) async {
    final idx = await _index();
    final e = idx.remove(fileId);
    if (e != null) {
      try { await File((e as Map)['path'].toString()).delete(); } catch (_) {}
      await _saveIndex(idx);
    }
  }

  static String _sanitize(String name) =>
      name.replaceAll(RegExp(r'[^\w.\- ]'), '_').trim();

  static String _ensureExt(String name, String mime) {
    if (name.contains('.')) return name;
    final ext = _extFor(mime);
    return ext.isEmpty ? name : '$name.$ext';
  }

  static String _extFor(String mime) {
    final m = mime.toLowerCase();
    if (m == 'application/pdf') return 'pdf';
    if (m.contains('presentation') || m.contains('powerpoint')) return 'pptx';
    if (m.contains('word') || m.contains('document')) return 'docx';
    if (m.contains('sheet') || m.contains('excel')) return 'xlsx';
    if (m.startsWith('image/')) return m.split('/').last;
    if (m.contains('zip')) return 'zip';
    if (m.startsWith('video/')) return 'mp4';
    if (m.startsWith('audio/')) return 'mp3';
    if (m.startsWith('text/')) return 'txt';
    return '';
  }

  /// Human-readable size, e.g. "2.4 MB".
  static String prettySize(int bytes) {
    if (bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    var v = bytes.toDouble();
    var u = 0;
    while (v >= 1024 && u < units.length - 1) {
      v /= 1024;
      u++;
    }
    return '${v.toStringAsFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}';
  }
}
