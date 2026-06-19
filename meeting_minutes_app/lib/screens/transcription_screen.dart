import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/settings_provider.dart';
import '../providers/session_provider.dart';
import '../providers/lexicon_provider.dart';
import '../models/meeting_session.dart';
import '../widgets/loading_overlay.dart';
import 'minutes_screen.dart';

class TranscriptionScreen extends StatefulWidget {
  const TranscriptionScreen({super.key});

  @override
  State<TranscriptionScreen> createState() => _TranscriptionScreenState();
}

class _TranscriptionScreenState extends State<TranscriptionScreen> {
  late final TextEditingController _ctrl;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionProvider>().activeSession;
    _ctrl = TextEditingController(text: session?.transcription ?? '');

    // Auto-start transcription if not yet done
    if (session != null && session.status == SessionStatus.pending) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _startTranscription());
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _startTranscription() async {
    final settings = context.read<SettingsProvider>();
    final sessionProvider = context.read<SessionProvider>();
    final lexiconProvider = context.read<LexiconProvider>();
    final session = sessionProvider.activeSession;
    if (session == null) return;

    final lexicon = session.lexiconId != null
        ? lexiconProvider.getLexicon(session.lexiconId!)
        : null;

    try {
      await sessionProvider.transcribe(
        openAiKey: settings.openAiKey,
        lexicon: lexicon,
      );
      if (mounted) {
        _ctrl.text = sessionProvider.activeSession?.transcription ?? '';
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur de transcription: $e'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 6),
        ),
      );
    }
  }

  Future<void> _saveEdits() async {
    await context.read<SessionProvider>().updateTranscription(_ctrl.text);
    setState(() => _editing = false);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Transcription sauvegardée')));
  }

  Future<void> _generateMinutes() async {
    if (_editing) await _saveEdits();

    final settings = context.read<SettingsProvider>();
    final sessionProvider = context.read<SessionProvider>();
    final lexiconProvider = context.read<LexiconProvider>();
    final session = sessionProvider.activeSession;
    if (session == null) return;

    final lexicon = session.lexiconId != null
        ? lexiconProvider.getLexicon(session.lexiconId!)
        : null;

    try {
      await sessionProvider.generateMinutes(
        claudeKey: settings.claudeKey,
        lexicon: lexicon,
      );
      if (!mounted) return;
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const MinutesScreen()),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur: $e'),
          backgroundColor: Colors.red,
          duration: const Duration(seconds: 6),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionProvider = context.watch<SessionProvider>();
    final session = sessionProvider.activeSession;
    final isLoading = session?.status == SessionStatus.transcribing ||
        session?.status == SessionStatus.generatingMinutes;
    final statusMsg = sessionProvider.statusMessage;

    return Scaffold(
      appBar: AppBar(
        title: Text(session?.title ?? 'Transcription'),
        actions: [
          if (session?.transcription != null && !_editing)
            IconButton(
              icon: const Icon(Icons.edit),
              tooltip: 'Modifier',
              onPressed: () => setState(() => _editing = true),
            ),
          if (_editing)
            IconButton(
              icon: const Icon(Icons.save),
              tooltip: 'Sauvegarder',
              onPressed: _saveEdits,
            ),
          if (session?.status == SessionStatus.complete)
            IconButton(
              icon: const Icon(Icons.article),
              tooltip: 'Voir le procès-verbal',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const MinutesScreen()),
              ),
            ),
        ],
      ),
      body: LoadingOverlay(
        isLoading: isLoading,
        message: statusMsg.isNotEmpty ? statusMsg : 'Traitement en cours…',
        child: _buildBody(session),
      ),
    );
  }

  Widget _buildBody(MeetingSession? session) {
    if (session == null) {
      return const Center(child: Text('Aucune session active'));
    }

    if (session.status == SessionStatus.error) {
      return _ErrorView(
        message: session.errorMessage ?? 'Erreur inconnue',
        onRetry: _startTranscription,
      );
    }

    if (session.status == SessionStatus.pending) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Préparation de la transcription…'),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Info bar
        _SessionInfoBar(session: session),

        // Transcription text
        Expanded(
          child: _editing
              ? Padding(
                  padding: const EdgeInsets.all(16),
                  child: TextField(
                    controller: _ctrl,
                    maxLines: null,
                    expands: true,
                    textAlignVertical: TextAlignVertical.top,
                    decoration: const InputDecoration(
                      hintText: 'Texte de la transcription…',
                      border: OutlineInputBorder(),
                    ),
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(
                    session.transcription ?? 'Transcription vide',
                    style: const TextStyle(fontSize: 15, height: 1.6),
                  ),
                ),
        ),

        // Bottom actions
        if (session.status == SessionStatus.transcribed ||
            session.status == SessionStatus.complete)
          _BottomActions(
            hasMinutes: session.minutes != null,
            onGenerate: _generateMinutes,
            onViewMinutes: session.minutes != null
                ? () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const MinutesScreen()),
                    )
                : null,
          ),
      ],
    );
  }
}

class _SessionInfoBar extends StatelessWidget {
  final MeetingSession session;
  const _SessionInfoBar({required this.session});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: Theme.of(context).colorScheme.primaryContainer,
      child: Row(
        children: [
          Icon(Icons.language,
              size: 16, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 6),
          Text(session.language.displayName,
              style: TextStyle(color: Theme.of(context).colorScheme.primary)),
          if (session.lexiconName != null) ...[
            const SizedBox(width: 16),
            Icon(Icons.book,
                size: 16, color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 6),
            Text(session.lexiconName!,
                style: TextStyle(color: Theme.of(context).colorScheme.primary)),
          ],
          const Spacer(),
          Chip(
            label: Text(_statusLabel(session.status), style: const TextStyle(fontSize: 12)),
            backgroundColor: _statusColor(session.status).withOpacity(0.2),
            side: BorderSide(color: _statusColor(session.status)),
            padding: EdgeInsets.zero,
          ),
        ],
      ),
    );
  }

  String _statusLabel(SessionStatus s) => switch (s) {
        SessionStatus.transcribed => 'Transcrit',
        SessionStatus.generatingMinutes => 'Génération…',
        SessionStatus.complete => 'Complet',
        SessionStatus.error => 'Erreur',
        _ => 'En cours…',
      };

  Color _statusColor(SessionStatus s) => switch (s) {
        SessionStatus.complete => Colors.green,
        SessionStatus.error => Colors.red,
        SessionStatus.transcribed => Colors.blue,
        _ => Colors.orange,
      };
}

class _BottomActions extends StatelessWidget {
  final bool hasMinutes;
  final VoidCallback onGenerate;
  final VoidCallback? onViewMinutes;

  const _BottomActions({
    required this.hasMinutes,
    required this.onGenerate,
    this.onViewMinutes,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
              color: Colors.black12,
              blurRadius: 8,
              offset: const Offset(0, -2))
        ],
      ),
      child: Row(
        children: [
          if (onViewMinutes != null)
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onViewMinutes,
                icon: const Icon(Icons.article),
                label: const Text('Voir PV'),
              ),
            ),
          if (onViewMinutes != null) const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: ElevatedButton.icon(
              onPressed: onGenerate,
              icon: const Icon(Icons.auto_awesome),
              label: Text(
                  hasMinutes ? 'Regénérer le PV' : 'Générer le procès-verbal'),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            const Text('Erreur de transcription',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey)),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Réessayer'),
            ),
          ],
        ),
      ),
    );
  }
}
