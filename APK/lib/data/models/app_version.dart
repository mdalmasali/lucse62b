/// A row from the Supabase `app_updates` table describing a released build.
///
/// Versioning uses an integer [versionCode] (monotonic) for comparison and a
/// human [versionName] for display. [minVersionCode] drives FORCED updates:
/// if the installed build is below it, the app refuses to run until updated.
class AppVersion {
  final String versionName; // e.g. "1.2.0"
  final int versionCode; // e.g. 5
  final int minVersionCode; // forced-update threshold
  final String apkUrl; // direct .apk download URL
  final List<String> features; // "What's New"
  final List<String> fixes; // "Bug Fixes"

  const AppVersion({
    required this.versionName,
    required this.versionCode,
    required this.minVersionCode,
    required this.apkUrl,
    this.features = const [],
    this.fixes = const [],
  });

  factory AppVersion.fromJson(Map<String, dynamic> j) {
    List<String> list(dynamic v) {
      if (v is List) return v.map((e) => e.toString()).toList();
      return const [];
    }

    return AppVersion(
      versionName: (j['version_name'] ?? '').toString(),
      versionCode: (j['version_code'] is int)
          ? j['version_code'] as int
          : int.tryParse('${j['version_code']}') ?? 0,
      minVersionCode: (j['min_version_code'] is int)
          ? j['min_version_code'] as int
          : int.tryParse('${j['min_version_code']}') ?? 0,
      apkUrl: (j['apk_url'] ?? '').toString(),
      features: list(j['features']),
      fixes: list(j['fixes']),
    );
  }
}

/// Result of an update check against the installed build.
class UpdateStatus {
  final AppVersion? latest;
  final int currentCode;
  final bool updateAvailable;
  final bool forced; // installed build below min → block app

  const UpdateStatus({
    required this.latest,
    required this.currentCode,
    required this.updateAvailable,
    required this.forced,
  });

  static const none = UpdateStatus(
      latest: null, currentCode: 0, updateAvailable: false, forced: false);
}
