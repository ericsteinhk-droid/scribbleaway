enum SessionLanguage { frCA, enUS }

extension SessionLanguageExt on SessionLanguage {
  String get whisperCode => this == SessionLanguage.frCA ? 'fr' : 'en';
  String get displayName =>
      this == SessionLanguage.frCA ? 'Français (Canada)' : 'English (US)';

  static SessionLanguage fromString(String v) =>
      SessionLanguage.values.firstWhere((e) => e.name == v,
          orElse: () => SessionLanguage.frCA);
}

enum SessionStatus { pending, transcribing, transcribed, generatingMinutes, complete, error }

class MeetingSession {
  final String id;
  String title;
  DateTime date;
  SessionLanguage language;
  String? lexiconId;
  String? lexiconName;
  String? audioFilePath;
  String? transcription;
  String? minutes;
  SessionStatus status;
  String? errorMessage;
  DateTime createdAt;
  DateTime updatedAt;

  MeetingSession({
    required this.id,
    required this.title,
    DateTime? date,
    this.language = SessionLanguage.frCA,
    this.lexiconId,
    this.lexiconName,
    this.audioFilePath,
    this.transcription,
    this.minutes,
    this.status = SessionStatus.pending,
    this.errorMessage,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : date = date ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  Map<String, dynamic> toMap() => {
        'id': id,
        'title': title,
        'date': date.millisecondsSinceEpoch,
        'language': language.name,
        'lexicon_id': lexiconId,
        'lexicon_name': lexiconName,
        'audio_file_path': audioFilePath,
        'transcription': transcription,
        'minutes': minutes,
        'status': status.name,
        'error_message': errorMessage,
        'created_at': createdAt.millisecondsSinceEpoch,
        'updated_at': updatedAt.millisecondsSinceEpoch,
      };

  factory MeetingSession.fromMap(Map<String, dynamic> map) => MeetingSession(
        id: map['id'] as String,
        title: map['title'] as String,
        date: DateTime.fromMillisecondsSinceEpoch(map['date'] as int? ?? 0),
        language: SessionLanguageExt.fromString(map['language'] as String? ?? 'frCA'),
        lexiconId: map['lexicon_id'] as String?,
        lexiconName: map['lexicon_name'] as String?,
        audioFilePath: map['audio_file_path'] as String?,
        transcription: map['transcription'] as String?,
        minutes: map['minutes'] as String?,
        status: SessionStatus.values.firstWhere(
          (e) => e.name == (map['status'] as String? ?? 'pending'),
          orElse: () => SessionStatus.pending,
        ),
        errorMessage: map['error_message'] as String?,
        createdAt:
            DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int? ?? 0),
        updatedAt:
            DateTime.fromMillisecondsSinceEpoch(map['updated_at'] as int? ?? 0),
      );

  MeetingSession copyWith({
    String? title,
    DateTime? date,
    SessionLanguage? language,
    String? lexiconId,
    String? lexiconName,
    String? audioFilePath,
    String? transcription,
    String? minutes,
    SessionStatus? status,
    String? errorMessage,
  }) =>
      MeetingSession(
        id: id,
        title: title ?? this.title,
        date: date ?? this.date,
        language: language ?? this.language,
        lexiconId: lexiconId ?? this.lexiconId,
        lexiconName: lexiconName ?? this.lexiconName,
        audioFilePath: audioFilePath ?? this.audioFilePath,
        transcription: transcription ?? this.transcription,
        minutes: minutes ?? this.minutes,
        status: status ?? this.status,
        errorMessage: errorMessage ?? this.errorMessage,
        createdAt: createdAt,
        updatedAt: DateTime.now(),
      );
}
