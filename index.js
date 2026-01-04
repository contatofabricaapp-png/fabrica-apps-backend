const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Código do License Manager (será inserido no prompt)
const LICENSE_MANAGER_CODE = `import 'package:shared_preferences/shared_preferences.dart';
import 'package:crypto/crypto.dart';
import 'dart:convert';

enum LicenseStatus { trial, licensed, expired }

class LicenseManager {
  static const String _firstRunKey = 'first_run_date';
  static const String _licenseKey = 'license_key';
  static const int _trialDays = 7;

  static Future<LicenseStatus> checkLicense() async {
    final prefs = await SharedPreferences.getInstance();
    
    final storedLicense = prefs.getString(_licenseKey);
    if (storedLicense != null && _validateLicense(storedLicense)) {
      return LicenseStatus.licensed;
    }

    final firstRunStr = prefs.getString(_firstRunKey);
    final now = DateTime.now();

    if (firstRunStr == null) {
      await prefs.setString(_firstRunKey, now.toIso8601String());
      return LicenseStatus.trial;
    }

    final firstRun = DateTime.parse(firstRunStr);
    final difference = now.difference(firstRun).inDays;

    if (difference < _trialDays) {
      return LicenseStatus.trial;
    }

    return LicenseStatus.expired;
  }

  static Future<int> getDaysRemaining() async {
    final prefs = await SharedPreferences.getInstance();
    final firstRunStr = prefs.getString(_firstRunKey);
    
    if (firstRunStr == null) return _trialDays;

    final firstRun = DateTime.parse(firstRunStr);
    final difference = DateTime.now().difference(firstRun).inDays;
    final remaining = _trialDays - difference;

    return remaining > 0 ? remaining : 0;
  }

  static Future<bool> activateLicense(String licenseKey) async {
    if (!_validateLicense(licenseKey)) {
      return false;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_licenseKey, licenseKey);
    return true;
  }

  static bool _validateLicense(String license) {
    final clean = license.replaceAll('-', '').toUpperCase();
    
    if (clean.length != 16) return false;

    final data = clean.substring(0, 12);
    final checksum = clean.substring(12);
    
    final hash = sha256.convert(utf8.encode(data)).toString();
    final expectedChecksum = hash.substring(0, 4).toUpperCase();

    return checksum == expectedChecksum;
  }
}

class TrialBanner extends StatelessWidget {
  const TrialBanner({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<int>(
      future: LicenseManager.getDaysRemaining(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const SizedBox.shrink();
        
        final days = snapshot.data!;
        
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          color: Colors.orange.shade700,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.access_time, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text(
                'Trial: \$days \${days == 1 ? 'dia restante' : 'dias restantes'}',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class LicenseBlockScreen extends StatefulWidget {
  const LicenseBlockScreen({Key? key}) : super(key: key);

  @override
  State<LicenseBlockScreen> createState() => _LicenseBlockScreenState();
}

class _LicenseBlockScreenState extends State<LicenseBlockScreen> {
  final _licenseController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;

  Future<void> _activateLicense() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final success = await LicenseManager.activateLicense(_licenseController.text);

    setState(() => _isLoading = false);

    if (success) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const MyApp(licenseStatus: LicenseStatus.licensed)),
      );
    } else {
      setState(() => _errorMessage = 'Chave de licença inválida');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_outline, size: 80, color: Colors.red.shade400),
              const SizedBox(height: 24),
              const Text(
                'Período de Trial Expirado',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              const Text(
                'Para continuar usando este aplicativo, insira uma chave de licença válida.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _licenseController,
                decoration: InputDecoration(
                  labelText: 'Chave de Licença',
                  hintText: 'XXXX-XXXX-XXXX-XXXX',
                  border: const OutlineInputBorder(),
                  errorText: _errorMessage,
                ),
                textAlign: TextAlign.center,
                style: const TextStyle(letterSpacing: 2),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _activateLicense,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.all(16),
                  ),
                  child: _isLoading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Ativar Licença'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _licenseController.dispose();
    super.dispose();
  }
}`;

// Função para gerar o prompt
function getPrompt(appIdea, trialDays) {
  return `Atue como um desenvolvedor Flutter sênior com 10+ anos de experiência.

Gere EXCLUSIVAMENTE o conteúdo do arquivo lib/main.dart completo e funcional.

NÃO gere:
* Projeto Flutter completo
* Pastas android/, ios/, web/, windows/
* Arquivos Gradle, Kotlin ou configurações nativas
* Instruções de build ou compilação
* Código em markdown (\`\`\`dart ou \`\`\`)

O código DEVE:
* Ser compatível com Flutter stable atual
* Funcionar quando colado em um projeto criado com: flutter create nome_do_app
* Usar Material Design 3
* Ter código limpo, organizado e profissional
* Usar StatefulWidget/StatelessWidget apropriadamente
* Implementar todas as funcionalidades descritas (nada de placeholders ou TODOs)
* Usar apenas Flutter SDK padrão + dependências declaradas

SISTEMA DE TRIAL / LICENÇA (OBRIGATÓRIO):

Considere que o projeto já terá no pubspec.yaml:
dependencies:
  shared_preferences: ^2.2.2
  crypto: ^3.0.3

NÃO altere pubspec.yaml. NÃO gere código fora do main.dart.

Copie EXATAMENTE este código no início do arquivo (após os imports Flutter):

${LICENSE_MANAGER_CODE}

INTEGRAÇÃO OBRIGATÓRIA:

1. Use este main():
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final licenseStatus = await LicenseManager.checkLicense();
  runApp(MyApp(licenseStatus: licenseStatus));
}

2. O MaterialApp deve usar:
home: licenseStatus == LicenseStatus.expired 
  ? LicenseBlockScreen() 
  : HomeScreen(licenseStatus: licenseStatus)

3. Se estiver em trial, exibir TrialBanner no topo da HomeScreen

APP SOLICITADO:
${appIdea}

IMPORTANTE:
* Gere APENAS código Dart válido
* Gere UM ÚNICO ARQUIVO main.dart completo
* NÃO use markdown backticks (\`\`\`dart ou \`\`\`)
* NÃO adicione explicações ou comentários desnecessários
* Responda SOMENTE com o código

Responda APENAS com o código completo do main.dart, SEM qualquer formatação markdown.`;
}

