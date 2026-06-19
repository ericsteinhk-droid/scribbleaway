import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/lexicon_provider.dart';
import '../../models/lexicon.dart';

class LexiconSuggestionScreen extends StatefulWidget {
  final Lexicon lexicon;
  final List<String> suggestions;

  const LexiconSuggestionScreen({
    super.key,
    required this.lexicon,
    required this.suggestions,
  });

  @override
  State<LexiconSuggestionScreen> createState() =>
      _LexiconSuggestionScreenState();
}

class _LexiconSuggestionScreenState extends State<LexiconSuggestionScreen> {
  final Map<String, _SuggestionState> _states = {};
  final Map<String, LexiconEntryType> _types = {};
  final Map<String, TextEditingController> _expansionCtrls = {};

  @override
  void initState() {
    super.initState();
    for (final s in widget.suggestions) {
      _states[s] = _SuggestionState.pending;
      _types[s] = _guessType(s);
      _expansionCtrls[s] = TextEditingController();
    }
  }

  @override
  void dispose() {
    for (final c in _expansionCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  LexiconEntryType _guessType(String term) {
    if (term == term.toUpperCase() && term.length <= 5) {
      return LexiconEntryType.acronym;
    }
    if (RegExp(r'^[A-Z][a-zÀ-ÿ]+ [A-Z][a-zÀ-ÿ]+').hasMatch(term)) {
      return LexiconEntryType.personName;
    }
    return LexiconEntryType.technicalTerm;
  }

  Future<void> _acceptSuggestion(String term) async {
    setState(() => _states[term] = _SuggestionState.accepted);
    await context.read<LexiconProvider>().addEntry(
          lexiconId: widget.lexicon.id,
          term: term,
          expansion: _expansionCtrls[term]!.text.trim().isEmpty
              ? null
              : _expansionCtrls[term]!.text.trim(),
          type: _types[term]!,
        );
    await context.read<LexiconProvider>().touchLexicon(widget.lexicon.id);
  }

  void _rejectSuggestion(String term) {
    setState(() => _states[term] = _SuggestionState.rejected);
  }

  int get _pendingCount =>
      _states.values.where((s) => s == _SuggestionState.pending).length;
  int get _acceptedCount =>
      _states.values.where((s) => s == _SuggestionState.accepted).length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Améliorer le lexique'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Chip(
              label: Text('$_acceptedCount ajouté${_acceptedCount != 1 ? 's' : ''}'),
              backgroundColor:
                  Theme.of(context).colorScheme.primaryContainer,
            ),
          ),
        ],
      ),
      body: widget.suggestions.isEmpty
          ? const _NoSuggestions()
          : Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(16),
                  color: Theme.of(context).colorScheme.primaryContainer,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Lexique : ${widget.lexicon.name}',
                        style: TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Theme.of(context).colorScheme.primary),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Ces termes ont été détectés dans votre transcription. '
                        'Acceptez ceux que vous souhaitez ajouter au lexique.',
                        style: TextStyle(fontSize: 13),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 20),
                    itemCount: widget.suggestions.length,
                    itemBuilder: (ctx, i) {
                      final term = widget.suggestions[i];
                      return _SuggestionCard(
                        term: term,
                        state: _states[term]!,
                        type: _types[term]!,
                        expansionCtrl: _expansionCtrls[term]!,
                        onTypeChanged: (t) =>
                            setState(() => _types[term] = t),
                        onAccept: () => _acceptSuggestion(term),
                        onReject: () => _rejectSuggestion(term),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () => Navigator.pop(context),
                      child: Text(_pendingCount > 0
                          ? 'Terminer ($_pendingCount restant${_pendingCount != 1 ? 's' : ''})'
                          : 'Terminer'),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

enum _SuggestionState { pending, accepted, rejected }

class _SuggestionCard extends StatelessWidget {
  final String term;
  final _SuggestionState state;
  final LexiconEntryType type;
  final TextEditingController expansionCtrl;
  final ValueChanged<LexiconEntryType> onTypeChanged;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const _SuggestionCard({
    required this.term,
    required this.state,
    required this.type,
    required this.expansionCtrl,
    required this.onTypeChanged,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAccepted = state == _SuggestionState.accepted;
    final isRejected = state == _SuggestionState.rejected;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: isAccepted
          ? Colors.green.shade50
          : isRejected
              ? Colors.grey.shade100
              : null,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(term,
                      style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: isRejected ? Colors.grey : null,
                          decoration: isRejected
                              ? TextDecoration.lineThrough
                              : null)),
                ),
                if (isAccepted)
                  const Icon(Icons.check_circle, color: Colors.green),
                if (isRejected)
                  const Icon(Icons.cancel, color: Colors.grey),
              ],
            ),

            if (state == _SuggestionState.pending) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<LexiconEntryType>(
                      value: type,
                      isDense: true,
                      decoration: const InputDecoration(
                          labelText: 'Type', isDense: true),
                      items: LexiconEntryType.values
                          .map((t) => DropdownMenuItem(
                                value: t,
                                child: Text(t.displayNameFr,
                                    style: const TextStyle(fontSize: 13)),
                              ))
                          .toList(),
                      onChanged: (v) {
                        if (v != null) onTypeChanged(v);
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextFormField(
                      controller: expansionCtrl,
                      decoration: const InputDecoration(
                        labelText: 'Développement',
                        hintText: 'optionnel',
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton.icon(
                    onPressed: onReject,
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Ignorer'),
                    style: TextButton.styleFrom(
                        foregroundColor: Colors.grey.shade700),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton.icon(
                    onPressed: onAccept,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Ajouter'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NoSuggestions extends StatelessWidget {
  const _NoSuggestions();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_outline, size: 60, color: Colors.green),
          SizedBox(height: 16),
          Text('Aucune suggestion',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500)),
          SizedBox(height: 8),
          Text('Aucun nouveau terme détecté dans cette transcription.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey)),
        ],
      ),
    );
  }
}
