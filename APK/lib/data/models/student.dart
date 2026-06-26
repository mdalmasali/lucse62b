/// The logged-in student session — mirrors the web's `lu62b_student` object:
/// { id, name, loginTime, isDemo }
class Student {
  final String id;
  final String name;
  final int loginTime;
  final bool isDemo;

  const Student({
    required this.id,
    required this.name,
    required this.loginTime,
    this.isDemo = false,
  });

  bool get isAttendanceAdmin => id == '0182320012101068';

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'loginTime': loginTime,
        'isDemo': isDemo,
      };

  factory Student.fromJson(Map<String, dynamic> j) => Student(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? 'Student').toString(),
        loginTime: (j['loginTime'] is int)
            ? j['loginTime'] as int
            : int.tryParse('${j['loginTime']}') ?? DateTime.now().millisecondsSinceEpoch,
        isDemo: j['isDemo'] == true ||
            (j['id'] ?? '').toString().toUpperCase() == 'DEMO',
      );

  factory Student.create(String id, String name, {bool isDemo = false}) => Student(
        id: id,
        name: name,
        loginTime: DateTime.now().millisecondsSinceEpoch,
        isDemo: isDemo,
      );

  /// Two-letter initials for avatars (mirrors login.js `initials`).
  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts
        .take(2)
        .map((w) => w.isNotEmpty ? w[0].toUpperCase() : '')
        .join();
  }
}
