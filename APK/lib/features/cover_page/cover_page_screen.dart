import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:printing/printing.dart';

import '../../core/app_colors.dart';
import '../../data/session.dart';
import '../../shared/app_toast.dart';
import '../../shared/gradient_button.dart';
import '../../shared/suggest_field.dart';
import 'cover_data.dart';
import 'cover_pdf.dart';
import 'cover_suggestions.dart';

class CoverPageScreen extends StatefulWidget {
  const CoverPageScreen({super.key});

  @override
  State<CoverPageScreen> createState() => _CoverPageScreenState();
}

class _CoverPageScreenState extends State<CoverPageScreen> {
  String _template = 't1';
  String _docType = 'Assignment';
  bool _group = false;
  bool _busy = false;

  final _sugg = CoverSuggestions();
  List<Suggestion> _topicSuggestions = [];
  Timer? _topicDebounce;

  final _courseTitle = TextEditingController();
  final _courseCode = TextEditingController();
  final _no = TextEditingController();
  final _topic = TextEditingController();
  final _teacher = TextEditingController();
  final _desig = TextEditingController();
  final _dept = TextEditingController(text: 'Department of Computer Science & Engineering');
  final _name = TextEditingController();
  final _sid = TextEditingController();
  final _date = TextEditingController();
  String _batch = '62nd';
  String _section = 'B';
  final List<({TextEditingController name, TextEditingController id})> _members = [];

