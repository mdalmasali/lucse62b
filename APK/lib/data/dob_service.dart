import '../core/worker_api.dart';
import 'session.dart';

enum DobResult { ok, wrong, error }

/// Date-of-birth verification against the LU portal (via the Worker), mirroring
/// auth.js. A DOB already LU-verified once (stored in Supabase) is trusted as a
/// fallback when the LU portal is temporarily down, so users are never locked
/// out by an outage.
class DobService {
  DobService._();
  static final instance = DobService._();

  final _worker = WorkerApi.instance;

  /// Verify [dob] (YYYY-MM-DD) for [studentId] with the LU portal.
  Future<DobResult> verify(String studentId, String dob) async {
    try {
      final res = await _worker.result(studentId, dob);
      if (res['success'] == true) return DobResult.ok;
      return DobResult.wrong;
    } catch (_) {
      return DobResult.error;
    }
  }

  /// Best-effort silent pass at startup: try the device-stored DOB, then the
  /// Supabase-stored DOB. Returns true if the gate can be passed silently.
  Future<bool> trySilent(String studentId) async {
    String? candidate = await Session.instance.storedDob(studentId);
    String? supaDob;
    if (await _worker.dobCheck(studentId)) {
      supaDob = await _worker.dobGet(studentId);
    }
    candidate ??= supaDob;
    if (candidate == null) return false;

    var r = await verify(studentId, candidate);
    if (r != DobResult.ok && supaDob != null && candidate == supaDob) {
      r = DobResult.ok; // trust previously-verified DOB during LU outage
    }
    if (r == DobResult.ok) {
      await Session.instance.markDobVerified(studentId, candidate);
      await _worker.dobSync(studentId, candidate);
      return true;
    }
    return false;
  }

  /// Verify a user-entered DOB and persist on success.
  Future<DobResult> submit(String studentId, String dob) async {
    final r = await verify(studentId, dob);
    if (r == DobResult.ok) {
      await Session.instance.markDobVerified(studentId, dob);
      await _worker.dobSync(studentId, dob);
    }
    return r;
  }
}
