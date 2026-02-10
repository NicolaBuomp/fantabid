import 'dart:io'; // Serve per rilevare se siamo su Android o iOS

import 'package:dio/dio.dart'; // Client HTTP per chiamare il tuo server Node.js
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart'; // Gestione variabili d'ambiente
import 'package:supabase_flutter/supabase_flutter.dart'; // Auth e DB

Future<void> main() async {
  // Assicura che il binding dei widget sia inizializzato prima di fare operazioni asincrone
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Carica le variabili d'ambiente dal file .env
  // Assicurati di aver aggiunto ".env" agli assets nel pubspec.yaml!
  try {
    await dotenv.load(fileName: ".env");
  } catch (e) {
    debugPrint(
      "ERRORE: Impossibile caricare il file .env. Controlla che esista e sia negli assets.",
    );
  }

  // 2. Inizializza Supabase usando le chiavi caricate
  await Supabase.initialize(
    url: dotenv.env['SUPABASE_URL'] ?? '',
    anonKey: dotenv.env['SUPABASE_ANON_KEY'] ?? '',
  );

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FantaBid',
      theme: ThemeData(primarySwatch: Colors.blue, useMaterial3: true),
      home: const TestScreen(),
    );
  }
}

class TestScreen extends StatefulWidget {
  const TestScreen({super.key});

  @override
  State<TestScreen> createState() => _TestScreenState();
}

class _TestScreenState extends State<TestScreen> {
  // Variabili di stato per la UI
  String _authStatus = 'Non loggato';
  String _serverResult = 'Nessuna chiamata effettuata';
  bool _isLoading = false;

  // Controller per i campi di testo (precompilati per comodità durante i test)
  final _emailController = TextEditingController(text: 'admin@fantabid.com');
  final _passController = TextEditingController(text: 'passwordSegreta123');

  // --- FUNZIONE 1: LOGIN CON SUPABASE ---
  Future<void> _login() async {
    setState(() => _isLoading = true);
    try {
      final response = await Supabase.instance.client.auth.signInWithPassword(
        email: _emailController.text,
        password: _passController.text,
      );

      setState(() {
        _authStatus = 'LOGGATO COME:\n${response.user?.email}';
      });
    } catch (e) {
      setState(() {
        _authStatus = 'ERRORE LOGIN:\n$e';
      });
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // --- FUNZIONE 2: CHIAMATA AL SERVER NODE.JS ---
  Future<void> _callProtectedApi() async {
    setState(() {
      _isLoading = true;
      _serverResult = 'Chiamata in corso...';
    });

    // 1. Recupera l'URL base dal .env
    String baseUrl = dotenv.env['API_BASE_URL'] ?? 'http://localhost:3000';

    // 2. Fix per Emulatore Android:
    // L'emulatore Android vede "localhost" come se stesso.
    // Per raggiungere il PC ospite bisogna usare "10.0.2.2".
    if (Platform.isAndroid && baseUrl.contains('localhost')) {
      baseUrl = baseUrl.replaceFirst('localhost', '10.0.2.2');
      debugPrint("Android rilevato: cambio localhost in 10.0.2.2");
    }

    // 3. Recupera il Token JWT corrente da Supabase
    final session = Supabase.instance.client.auth.currentSession;
    final token = session?.accessToken;

    if (token == null) {
      setState(() {
        _serverResult = 'ERRORE: Non sei loggato. Fai prima il login.';
        _isLoading = false;
      });
      return;
    }

    try {
      // 4. Configura Dio e fai la chiamata
      final dio = Dio(
        BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );

      final response = await dio.get(
        '/protected', // L'endpoint del tuo server
        options: Options(
          headers: {
            'Authorization': 'Bearer $token', // Invia il token nell'header
          },
        ),
      );

      setState(() {
        _serverResult = 'SUCCESSO (Status 200):\n${response.data}';
      });
    } on DioException catch (e) {
      // Gestione errori specifica per HTTP
      String errorMsg = 'Errore di connessione: ${e.message}';
      if (e.response != null) {
        // Il server ha risposto (es. 401 Unauthorized, 500 Server Error)
        errorMsg =
            'Errore Server (${e.response?.statusCode}):\n${e.response?.data}';
      }
      setState(() {
        _serverResult = errorMsg;
      });
    } catch (e) {
      setState(() {
        _serverResult = 'Errore generico: $e';
      });
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // --- LOGOUT ---
  Future<void> _logout() async {
    await Supabase.instance.client.auth.signOut();
    setState(() {
      _authStatus = 'Non loggato';
      _serverResult = 'Sessione terminata';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('FantaBid Mobile Dev'),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _logout,
            tooltip: 'Logout',
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Sezione Stato Auth
            Card(
              color: _authStatus.contains('LOGGATO')
                  ? Colors.green[50]
                  : Colors.red[50],
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  children: [
                    const Text(
                      "Stato Autenticazione",
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 5),
                    Text(_authStatus, textAlign: TextAlign.center),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Sezione Login Form
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(
                labelText: 'Email',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.email),
              ),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passController,
              decoration: const InputDecoration(
                labelText: 'Password',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.lock),
              ),
              obscureText: true,
            ),
            const SizedBox(height: 24),

            if (_isLoading)
              const Center(child: CircularProgressIndicator())
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ElevatedButton.icon(
                    onPressed: _login,
                    icon: const Icon(Icons.login),
                    label: const Text('1. Login con Supabase'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Divider(),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: _callProtectedApi,
                    icon: const Icon(Icons.cloud_sync),
                    label: const Text('2. Test Server Node.js (Protetto)'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.indigo,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ],
              ),

            const SizedBox(height: 24),

            // Sezione Risultato Server
            const Text(
              "Risultato Server:",
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey),
                borderRadius: BorderRadius.circular(8),
                color: Colors.grey[100],
              ),
              child: Text(
                _serverResult,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
