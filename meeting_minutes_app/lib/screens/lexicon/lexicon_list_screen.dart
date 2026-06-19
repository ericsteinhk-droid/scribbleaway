import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/lexicon_provider.dart';
import '../../models/lexicon.dart';
import 'lexicon_detail_screen.dart';

class LexiconListScreen extends StatelessWidget {
  const LexiconListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LexiconProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lexiques'),
        actions: [
          IconButton(
            icon: const Icon(Icons.help_outline),
            onPressed: () => _showHelp(context),
          ),
        ],
      ),
      body: provider.loading
          ? const Center(child: CircularProgressIndicator())
          : provider.lexicons.isEmpty
              ? _EmptyState(onCreate: () => _createLexicon(context))
              : _LexiconGrid(lexicons: provider.lexicons),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createLexicon(context),
        icon: const Icon(Icons.add),
        label: const Text('Nouveau lexique'),
      ),
    );
  }

  Future<void> _createLexicon(BuildContext context) async {
    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (ctx) => const _CreateLexiconDialog(),
    );
    if (result == null || !context.mounted) return;
    await context.read<LexiconProvider>().createLexicon(
          name: result['name']!,
          description: result['description'] ?? '',
        );
  }

  void _showHelp(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('À propos des lexiques'),
        content: const SingleChildScrollView(
          child: Text(
            'Les lexiques vous permettent de stocker des termes spéciaux '
            'qui améliorent la précision de la transcription :\n\n'
            '• Acronymes : ex. TI, RH, PDG\n'
            '• Noms de personnes : ex. Marie-Claude Tremblay\n'
            '• Termes techniques : ex. microservices, OAuth\n'
            '• Organisations : ex. CNESST, Desjardins\n\n'
            'Ces termes sont envoyés à Whisper comme contexte pour guider '
            'la transcription. Plus vous utilisez un lexique, plus il '
            's\'améliore automatiquement.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

class _LexiconGrid extends StatelessWidget {
  final List<Lexicon> lexicons;
  const _LexiconGrid({required this.lexicons});

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 80),
      itemCount: lexicons.length,
      itemBuilder: (ctx, i) => _LexiconCard(lexicon: lexicons[i]),
    );
  }
}

class _LexiconCard extends StatelessWidget {
  final Lexicon lexicon;
  const _LexiconCard({required this.lexicon});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(
              builder: (_) => LexiconDetailScreen(lexiconId: lexicon.id)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.book,
                    color: theme.colorScheme.primary, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(lexicon.name,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 16)),
                    if (lexicon.description.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(lexicon.description,
                          style: TextStyle(
                              fontSize: 13, color: Colors.grey.shade600),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      '${lexicon.entries.length} terme${lexicon.entries.length != 1 ? 's' : ''}',
                      style: TextStyle(
                          fontSize: 12, color: theme.colorScheme.primary),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                onSelected: (v) {
                  if (v == 'delete') _confirmDelete(context);
                },
                itemBuilder: (_) => [
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(children: [
                      Icon(Icons.delete, color: Colors.red),
                      SizedBox(width: 8),
                      Text('Supprimer', style: TextStyle(color: Colors.red)),
                    ]),
                  ),
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
        title: const Text('Supprimer le lexique?'),
        content: Text(
            '« ${lexicon.name} » et ses ${lexicon.entries.length} entrées seront supprimés.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.read<LexiconProvider>().deleteLexicon(lexicon.id);
            },
            child: const Text('Supprimer',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onCreate;
  const _EmptyState({required this.onCreate});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.book_outlined,
              size: 80,
              color: Theme.of(context).colorScheme.outlineVariant),
          const SizedBox(height: 16),
          const Text('Aucun lexique',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          const Text('Créez un lexique pour améliorer vos transcriptions',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onCreate,
            icon: const Icon(Icons.add),
            label: const Text('Créer un lexique'),
          ),
        ],
      ),
    );
  }
}

class _CreateLexiconDialog extends StatefulWidget {
  const _CreateLexiconDialog();

  @override
  State<_CreateLexiconDialog> createState() => _CreateLexiconDialogState();
}

class _CreateLexiconDialogState extends State<_CreateLexiconDialog> {
  final _nameCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nouveau lexique'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _nameCtrl,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Nom du lexique *',
                hintText: 'ex. Projet Alpha, Réunions RH',
              ),
              textCapitalization: TextCapitalization.words,
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Requis' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descCtrl,
              decoration: const InputDecoration(
                labelText: 'Description (optionnel)',
                hintText: 'ex. Termes techniques du projet',
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Annuler'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.pop(context, {
                'name': _nameCtrl.text.trim(),
                'description': _descCtrl.text.trim(),
              });
            }
          },
          child: const Text('Créer'),
        ),
      ],
    );
  }
}