// Função para gerar código com Claude
async function generateWithClaude(prompt) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    let code = response.data.content[0].text;
    code = code.replace(/```dart\n?/g, '');
    code = code.replace(/```\n?/g, '');
    code = code.trim();
    return code;
  } catch (error) {
    console.error('Erro ao chamar Claude:', error.response?.data || error.message);
    throw error;
  }
}

// Função para gerar código com Gemini
async function generateWithGemini(prompt) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      }
    );

    let code = response.data.candidates[0].content.parts[0].text;
    code = code.replace(/```dart\n?/g, '');
    code = code.replace(/```\n?/g, '');
    code = code.trim();
    return code;
  } catch (error) {
    console.error('Erro ao chamar Gemini:', error.response?.data || error.message);
    throw error;
  }
}

// Template do pubspec.yaml
function getPubspecTemplate(appName) {
  return `name: ${appName.toLowerCase().replace(/\s+/g, '_')}
description: App gerado pela Fábrica de Apps
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.6
  shared_preferences: ^2.2.2
  crypto: ^3.0.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`;
}

// Template do build.gradle (app)
function getBuildGradleTemplate() {
  return `plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
}

def localProperties = new Properties()
def localPropertiesFile = rootProject.file('local.properties')
if (localPropertiesFile.exists()) {
    localPropertiesFile.withReader('UTF-8') { reader ->
        localProperties.load(reader)
    }
}

def flutterVersionCode = localProperties.getProperty('flutter.versionCode')
if (flutterVersionCode == null) {
    flutterVersionCode = '1'
}

def flutterVersionName = localProperties.getProperty('flutter.versionName')
if (flutterVersionName == null) {
    flutterVersionName = '1.0'
}

android {
    namespace "com.fabricaapps.app"
    compileSdk flutter.compileSdkVersion
    ndkVersion flutter.ndkVersion

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = '1.8'
    }

    sourceSets {
        main.java.srcDirs += 'src/main/kotlin'
    }

    defaultConfig {
        applicationId "com.fabricaapps.app"
        minSdkVersion 21
        targetSdkVersion flutter.targetSdkVersion
        versionCode flutterVersionCode.toInteger()
        versionName flutterVersionName
    }

    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}

flutter {
    source '../..'
}

dependencies {}
`;
}

// Template do settings.gradle
function getSettingsGradleTemplate() {
  return `pluginManagement {
    def flutterSdkPath = {
        def properties = new Properties()
        file("local.properties").withInputStream { properties.load(it) }
        def flutterSdkPath = properties.getProperty("flutter.sdk")
        assert flutterSdkPath != null, "flutter.sdk not set in local.properties"
        return flutterSdkPath
    }()

    includeBuild("\${flutterSdkPath}/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id "dev.flutter.flutter-plugin-loader" version "1.0.0"
    id "com.android.application" version "8.1.0" apply false
    id "org.jetbrains.kotlin.android" version "1.8.22" apply false
}

include ":app"
`;
}

// Template do AndroidManifest.xml
function getAndroidManifestTemplate(appName) {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="${appName}"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:taskAffinity=""
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <meta-data
              android:name="io.flutter.embedding.android.NormalTheme"
              android:resource="@style/NormalTheme"
              />
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
    <uses-permission android:name="android.permission.INTERNET"/>
</manifest>
`;
}

// Template do MainActivity.kt
function getMainActivityTemplate() {
  return `package com.fabricaapps.app

import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity() {
}
`;
}

// Função handler compartilhada para ambas as rotas
async function handleGenerate(req, res) {
  try {
    const { appIdea, apiKey, trialDays = 7 } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'Descrição do app é obrigatória' });
    }

    const useClaudeAPI = apiKey || ANTHROPIC_API_KEY;
    const prompt = getPrompt(appIdea, trialDays);

    console.log('Gerando código...');
    
    let mainDartCode;
    if (useClaudeAPI) {
      mainDartCode = await generateWithClaude(prompt);
    } else {
      mainDartCode = await generateWithGemini(prompt);
    }

    const appName = appIdea.split(' ').slice(0, 3).join(' ');

    const projectStructure = {
      'lib/main.dart': mainDartCode,
      'pubspec.yaml': getPubspecTemplate(appName),
      'android/app/build.gradle': getBuildGradleTemplate(),
      'android/settings.gradle': getSettingsGradleTemplate(),
      'android/app/src/main/AndroidManifest.xml': getAndroidManifestTemplate(appName),
      'android/app/src/main/kotlin/com/fabricaapps/app/MainActivity.kt': getMainActivityTemplate(),
      'README.md': `# ${appName}\n\nApp gerado pela Fábrica de Apps\n\nPeríodo de trial: ${trialDays} dias`
    };

    res.json({
      success: true,
      files: projectStructure,
      message: 'App gerado com sucesso!'
    });

  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({
      error: 'Erro ao gerar app',
      details: error.message
    });
  }
}

// AMBAS AS ROTAS (compatibilidade com frontend antigo e novo)
app.post('/generate', handleGenerate);
app.post('/api/generate-app', handleGenerate);

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Fábrica de Apps Backend',
    version: '2.0.0'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
