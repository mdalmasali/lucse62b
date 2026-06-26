import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Downloads an APK and launches the system installer. Replaces the ota_update
/// plugin (whose install intent was unreliable) with a self-controlled
/// download + open_filex open, which uses its own FileProvider to grant the
/// installer read access to the file.
class ApkInstaller {
  /// Streams [url] to a file, reporting progress 0..1, then opens the installer.
  /// Returns null on success or an error message on failure.
  static Future<String?> downloadAndInstall(
    String url,
    String filename, {
    required void Function(double progress) onProgress,
  }) async {
    try {
      final dir = await getExternalStorageDirectory() ??
          await getApplicationSupportDirectory();
      final file = File('${dir.path}/$filename');
      if (await file.exists()) await file.delete();

      final resp = await http.Client().send(http.Request('GET', Uri.parse(url)));
      if (resp.statusCode != 200) {
        return 'Download failed (HTTP ${resp.statusCode}).';
      }

      final total = resp.contentLength ?? 0;
      var received = 0;
      final sink = file.openWrite();
      await for (final chunk in resp.stream) {
        sink.add(chunk);
        received += chunk.length;
        if (total > 0) onProgress(received / total);
      }
      await sink.flush();
      await sink.close();

      onProgress(1.0);
      final result = await OpenFilex.open(
        file.path,
        type: 'application/vnd.android.package-archive',
      );
      if (result.type != ResultType.done) {
        return 'Could not open installer (${result.message}). '
            'Tap the downloaded file in your Downloads/Files app to install.';
      }
      return null;
    } catch (e) {
      return 'Update failed: $e';
    }
  }
}
