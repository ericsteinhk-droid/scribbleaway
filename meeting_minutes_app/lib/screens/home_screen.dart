import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/session_provider.dart';
import '../providers/lexicon_provider.dart';
import '../models/meeting_session.dart';
import 'new_session_screen.dart';
import 'transcription_screen.dart';
import 'lexicon/lexicon_list_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('ScribbleAway'),
        actions: [
          IconButton(
            icon: const Icon(Icons.book),
            tooltip: 'Lexiques',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => const LexiconListScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'Paramètres',
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      body: const _SessionList(),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NewSessionScreen()),
        ),
        icon: const Icon(Icons.add),
        label: const Text('Nouvelle réunion'),
      ),
    );
  }
}

class _SessionList extends StatelessWidget {
  const _SessionList();

  @override
  Widget build(BuildContext context) {
    final sessions = context.watch<SessionProvider>().sessions;

    if (sessions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.mic_none,
                size: 80, color: Theme.of(context).colorScheme.outlineVariant),
            const SizedBox(height: 16),
            const Text('Aucune réunion',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500)),
            const SizedBox(height: 8),
            const Text('Appuyez sur + pour commencer',
                style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 80),
      itemCount: sessions.length,
      itemBuilder: (ctx, i) => _SessionCard(session: sessions[i]),
    );
  }
}

class _SessionCard extends StatelessWidget {
  final MeetingSession session;

  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateStr = DateFormat('d MMM yyyy', 'fr_CA').format(session.date);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          context.read<SessionProvider>().setActiveSession(session);
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const TranscriptionScreen()),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              _StatusIcon(status: session.status),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(session.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 16),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.calendar_today,
                            size: 13, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(dateStr,
                            style: TextStyle(
                                fontSize: 13, color: Colors.grey.shade600)),
                        const SizedBox(width: 12),
                        Icon(Icons.language,
                            size: 13, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(
                            session.language == SessionLanguage.frCA
                                ? 'FR'
                                : 'EN',
                            style: TextStyle(
                                fontSize: 13, color: Colors.grey.shade600)),
                        if (session.lexiconName != null) ...[
                          const SizedBox(width: 12),
                          Icon(Icons.book,
                              size: 13, color: Colors.grey.shade600),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(session.lexiconName!,
                                style: TextStyle(
                                    fontSize: 13, color: Colors.grey.shade600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'delete') {
                    _confirmDelete(context);
                  }
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                      value: 'delete',
                      child: Row(children: [
                        Icon(Icons.delete, color: Colors.red),
                        SizedBox(width: 8),
                        Text('Supprimer', style: TextStyle(color: Colors.red)),
                      ])),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer la réunion?'),
        content: Text('« ${session.title} » sera supprimée définitivement.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Annuler')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<SessionProvider>().deleteSession(session.id);
            },
            child: const Text('Supprimer',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _StatusIcon extends StatelessWidget {
  final SessionStatus status;
  const _StatusIcon({required this.status});

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (status) {
      SessionStatus.complete => (Icons.check_circle, Colors.green),
      SessionStatus.error => (Icons.error, Colors.red),
      SessionStatus.transcribing ||
      SessionStatus.generatingMinutes =>
        (Icons.hourglass_empty, Colors.orange),
      SessionStatus.transcribed => (Icons.text_snippet, Colors.blue),
      _ => (Icons.mic, Colors.grey),
    };
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, color: color, size: 24),
    );
  }
}
