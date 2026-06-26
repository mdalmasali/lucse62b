import 'package:supabase_flutter/supabase_flutter.dart';
import 'constants.dart';

/// Supabase access. The app does NOT use Supabase Auth — it uses the portal's
/// own session (student id + password verified via RPC). We use the anon client
/// only for postgrest (REST), RPC calls and realtime, exactly like the website.
class Supa {
  Supa._();

  static Future<void> init() async {
    await Supabase.initialize(
      url: K.supabaseUrl,
      // ignore: deprecated_member_use
      anonKey: K.supabaseAnonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;

  /// rpc: student_has_password({ p_student_id }) → bool
  static Future<bool> hasPassword(String studentId) async {
    final res = await client
        .rpc('student_has_password', params: {'p_student_id': studentId});
    return res == true;
  }

  /// rpc: verify_student_password({ p_student_id, p_password }) → bool
  static Future<bool> verifyPassword(String studentId, String password) async {
    final res = await client.rpc('verify_student_password',
        params: {'p_student_id': studentId, 'p_password': password});
    return res == true;
  }
}
