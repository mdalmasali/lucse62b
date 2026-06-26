/// All fields needed to render an assignment / lab-report cover page.
class CoverData {
  final String template; // 't1' (modern) | 't2' (classic)
  final String docType; // 'Assignment' | 'Lab Report'
  final bool isGroup;

  final String courseTitle;
  final String courseCode;
  final String no; // assignment / lab report number
  final String topic;

  // Submitted To
  final String teacherName;
  final String designation;
  final String department;

  // Submitted By (single)
  final String studentName;
  final String studentId;

  // Common
  final String batch;
  final String section;
  final String date;

  // Submitted By (group)
  final List<({String name, String id})> members;

  const CoverData({
    required this.template,
    required this.docType,
    required this.isGroup,
    required this.courseTitle,
    required this.courseCode,
    required this.no,
    required this.topic,
    required this.teacherName,
    required this.designation,
    required this.department,
    required this.studentName,
    required this.studentId,
    required this.batch,
    required this.section,
    required this.date,
    required this.members,
  });

  String get noLabel => docType == 'Lab Report' ? 'Lab Report No' : 'Assignment No';
}
