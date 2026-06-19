import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'app.dart';
import 'providers/settings_provider.dart';
import 'providers/lexicon_provider.dart';
import 'providers/session_provider.dart';
import 'services/database_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('fr_CA');
  await initializeDateFormatting('en_US');

  final db = DatabaseService();
  await db.initialize();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => SettingsProvider()),
        ChangeNotifierProvider(create: (_) => LexiconProvider(db)),
        ChangeNotifierProvider(create: (_) => SessionProvider(db)),
      ],
      child: const MeetingMinutesApp(),
    ),
  );
}
