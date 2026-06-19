import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../providers/settings_provider.dart';
import '../providers/session_provider.dart';
import '../providers/lexicon_provider.dart';
import '../models/meeting_session.dart';
import '../models/lexicon.dart';
import 'transcription_screen.dart';

class NewSessionScreen extends StatefulWidget {
  const NewSessionScreen({super.key});

  @override
  State<NewSessionScreen> createState() => _NewSessionScreenState();
}

class _NewSessionScreenState extends State<NewSessionScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();

  SessionLanguage _language = SessionLanguage.frCA;
  Lexicon? _selectedLexicon;
  String? _audioPath;
  String? _audioName;
  DateTime _date = DateTime.now();
  bool _starting = false;

  @override
  void initState() {
    super.initState();
    final settings = context.read<SettingsProvider>();
    _language = settings.defaultLanguage;
    final defaultLexiconId = settings.defaultLexiconId;
    if (defaultLexiconId != null) {
      _selectedLexicon =
          context.read<LexiconProvider>().getLexicon(defaultLexiconId);
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAudio() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac'],
    );
    if (result != null && result.files.isNotEmpty) {
      final file = result.files.first;
      setState(() {
        _audioPath = file.path;
        _audioName = file.name;
        if (_titleCtrl.text.isEmpty) {
          _titleCtrl.text = file.name.replaceAll(RegExp(r'\.\w+$'), '');
        }
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      locale: _language == SessionLanguage.frCA
          ? const Locale('fr', 'CA')
          : const Locale('en', 'US'),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _start() async {
    if (!_formKey.currentState!.validate()) return;
    if (_audioPath == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Veuillez sélectionner un fichier audio')),
      );
      return;
    }

    setState(() => _starting = true);

    try {
      final sessionProvider = context.read<SessionProvider>();
      await sessionProvider.createSession(
        title: _titleCtrl.text.trim(),
        language: _language,
        audioFilePath: _audioPath!,
        lexiconId: _selectedLexicon?.id,
        lexiconName: _selectedLexicon?.name,
        date: _date,
      );

      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const TranscriptionScreen()),
      );
    } catch (e) {
      setState(() => _starting = false);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Erreur: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final lexicons = context.watch<LexiconProvider>().lexicons;
    final theme = Theme.of(context);
    final dateStr = DateFormat('d MMMM yyyy', 'fr_CA').format(_date);

    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle réunion')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            // Title
            TextFormField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                labelText: 'Titre de la réunion *',
                prefixIcon: Icon(Icons.title),
              ),
              textCapitalization: TextCapitalization.sentences,
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Requis' : null,
            ),
            const SizedBox(height: 16),

            // Date
            InkWell(
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(10),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Date',
                  prefixIcon: Icon(Icons.calendar_today),
                ),
                child: Text(dateStr),
              ),
            ),
            const SizedBox(height: 16),

            // Language
            DropdownButtonFormField<SessionLanguage>(
              value: _language,
              decoration: const InputDecoration(
                labelText: 'Langue',
                prefixIcon: Icon(Icons.language),
              ),
              items: SessionLanguage.values.map((lang) {
                return DropdownMenuItem(
                  value: lang,
                  child: Text(lang.displayName),
                );
              }).toList(),
              onChanged: (v) {
                if (v != null) setState(() => _language = v);
              },
            ),
            const SizedBox(height: 16),

            // Lexicon selector
            DropdownButtonFormField<Lexicon?>(
              value: _selectedLexicon,
              decoration: const InputDecoration(
                labelText: 'Lexique (optionnel)',
                prefixIcon: Icon(Icons.book),
                helperText: 'Améliore la précision de la transcription',
              ),
              items: [
                const DropdownMenuItem(
                  value: null,
                  child: Text('Aucun lexique'),
                ),
                ...lexicons.map((l) => DropdownMenuItem(
                      value: l,
                      child: Text(l.name),
                    )),
              ],
              onChanged: (v) => setState(() => _selectedLexicon = v),
            ),
            const SizedBox(height: 24),

            // Audio file picker
            _AudioPicker(
              audioName: _audioName,
              onPick: _pickAudio,
            ),

            const SizedBox(height: 40),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _starting ? null : _start,
                icon: _starting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.play_arrow),
                label: const Text('Démarrer la transcription'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AudioPicker extends StatelessWidget {
  final String? audioName;
  final VoidCallback onPick;

  const _AudioPicker({this.audioName, required this.onPick});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasFile = audioName != null;

    return InkWell(
      onTap: onPick,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          border: Border.all(
            color: hasFile
                ? theme.colorScheme.primary
                : theme.colorScheme.outline,
            width: hasFile ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
          color: hasFile
              ? theme.colorScheme.primaryContainer
              : Colors.grey.shade50,
        ),
        child: Row(
          children: [
            Icon(
              hasFile ? Icons.audio_file : Icons.upload_file,
              size: 40,
              color: hasFile
                  ? theme.colorScheme.primary
                  : Colors.grey.shade500,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    hasFile ? 'Fichier sélectionné' : 'Sélectionner un fichier audio',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: hasFile
                          ? theme.colorScheme.primary
                          : Colors.grey.shade700,
                    ),
                  ),
                  if (hasFile)
                    Text(audioName!,
                        style: const TextStyle(fontSize: 13),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis)
                  else
                    Text('MP3, M4A, WAV, MP4, OGG, FLAC (max 25 MB)',
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade500),
          ],
        ),
      ),
    );
  }
}
