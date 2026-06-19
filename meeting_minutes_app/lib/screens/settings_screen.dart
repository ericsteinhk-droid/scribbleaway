import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/settings_provider.dart';
import '../models/meeting_session.dart';

class SettingsScreen extends StatefulWidget {
  final bool firstRun;
  const SettingsScreen({super.key, this.firstRun = false});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _openAiCtrl = TextEditingController();
  final _claudeCtrl = TextEditingController();
  bool _obscureOpenAi = true;
  bool _obscureClaude = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final s = context.read<SettingsProvider>();
    _openAiCtrl.text = s.openAiKey;
    _claudeCtrl.text = s.claudeKey;
  }

  @override
  void dispose() {
    _openAiCtrl.dispose();
    _claudeCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final s = context.read<SettingsProvider>();
    await s.setOpenAiKey(_openAiCtrl.text);
    await s.setClaudeKey(_claudeCtrl.text);
    setState(() => _saving = false);
    if (!mounted) return;
    if (widget.firstRun) {
      Navigator.of(context).pushReplacementNamed('/home');
    } else {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Paramètres sauvegardés')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsProvider>();
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.firstRun ? 'Configuration initiale' : 'Paramètres'),
        automaticallyImplyLeading: !widget.firstRun,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.firstRun) ...[
              Card(
                color: theme.colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Bienvenue dans ScribbleAway',
                          style: theme.textTheme.titleLarge
                              ?.copyWith(color: theme.colorScheme.primary)),
                      const SizedBox(height: 8),
                      const Text(
                          'Entrez vos clés API pour commencer à transcrire '
                          'et générer des procès-verbaux.'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],

            Text('Clés API', style: theme.textTheme.titleMedium),
            const SizedBox(height: 16),

            // OpenAI key
            TextFormField(
              controller: _openAiCtrl,
              obscureText: _obscureOpenAi,
              decoration: InputDecoration(
                labelText: 'Clé API OpenAI (Whisper)',
                hintText: 'sk-...',
                prefixIcon: const Icon(Icons.mic),
                suffixIcon: IconButton(
                  icon: Icon(
                      _obscureOpenAi ? Icons.visibility : Icons.visibility_off),
                  onPressed: () =>
                      setState(() => _obscureOpenAi = !_obscureOpenAi),
                ),
                helperText: 'Utilisée pour la transcription audio (Whisper)',
              ),
            ),
            const SizedBox(height: 16),

            // Claude key
            TextFormField(
              controller: _claudeCtrl,
              obscureText: _obscureClaude,
              decoration: InputDecoration(
                labelText: 'Clé API Anthropic (Claude)',
                hintText: 'sk-ant-...',
                prefixIcon: const Icon(Icons.article),
                suffixIcon: IconButton(
                  icon: Icon(
                      _obscureClaude ? Icons.visibility : Icons.visibility_off),
                  onPressed: () =>
                      setState(() => _obscureClaude = !_obscureClaude),
                ),
                helperText: 'Utilisée pour générer les procès-verbaux',
              ),
            ),

            const SizedBox(height: 32),
            Text('Préférences', style: theme.textTheme.titleMedium),
            const SizedBox(height: 16),

            // Default language
            DropdownButtonFormField<SessionLanguage>(
              value: settings.defaultLanguage,
              decoration: const InputDecoration(
                labelText: 'Langue par défaut',
                prefixIcon: Icon(Icons.language),
              ),
              items: SessionLanguage.values.map((lang) {
                return DropdownMenuItem(
                  value: lang,
                  child: Text(lang.displayName),
                );
              }).toList(),
              onChanged: (lang) {
                if (lang != null) settings.setDefaultLanguage(lang);
              },
            ),

            const SizedBox(height: 40),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(widget.firstRun ? 'Commencer' : 'Sauvegarder'),
              ),
            ),

            const SizedBox(height: 32),

            // API key links info
            Card(
              color: Colors.amber.shade50,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info_outline, color: Colors.amber.shade700),
                        const SizedBox(width: 8),
                        Text('Obtenir les clés API',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,
                                color: Colors.amber.shade900)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '• OpenAI: platform.openai.com → API Keys\n'
                      '• Anthropic: console.anthropic.com → API Keys\n\n'
                      'Les clés sont stockées de façon sécurisée sur cet appareil.',
                      style: TextStyle(color: Colors.amber.shade900),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
