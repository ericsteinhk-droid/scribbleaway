import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';
import '../providers/session_provider.dart';
import '../providers/lexicon_provider.dart';
import '../providers/settings_provider.dart';
import '../models/meeting_session.dart';
import '../models/lexicon.dart';
import '../services/docx_service.dart';
import '../widgets/loading_overlay.dart';
import 'lexicon/lexicon_suggestion_screen.dart';

class MinutesScreen extends StatefulWidget {
  const MinutesScreen({super.key});

  @override
  State<MinutesScreen> createState() => _MinutesScreenState();
}

class _MinutesScreenState extends State<MinutesScreen> {
  late final TextEditingController _ctrl;
  bool _editing = false;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    final session = context.read<SessionProvider>().activeSession;
    _ctrl = TextEditingController(text: session?.minutes ?? '');
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _saveEdits() async {
    await context.read<SessionProvider>().updateMinutes(_ctrl.text);
    setState(() => _editing = false);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Procès-verbal sauvegardé')));
  }

  Future<void> _exportDocx() async {
    final session = context.read<SessionProvider>().activeSession;
    if (session == null || session.minutes == null) return;

    setState(() => _exporting = true);
    try {
      final service = DocxService();
      final file = await service.generateDocx(
        minutes: session.minutes!,
        meetingTitle: session.title,
        date: session.date,
      );
      if (!mounted) return;
      await Share.shareXFiles(
        [XFile(file.path)],
        text: session.title,
        subject: 'Procès-verbal – ${session.title}',
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur d\'export: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _improveLexicon() async {
    final session = context.read<SessionProvider>().activeSession;
    if (session?.lexiconId == null) {
      // Ask user to choose a lexicon or create one
      _showNoLexiconDialog();
      return;
    }
    final lexicon =
        context.read<LexiconProvider>().getLexicon(session!.lexiconId!);
    if (lexicon == null) return;

    final combined =
        '${session.transcription ?? ''}\n${session.minutes ?? ''}';
    final suggestions = _extractSuggestions(combined, lexicon);

    if (!mounted) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => LexiconSuggestionScreen(
          lexicon: lexicon,
          suggestions: suggestions,
        ),
      ),
    );
  }

  List<String> _extractSuggestions(String text, Lexicon existing) {
    final existingTerms =
        existing.entries.map((e) => e.term.toLowerCase()).toSet();
    final suggestions = <String>{};

    // Acronyms: 2-5 uppercase letters
    final acronymRe = RegExp(r'\b[A-Z]{2,5}\b');
    for (final m in acronymRe.allMatches(text)) {
      final w = m.group(0)!;
      if (!existingTerms.contains(w.toLowerCase())) suggestions.add(w);
    }

    // Capitalized words mid-sentence (potential names/orgs)
    final capRe = RegExp(r'(?<=[.!?]\s|^\s*)(?:[A-Z][a-zÀ-ÿ]+(?:\s[A-Z][a-zÀ-ÿ]+)+)');
    for (final m in capRe.allMatches(text)) {
      final w = m.group(0)!.trim();
      if (w.length > 3 && !existingTerms.contains(w.toLowerCase())) {
        suggestions.add(w);
      }
    }

    return suggestions.take(30).toList();
  }

  void _showNoLexiconDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Aucun lexique associé'),
        content: const Text(
            'Cette réunion n\'a pas de lexique associé. '
            'Associez un lexique lors de la création d\'une nouvelle réunion.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>().activeSession;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Procès-verbal'),
        actions: [
          if (!_editing)
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
          IconButton(
            icon: const Icon(Icons.tips_and_updates),
            tooltip: 'Améliorer le lexique',
            onPressed: _improveLexicon,
          ),
        ],
      ),
      body: LoadingOverlay(
        isLoading: _exporting,
        message: 'Export du fichier Word…',
        child: Column(
          children: [
            if (session?.lexiconName != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Row(
                  children: [
                    Icon(Icons.book,
                        size: 16,
                        color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 6),
                    Text('Lexique : ${session!.lexiconName}',
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.primary)),
                  ],
                ),
              ),
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
                          hintText: 'Procès-verbal…',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    )
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(16),
                      child: SelectableText(
                        session?.minutes ?? '',
                        style: const TextStyle(fontSize: 15, height: 1.7),
                      ),
                    ),
            ),
            _BottomBar(
              onExport: _exportDocx,
              onImprove: _improveLexicon,
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  final VoidCallback onExport;
  final VoidCallback onImprove;

  const _BottomBar({required this.onExport, required this.onImprove});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, -2))],
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onImprove,
              icon: const Icon(Icons.auto_fix_high, size: 18),
              label: const Text('Améliorer lexique'),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: onExport,
              icon: const Icon(Icons.download, size: 18),
              label: const Text('Export DOCX'),
            ),
          ),
        ],
      ),
    );
  }
}