  @override
  void initState() {
    super.initState();
    final s = Session.instance.student;
    if (s != null && !s.isDemo) {
      _name.text = s.name;
      _sid.text = s.id;
    }
    _date.text = _formatDateNice(DateTime.now());
    // First group member defaults to the logged-in user (like the site).
    _addMember(name: _name.text, id: _sid.text);
    _courseCode.addListener(_scheduleTopicRefresh);
    _no.addListener(_scheduleTopicRefresh);
    _sugg.load().then((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _topicDebounce?.cancel();
    for (final c in [
      _courseTitle, _courseCode, _no, _topic, _teacher, _desig, _dept,
      _name, _sid, _date,
    ]) {
      c.dispose();
    }
    for (final m in _members) {
      m.name.dispose();
      m.id.dispose();
    }
    super.dispose();
  }

  String get _docTypeKey => _docType == 'Lab Report' ? 'lab' : 'assignment';

  void _scheduleTopicRefresh() {
    _topicDebounce?.cancel();
    _topicDebounce = Timer(const Duration(milliseconds: 350), _refreshTopics);
  }

  Future<void> _refreshTopics() async {
    final list = await _sugg.topicsFor(
        _courseCode.text.trim(), _docTypeKey, _no.text.trim());
    if (mounted) setState(() => _topicSuggestions = list);
  }

  /// Ordinal date like the site: "24th June 2026".
  static String _formatDateNice(DateTime d) {
    final day = d.day;
    final m10 = day % 10, m100 = day % 100;
    final suf = (m100 >= 11 && m100 <= 13)
        ? 'th'
        : m10 == 1
            ? 'st'
            : m10 == 2
                ? 'nd'
                : m10 == 3
                    ? 'rd'
                    : 'th';
    const mo = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    return '$day$suf ${mo[d.month - 1]} ${d.year}';
  }

  void _addMember({String name = '', String id = ''}) => setState(() => _members.add((
        name: TextEditingController(text: name),
        id: TextEditingController(text: id),
      )));

  CoverData _collect() => CoverData(
        template: _template,
        docType: _docType,
        isGroup: _group,
        courseTitle: _courseTitle.text.trim(),
        courseCode: _courseCode.text.trim(),
        no: _no.text.trim(),
        topic: _topic.text.trim(),
        teacherName: _teacher.text.trim(),
        designation: _desig.text.trim(),
        department: _dept.text.trim(),
        studentName: _name.text.trim(),
        studentId: _sid.text.trim(),
        batch: _batch,
        section: _section,
        date: _date.text.trim(),
        members: _members
            .map((m) => (name: m.name.text.trim(), id: m.id.text.trim()))
            .toList(),
      );

  String _fileName() {
    final code = _courseCode.text.trim().replaceAll(RegExp(r'[^A-Za-z0-9\-]'), '');
    final base = code.isEmpty ? 'CoverPage' : code;
    return '${_docType.replaceAll(' ', '_')}_$base.pdf';
  }

  /// [print] = true opens the print dialog; false opens the share/save sheet
  /// (Save to Files, WhatsApp, Drive, …) — the "Download" action.
  Future<void> _export({required bool print}) async {
    if (_courseTitle.text.trim().isEmpty) {
      AppToast.show(context, 'Please enter the course title', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      final bytes = await CoverPdf.build(_collect());
      if (!mounted) return;
      final name = _fileName();
      if (print) {
        await Printing.layoutPdf(onLayout: (_) async => bytes, name: name);
      } else {
        await Printing.sharePdf(bytes: bytes, filename: name);
      }
      // Remember the topic for next time (logged-in students only).
      final s = Session.instance.student;
      if (s != null && !s.isDemo) {
        _sugg.saveTopic(_courseCode.text.trim(), _docTypeKey, _no.text.trim(),
            _topic.text.trim(), s.id);
      }
    } catch (e) {
      if (mounted) AppToast.show(context, 'Could not generate PDF', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Cover Page'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          _templatePicker(),
          const SizedBox(height: 14),
          _docTypeSelector(),
          const SizedBox(height: 14),
          _sectionLabel('Document'),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SuggestField(
              controller: _courseTitle,
              label: 'Course Title',
              hint: 'e.g. Computer Network Sessional',
              suggestions: () => _sugg.courses,
              onPicked: (s) {
                final c = s.data;
                if (c is CourseInfo) {
                  if (c.code.isNotEmpty) _courseCode.text = c.code;
                  if (c.teacher.isNotEmpty) _teacher.text = c.teacher;
                  if (c.designation.isNotEmpty) _desig.text = c.designation;
                  if (c.department.isNotEmpty) _dept.text = c.department;
                  setState(() {});
                }
              },
            ),
          ),
          _field(_courseCode, 'Course Code', hint: 'e.g. CSE-3232'),
          _field(_no, _docType == 'Lab Report' ? 'Lab Report No' : 'Assignment No',
              hint: 'e.g. 06'),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SuggestField(
              controller: _topic,
              label: 'Topic',
              hint: 'e.g. Dynamic Routing',
              showAllOnFocus: true,
              suggestions: () => _topicSuggestions,
            ),
          ),
          _sectionLabel('Submitted To'),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: SuggestField(
              controller: _teacher,
              label: 'Teacher Name',
              suggestions: () => _sugg.teachers,
              onPicked: (s) {
                final t = s.data;
                if (t is TeacherInfo) {
                  if (t.designation.isNotEmpty) _desig.text = t.designation;
                  if (t.department.isNotEmpty) _dept.text = t.department;
                  setState(() {});
                }
              },
            ),
          ),
          _field(_desig, 'Designation', hint: 'e.g. Lecturer'),
          _field(_dept, 'Department'),
          _sectionLabel('Submitted From'),
          if (!_group) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SuggestField(
                controller: _name,
                label: 'Your Name',
                suggestions: () => _sugg.students,
                onPicked: (s) {
                  final id = s.data;
                  if (id is String && id.isNotEmpty) _sid.text = id;
                  setState(() {});
                },
              ),
            ),
            _field(_sid, 'Student ID'),
          ],
          Row(
            children: [
              Expanded(child: _dropdown('Batch', _batch, _batches, (v) => setState(() => _batch = v!))),
              const SizedBox(width: 10),
              Expanded(child: _dropdown('Section', _section, _sections, (v) => setState(() => _section = v!))),
            ],
          ),
          if (_group) ...[
            const SizedBox(height: 14),
            _sectionLabel('Group Members'),
            ..._members.asMap().entries.map((e) => _memberRow(e.key, e.value)),
            const SizedBox(height: 4),
            TextButton.icon(
              onPressed: _addMember,
              icon: const Icon(Icons.add, size: 18, color: AppColors.accentBright),
              label: const Text('Add Member',
                  style: TextStyle(color: AppColors.accentBright)),
            ),
          ],
          _sectionLabel('Submission'),
          _field(_date, 'Date of Submission', hint: 'e.g. 25th April 2026'),
          const SizedBox(height: 18),
          GradientButton(
            label: 'Download PDF',
            icon: Icons.file_download_rounded,
            busy: _busy,
            onPressed: () => _export(print: false),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => _export(print: true),
            icon: const Icon(Icons.print_rounded, color: AppColors.accentBright, size: 20),
            label: const Text('Print',
                style: TextStyle(color: AppColors.accentBright, fontWeight: FontWeight.w600)),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              side: BorderSide(color: AppColors.accentBright.withValues(alpha: 0.4)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
            ),
          ),
          const SizedBox(height: 8),
          const Center(
            child: Text('Download saves or shares the PDF · Print opens the print dialog',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, fontSize: 11.5)),
          ),
        ],
      ),
    );
  }

  Widget _templatePicker() {
    Widget tpl(String id, String name, String desc, IconData icon) {
      final sel = _template == id;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() => _template = id),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 8),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              gradient: sel ? AppColors.accentGradient : null,
              color: sel ? null : AppColors.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: sel ? Colors.transparent : AppColors.border),
            ),
            child: Column(
              children: [
                Icon(icon, color: sel ? Colors.white : AppColors.textSecondary, size: 18),
                const SizedBox(height: 5),
                Text(name,
                    style: TextStyle(
                        color: sel ? Colors.white : AppColors.text,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5)),
                Text(desc,
                    style: TextStyle(
                        color: sel ? Colors.white70 : AppColors.muted, fontSize: 10)),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionLabel('Template'),
        Row(children: [
          tpl('t1', 'Template 1', 'Modern', Icons.view_agenda_rounded),
          tpl('t2', 'Template 2', 'Classic', Icons.article_rounded),
        ]),
      ],
    );
  }

  Widget _docTypeSelector() {
    Widget chip(String type, IconData icon) {
      final sel = _docType == type;
      return Expanded(
        child: GestureDetector(
          onTap: () => setState(() {
            _docType = type;
            _scheduleTopicRefresh();
          }),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 13),
            margin: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              gradient: sel ? AppColors.accentGradient : null,
              color: sel ? null : AppColors.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: sel ? Colors.transparent : AppColors.border),
            ),
            child: Column(
              children: [
                Icon(icon, color: sel ? Colors.white : AppColors.textSecondary, size: 20),
                const SizedBox(height: 5),
                Text(type,
                    style: TextStyle(
                        color: sel ? Colors.white : AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                        fontSize: 12.5)),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      children: [
        Row(children: [
          chip('Assignment', Icons.edit_document),
          chip('Lab Report', Icons.science_rounded),
        ]),
        const SizedBox(height: 10),
        Row(
          children: [
            const Text('Group submission',
                style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            const Spacer(),
            Switch(
              value: _group,
              activeThumbColor: AppColors.accent,
              onChanged: (v) => setState(() => _group = v),
            ),
          ],
        ),
      ],
    );
  }

  Widget _memberRow(int i, ({TextEditingController name, TextEditingController id}) m) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: SuggestField(
              controller: m.name,
              label: 'Name',
              suggestions: () => _sugg.students,
              onPicked: (s) {
                final id = s.data;
                if (id is String && id.isNotEmpty) m.id.text = id;
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 6),
              child: TextField(
                controller: m.id,
                style: const TextStyle(color: AppColors.text, fontSize: 13),
                decoration: const InputDecoration(labelText: 'ID', isDense: true),
              ),
            ),
          ),
          if (_members.length > 1)
            IconButton(
              icon: const Icon(Icons.remove_circle_outline, color: AppColors.red, size: 20),
              onPressed: () => setState(() {
                m.name.dispose();
                m.id.dispose();
                _members.removeAt(i);
              }),
            ),
        ],
      ),
    );
  }

  Widget _sectionLabel(String s) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 16, 2, 8),
        child: Text(s.toUpperCase(),
            style: const TextStyle(
                color: AppColors.accentBright,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6)),
      );

  Widget _field(TextEditingController c, String label, {String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: c,
          style: const TextStyle(color: AppColors.text, fontSize: 14),
          decoration: InputDecoration(labelText: label, hintText: hint),
        ),
      );

  Widget _dropdown(String label, String value, List<String> items,
          ValueChanged<String?> onChanged) =>
      DropdownButtonFormField<String>(
        initialValue: value,
        isExpanded: true,
        dropdownColor: AppColors.card,
        decoration: InputDecoration(labelText: label),
        style: const TextStyle(color: AppColors.text, fontSize: 14),
        items: items
            .map((e) => DropdownMenuItem(value: e, child: Text(e)))
            .toList(),
        onChanged: onChanged,
      );

  static const _sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
  static final _batches = [
    for (var i = 55; i <= 70; i++) '${i}th'
  ]..[7] = '62nd';
}
