/// App-wide constants — backend endpoints & keys.
/// These mirror the website exactly so the app reuses the same backend.
class K {
  K._();

  static const supabaseUrl = 'https://ftvtlqxpalwvyserujuh.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0dnRscXhwYWx3dnlzZXJ1anVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA1MDgsImV4cCI6MjA5MzQ3NjUwOH0.kdmxzcqmOlCpMmjnvZPaOLIdfdLomrbMZBo4Nd5YecM';

  static const workerUrl = 'https://lucse62b-api.sy164425.workers.dev';

  /// The Worker allow-lists this origin; the native app sends it so the same
  /// portal endpoints work without a Worker change.
  static const portalOrigin = 'https://lucse62b.xyz';

  /// Demo account id (special-cased in login).
  static const demoStudentId = 'DEMO';

  /// Google Drive root folder for the class gallery.
  static const galleryFolderId = '1JRTVvX0Jy9gPdi1KUV7fh-6F6GDb4N9Z';

  /// Drive image URL for a file id at the given width.
  static String driveImage(String id, int width) =>
      'https://lh3.googleusercontent.com/d/$id=w$width';

  /// Attendance admin (mirrors auth.js isAttendanceAdmin check).
  static const attendanceAdminId = '0182320012101068';

  // ── Session keys (mirror localStorage keys from the web) ──
  static const ssStudent = 'lu62b_student';
  static const ssKeep = 'lu62b_keep';
  static const ssNotifLastSeen = 'lu62b_notif_last_seen';
  static const ssDobOkPrefix = 'lu62b_dob_ok_';
  static const ssDobPrefix = 'lu62b_dob_';

  static const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
}
