import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/lexicon_provider.dart';
import '../../models/lexicon.dart';

class LexiconDetailScreen extends StatefulWidget {
  final String lexiconId;
  const LexiconDetailScreen({super.key, required this.lexiconId});

  @override
  State<LexiconDetailScreen> createState() => _LexiconDetailScreenState();
}

class _LexiconDetailScreenState extends State<LexiconDetailScreen> {
  String _search = '';
  LexiconEntryType? _filterType;

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<LexiconProvider>();
    final lexicon = provider.getLexicon(widget.lexiconId);

    if (lexicon == null) {
      return const Scaffold(body: Center(child: Text('Lexique introuvable')));
    }

    var entries = lexicon.entries;
    if (_search.isNotEmpty) {
      entries = entries
          .where((e) =>
              e.term.toLowerCase().contains(_search.toLowerCase()) ||
              (e.expansion?.toLowerCase().contains(_search.toLowerCase()) ??
                  false))
          .toList();
    }
    if (_filterType != null) {
      entries = entries.where((e) => e.type == _filterType).toList();
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(lexicon.name),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            tooltip: 'Renommer',
            onPressed: () => _editLexicon(context, lexicon),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search & filter bar
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: Column(
              children: [
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Rechercher…',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                  ),
                  onChanged: (v) => setState(() => _search = v),
                ),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _FilterChip(
                        label: 'Tous',
                        selected: _filterType == null,
                        onTap: () => setState(() => _filterType = null),
                      ),
                      const SizedBox(width: 8),
                      ...LexiconEntryType.values.map((t) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _FilterChip(
                              label: t.displayNameFr,
                              selected: _filterType == t,
                              onTap: () =>
                                  setState(() => _filterType = t),
                            ),
                          )),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Stats
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                Text(
                  '${entries.length} terme${entries.length != 1 ? 's' : ''}',
                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                ),
              ],
            ),
          ),

          // Entries list
          Expanded(
            child: entries.isEmpty
                ? const Center(child: Text('Aucun terme trouvé'))
                : ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 80),
                    itemCount: entries.length,
                    itemBuilder: (ctx, i) => _EntryCard(
                      entry: entries[i],
                      lexiconId: lexicon.id,
                      onEdit: () => _editEntry(context, lexicon.id, entries[i]),
                      onDelete: () =>
                          _deleteEntry(context, lexicon.id, entries[i]),
                    ),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _addEntry(context, lexicon.id),
        icon: const Icon(Icons.add),
        label: const Text('Ajouter terme'),
      ),
    );
  }

  Future<void> _addEntry(BuildContext context, String lexiconId) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => const _EntryFormDialog(),
    );
    if (result == null || !context.mounted) return;
    await context.read<LexiconProvider>().addEntry(
          lexiconId: lexiconId,
          term: result['term'],
          expansion: result['expansion'],
          context: result['context'],
          type: result['type'],
        );
  }

  Future<void> _editEntry(
      BuildContext context, String lexiconId, LexiconEntry entry) async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => _EntryFormDialog(entry: entry),
    );
    if (result == null || !context.mounted) return;
    await context.read<LexiconProvider>().updateEntry(
          entry.copyWith(
            term: result['term'],
            expansion: result['expansion'],
            context: result['context'],
            type: result['type'],
          ),
        );
  }

  Future<void> _deleteEntry(
      BuildContext context, String lexiconId, LexiconEntry entry) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Supprimer?'),
        content: Text('Supprimer « ${entry.term} »?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Annuler')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child:
                const Text('Supprimer', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await context.read<LexiconProvider>().deleteEntry(lexiconId, entry.id);
  }

  Future<void> _editLexicon(BuildContext context, Lexicon lexicon) async {
    final nameCtrl = TextEditingController(text: lexicon.name);
    final descCtrl = TextEditingController(text: lexicon.description);
    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Modifier le lexique'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Nom'),
              autofocus: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Annuler')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sauvegarder')),
        ],
      ),
    );
    if (result != true || !context.mounted) return;
    await context.read<LexiconProvider>().updateLexicon(
          lexicon.copyWith(
              name: nameCtrl.text.trim(),
              description: descCtrl.text.trim()),
        );
    nameCtrl.dispose();
    descCtrl.dispose();
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip(
      {required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label, style: const TextStyle(fontSize: 12)),
      selected: selected,
      onSelected: (_) => onTap(),
      showCheckmark: false,
    );
  }
}

