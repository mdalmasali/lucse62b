import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_colors.dart';
import '../../core/worker_api.dart';
import '../../shared/glass_card.dart';
import 'resources_screen.dart';

/// File browser for a course's Mid / Final material folders (Google Drive).
class CourseMaterialsScreen extends StatefulWidget {
  final CourseMaterial course;
  const CourseMaterialsScreen({super.key, required this.course});

  @override
  State<CourseMaterialsScreen> createState() => _CourseMaterialsScreenState();
}

class _CourseMaterialsScreenState extends State<CourseMaterialsScreen> {
  String _tab = 'mid';
  late Future<List<Map<String, dynamic>>> _future = _load();

  Future<List<Map<String, dynamic>>> _load() {
    final id = _tab == 'mid' ? widget.course.midFolderId : widget.course.finalFolderId;
    if (id.isEmpty) return Future.value([]);
    return WorkerApi.instance.driveFolder(id);
  }

  void _switch(String tab) {
    if (_tab == tab) return;
    setState(() {
      _tab = tab;
      _future = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Text(widget.course.code),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
            child: Text(widget.course.name,
                style: const TextStyle(
                    color: AppColors.textSecondary, fontSize: 12.5)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
            child: _toggle(),
          ),
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(
                      child: CircularProgressIndicator(color: AppColors.accent));
                }
                final files = snap.data ?? [];
                if (files.isEmpty) {
                  return const Center(
                    child: Text('No files in this folder yet.',
                        style: TextStyle(color: AppColors.muted, fontSize: 14)),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(14, 4, 14, 24),
                  itemCount: files.length,
                  itemBuilder: (_, i) => _fileCard(files[i]),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _toggle() {
    Widget seg(String label, String tab) {
      final sel = _tab == tab;
      return Expanded(
        child: GestureDetector(
          onTap: () => _switch(tab),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              gradient: sel ? AppColors.accentGradient : null,
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(label,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: sel ? Colors.white : AppColors.textSecondary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(children: [seg('Mid', 'mid'), seg('Final', 'final')]),
    );
  }

  Widget _fileCard(Map<String, dynamic> f) {
    final name = (f['name'] ?? 'File').toString();
    final id = (f['id'] ?? '').toString();
    final mime = (f['mimeType'] ?? '').toString();
    final (icon, color, label) = _typeMeta(mime);

    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: GlassCard(
        onTap: () => _open(id),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 19),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: AppColors.text,
                          fontWeight: FontWeight.w600,
                          fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(label,
                      style: TextStyle(color: color, fontSize: 11)),
                ],
              ),
            ),
            const Icon(Icons.download_rounded, size: 18, color: AppColors.muted),
          ],
        ),
      ),
    );
  }

  (IconData, Color, String) _typeMeta(String mime) {
    if (mime == 'application/pdf') {
      return (Icons.picture_as_pdf_rounded, const Color(0xFFF87171), 'PDF');
    }
    if (mime.startsWith('video/')) {
      return (Icons.play_circle_rounded, const Color(0xFF38BDF8), 'Video');
    }
    if (mime.contains('powerpoint') || mime.contains('presentation')) {
      return (Icons.slideshow_rounded, const Color(0xFFD97706), 'Presentation');
    }
    if (mime.contains('zip') || mime.contains('rar') || mime.contains('octet-stream')) {
      return (Icons.folder_zip_rounded, const Color(0xFFFBBF24), 'Archive');
    }
    if (mime.startsWith('image/')) {
      return (Icons.image_rounded, const Color(0xFF34D399), 'Image');
    }
    if (mime.contains('word') || mime.contains('document')) {
      return (Icons.description_rounded, const Color(0xFF60A5FA), 'Document');
    }
    return (Icons.insert_drive_file_rounded, AppColors.accentBright, 'File');
  }

  Future<void> _open(String id) async {
    if (id.isEmpty) return;
    final uri = Uri.parse('https://drive.google.com/file/d/$id/view');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
