import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'theme.dart';
import 'providers/settings_provider.dart';
import 'providers/lexicon_provider.dart';
import 'providers/session_provider.dart';
import 'screens/home_screen.dart';
import 'screens/settings_screen.dart';

class MeetingMinutesApp extends StatefulWidget {
  const MeetingMinutesApp({super.key});

  @override
  State<MeetingMinutesApp> createState() => _MeetingMinutesAppState();
}

class _MeetingMinutesAppState extends State<MeetingMinutesApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SettingsProvider>().load().then((_) {
        context.read<LexiconProvider>().loadAll();
        context.read<SessionProvider>().loadAll();
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ScribbleAway',
      theme: buildTheme(),
      debugShowCheckedModeBanner: false,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('fr', 'CA'),
        Locale('en', 'US'),
      ],
      locale: const Locale('fr', 'CA'),
      home: Consumer<SettingsProvider>(
        builder: (ctx, settings, _) {
          if (!settings.loaded) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          if (!settings.isConfigured) {
            return const SettingsScreen(firstRun: true);
          }
          return const HomeScreen();
        },
      ),
      routes: {
        '/settings': (_) => const SettingsScreen(),
        '/home': (_) => const HomeScreen(),
      },
    );
  }
}
