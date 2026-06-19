enum LexiconEntryType { acronym, personName, technicalTerm, organization, other }

extension LexiconEntryTypeExt on LexiconEntryType {
  String get displayNameFr {
    switch (this) {
      case LexiconEntryType.acronym:
        return 'Acronyme';
      case LexiconEntryType.personName:
        return 'Nom de personne';
      case LexiconEntryType.technicalTerm:
        return 'Terme technique';
      case LexiconEntryType.organization:
        return 'Organisation';
      case LexiconEntryType.other:
        return 'Autre';
    }
  }

  String get displayNameEn {
    switch (this) {
      case LexiconEntryType.acronym:
        return 'Acronym';
      case LexiconEntryType.personName:
        return 'Person Name';
      case LexiconEntryType.technicalTerm:
        return 'Technical Term';
      case LexiconEntryType.organization:
        return 'Organization';
      case LexiconEntryType.other:
        return 'Other';
    }
  }

  static LexiconEntryType fromString(String value) {
    return LexiconEntryType.values.firstWhere(
      (e) => e.name == value,
      orElse: () => LexiconEntryType.technicalTerm,
    );
  }
}

class LexiconEntry {
  final String id;
  final String lexiconId;
  String term;
  String? expansion;
  String? context;
  LexiconEntryType type;
  int usageCount;
  DateTime lastUsed;

  LexiconEntry({
    required this.id,
    required this.lexiconId,
    required this.term,
    this.expansion,
    this.context,
    this.type = LexiconEntryType.technicalTerm,
    this.usageCount = 0,
    DateTime? lastUsed,
  }) : lastUsed = lastUsed ?? DateTime.now();

  Map<String, dynamic> toMap() => {
        'id': id,
        'lexicon_id': lexiconId,
        'term': term,
        'expansion': expansion,
        'context': context,
        'type': type.name,
        'usage_count': usageCount,
        'last_used': lastUsed.millisecondsSinceEpoch,
      };

  factory LexiconEntry.fromMap(Map<String, dynamic> map) => LexiconEntry(
        id: map['id'] as String,
        lexiconId: map['lexicon_id'] as String,
        term: map['term'] as String,
        expansion: map['expansion'] as String?,
        context: map['context'] as String?,
        type: LexiconEntryTypeExt.fromString(map['type'] as String? ?? 'technicalTerm'),
        usageCount: map['usage_count'] as int? ?? 0,
        lastUsed: DateTime.fromMillisecondsSinceEpoch(
            map['last_used'] as int? ?? DateTime.now().millisecondsSinceEpoch),
      );

  LexiconEntry copyWith({
    String? term,
    String? expansion,
    String? context,
    LexiconEntryType? type,
    int? usageCount,
    DateTime? lastUsed,
  }) =>
      LexiconEntry(
        id: id,
        lexiconId: lexiconId,
        term: term ?? this.term,
        expansion: expansion ?? this.expansion,
        context: context ?? this.context,
        type: type ?? this.type,
        usageCount: usageCount ?? this.usageCount,
        lastUsed: lastUsed ?? this.lastUsed,
      );
}

class Lexicon {
  final String id;
  String name;
  String description;
  DateTime createdAt;
  DateTime lastUsedAt;
  List<LexiconEntry> entries;

  Lexicon({
    required this.id,
    required this.name,
    this.description = '',
    DateTime? createdAt,
    DateTime? lastUsedAt,
    List<LexiconEntry>? entries,
  })  : createdAt = createdAt ?? DateTime.now(),
        lastUsedAt = lastUsedAt ?? DateTime.now(),
        entries = entries ?? [];

  /// Build a Whisper prompt string from the most-used entries (max ~220 tokens).
  String toWhisperPrompt() {
    if (entries.isEmpty) return '';
    final sorted = List<LexiconEntry>.from(entries)
      ..sort((a, b) => b.usageCount.compareTo(a.usageCount));

    final buf = StringBuffer();
    for (final e in sorted) {
      final part = e.expansion != null ? '${e.term} (${e.expansion}), ' : '${e.term}, ';
      if ((buf.length + part.length) / 4 > 220) break;
      buf.write(part);
    }
    final s = buf.toString().trimRight();
    return s.endsWith(',') ? s.substring(0, s.length - 1) : s;
  }

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'description': description,
        'created_at': createdAt.millisecondsSinceEpoch,
        'last_used_at': lastUsedAt.millisecondsSinceEpoch,
      };

  factory Lexicon.fromMap(Map<String, dynamic> map) => Lexicon(
        id: map['id'] as String,
        name: map['name'] as String,
        description: map['description'] as String? ?? '',
        createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int? ?? 0),
        lastUsedAt: DateTime.fromMillisecondsSinceEpoch(map['last_used_at'] as int? ?? 0),
      );

  Lexicon copyWith({
    String? name,
    String? description,
    DateTime? lastUsedAt,
    List<LexiconEntry>? entries,
  }) =>
      Lexicon(
        id: id,
        name: name ?? this.name,
        description: description ?? this.description,
        createdAt: createdAt,
        lastUsedAt: lastUsedAt ?? this.lastUsedAt,
        entries: entries ?? this.entries,
      );
}
