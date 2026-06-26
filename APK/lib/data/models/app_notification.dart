/// A row from the Supabase `notifications` table.
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String link;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.link,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] ?? '').toString(),
        type: (j['type'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        body: (j['body'] ?? '').toString(),
        link: (j['link'] ?? '/').toString(),
        createdAt: DateTime.tryParse((j['created_at'] ?? '').toString())?.toLocal() ??
            DateTime.fromMillisecondsSinceEpoch(0),
      );
}