class _EntryCard extends StatelessWidget {
  final LexiconEntry entry;
  final String lexiconId;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  const _EntryCard({
    required this.entry,
    required this.lexiconId,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: _TypeBadge(type: entry.type),
        title: Text(entry.term,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (entry.expansion != null)
              Text('→ ${entry.expansion}',
                  style: TextStyle(color: theme.colorScheme.primary)),
            if (entry.context != null)
              Text(entry.context!,
                  style: const TextStyle(fontSize: 12, color: Colors.grey)),
            if (entry.usageCount > 0)
              Text('Utilisé ${entry.usageCount} fois',
                  style: const TextStyle(fontSize: 11, color: Colors.grey)),
          ],
        ),
        isThreeLine:
            entry.expansion != null || entry.context != null,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.edit, size: 20),
              onPressed: onEdit,
              tooltip: 'Modifier',
            ),
            IconButton(
              icon: const Icon(Icons.delete, size: 20, color: Colors.red),
              onPressed: onDelete,
              tooltip: 'Supprimer',
            ),
          ],
        ),
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  final LexiconEntryType type;
  const _TypeBadge({required this.type});

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (type) {
      LexiconEntryType.acronym => (Icons.abc, Colors.purple),
      LexiconEntryType.personName => (Icons.person, Colors.blue),
      LexiconEntryType.technicalTerm => (Icons.code, Colors.teal),
      LexiconEntryType.organization => (Icons.business, Colors.orange),
      LexiconEntryType.other => (Icons.label, Colors.grey),
    };
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Icon(icon, color: color, size: 20),
    );
  }
}

class _EntryFormDialog extends StatefulWidget {
  final LexiconEntry? entry;
  const _EntryFormDialog({this.entry});

  @override
  State<_EntryFormDialog> createState() => _EntryFormDialogState();
}

class _EntryFormDialogState extends State<_EntryFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _termCtrl;
  late final TextEditingController _expansionCtrl;
  late final TextEditingController _contextCtrl;
  late LexiconEntryType _type;

  @override
  void initState() {
    super.initState();
    _termCtrl = TextEditingController(text: widget.entry?.term ?? '');
    _expansionCtrl =
        TextEditingController(text: widget.entry?.expansion ?? '');
    _contextCtrl =
        TextEditingController(text: widget.entry?.context ?? '');
    _type = widget.entry?.type ?? LexiconEntryType.technicalTerm;
  }

  @override
  void dispose() {
    _termCtrl.dispose();
    _expansionCtrl.dispose();
    _contextCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title:
          Text(widget.entry == null ? 'Ajouter un terme' : 'Modifier le terme'),
      content: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Type selector
              DropdownButtonFormField<LexiconEntryType>(
                value: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: LexiconEntryType.values
                    .map((t) => DropdownMenuItem(
                          value: t,
                          child: Text(t.displayNameFr),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _type = v);
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _termCtrl,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Terme *',
                  hintText: 'ex. TI, Claude Martin, OAuth',
                ),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Requis' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _expansionCtrl,
                decoration: const InputDecoration(
                  labelText: 'Développement (optionnel)',
                  hintText:
                      'ex. Technologie de l\'information',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _contextCtrl,
                decoration: const InputDecoration(
                  labelText: 'Contexte (optionnel)',
                  hintText: 'ex. Utilisé dans les réunions de direction',
                ),
                maxLines: 2,
              ),
            ],
          ),
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
                'term': _termCtrl.text.trim(),
                'expansion': _expansionCtrl.text.trim().isEmpty
                    ? null
                    : _expansionCtrl.text.trim(),
                'context': _contextCtrl.text.trim().isEmpty
                    ? null
                    : _contextCtrl.text.trim(),
                'type': _type,
              });
            }
          },
          child: Text(widget.entry == null ? 'Ajouter' : 'Sauvegarder'),
        ),
      ],
    );
  }
}
