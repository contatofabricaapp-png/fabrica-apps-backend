const express = require('express');
const cors = require('cors');
const { Octokit } = require('octokit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Fábrica de Apps Backend v2.1 - Prompt Otimizado!',
    features: ['Claude API', 'Gemini Fallback', 'GitHub Actions', 'Estrutura Flutter Completa', 'Sistema de Licenças Integrado']
  });
});

app.post('/api/generate-app', async (req, res) => {
  try {
    const { appIdea, trialDays = 7, claudeApiKey } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'appIdea é obrigatório' });
    }

    console.log('📱 Gerando código Flutter para:', appIdea.substring(0, 50));
    const flutterCode = await generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey);

    if (!flutterCode) {
      return res.status(500).json({ 
        error: 'Falha ao gerar código com Claude e Gemini' 
      });
    }

    console.log('📦 Criando repositório no GitHub...');
    const repoData = await createGitHubRepo(appIdea);

    console.log('🔧 Criando estrutura completa do Flutter...');
    await createCompleteFlutterStructure(repoData, flutterCode, appIdea);

    // Gerar chaves de licença
    const licenseKeys = generateLicenseKeys(10);

    res.json({
      success: true,
      message: 'App criado! GitHub Actions vai compilar o APK em 10-15 minutos.',
      repoUrl: repoData.html_url,
      actionsUrl: `${repoData.html_url}/actions`,
      licenseKeys: licenseKeys,
      trialDays: trialDays
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar app',
      details: error.message 
    });
  }
});

// ============================================
// GERADOR DE CHAVES DE LICENÇA
// ============================================
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

function generateLicenseKeys(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    key: generateLicenseKey()
  }));
}

async function generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey) {
  try {
    console.log('🤖 Tentando gerar com Claude...');
    const code = await generateWithClaude(appIdea, trialDays, claudeApiKey);
    if (code) {
      console.log('✅ Código gerado com Claude!');
      return code;
    }
  } catch (error) {
    console.log('❌ Claude falhou:', error.message);
  }

  try {
    console.log('🔄 Tentando gerar com Gemini (fallback)...');
    const code = await generateWithGemini(appIdea, trialDays);
    if (code) {
      console.log('✅ Código gerado com Gemini!');
      return code;
    }
  } catch (error) {
    console.log('❌ Gemini falhou:', error.message);
  }

  return null;
}

async function generateWithClaude(appIdea, trialDays, apiKey) {
  const key = apiKey || process.env.CLAUDE_API_KEY;
  
  if (!key) {
    throw new Error('Claude API key não fornecida');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192, // AUMENTADO para evitar código cortado
      messages: [{
        role: 'user',
        content: getPrompt(appIdea, trialDays)
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  let code = data.content[0].text;
  
  // Remove markdown code blocks
  code = code.replace(/```dart\n?/g, '');
  code = code.replace(/```\n?/g, '');
  code = code.trim();
  
  return code;
}

async function generateWithGemini(appIdea, trialDays) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key não configurada');
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: getPrompt(appIdea, trialDays)
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  let code = data.candidates[0].content.parts[0].text;
  
  // Remove markdown code blocks
  code = code.replace(/```dart\n?/g, '');
  code = code.replace(/```\n?/g, '');
  code = code.trim();
  
  return code;
}

// ============================================
// PROMPT OTIMIZADO - PRINCIPAL CORREÇÃO
// ============================================
function getPrompt(appIdea, trialDays) {
  const licenseCode = `
enum LicenseStatus { trial, licensed, expired }

class LicenseManager {
  static const String _firstRunKey = 'app_first_run';
  static const String _licenseKey = 'app_license';
  static const int trialDays = ` + trialDays + `;

  static Future<LicenseStatus> checkLicense() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString(_licenseKey) != null) return LicenseStatus.licensed;
    final firstRun = prefs.getString(_firstRunKey);
    if (firstRun == null) {
      await prefs.setString(_firstRunKey, DateTime.now().toIso8601String());
      return LicenseStatus.trial;
    }
    final startDate = DateTime.parse(firstRun);
    final daysUsed = DateTime.now().difference(startDate).inDays;
    return daysUsed < trialDays ? LicenseStatus.trial : LicenseStatus.expired;
  }

  static Future<int> getRemainingDays() async {
    final prefs = await SharedPreferences.getInstance();
    final firstRun = prefs.getString(_firstRunKey);
    if (firstRun == null) return trialDays;
    final startDate = DateTime.parse(firstRun);
    final daysUsed = DateTime.now().difference(startDate).inDays;
    return (trialDays - daysUsed).clamp(0, trialDays);
  }

  static Future<bool> activate(String key) async {
    final cleaned = key.trim().toUpperCase();
    final regex = RegExp(r'^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}');
    if (regex.hasMatch(cleaned) && cleaned.length == 19) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_licenseKey, cleaned);
      return true;
    }
    return false;
  }
}`;

  const prompt = `Gere um arquivo main.dart COMPLETO e COMPILÁVEL para Flutter.

APP SOLICITADO: ` + appIdea + `

ESTRUTURA OBRIGATÓRIA - Siga EXATAMENTE:

1. IMPORTS (apenas estes dois):
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

2. SISTEMA DE LICENÇAS (copie exatamente após os imports):
` + licenseCode + `

3. WIDGETS DO SISTEMA (copie exatamente):

class TrialBanner extends StatelessWidget {
  final int daysRemaining;
  const TrialBanner({super.key, required this.daysRemaining});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
      color: daysRemaining <= 2 ? Colors.red : Colors.orange,
      child: Text(
        'Teste: ' + daysRemaining.toString() + ' dias restantes',
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class LicenseExpiredScreen extends StatefulWidget {
  const LicenseExpiredScreen({super.key});
  @override
  State<LicenseExpiredScreen> createState() => _LicenseExpiredScreenState();
}

class _LicenseExpiredScreenState extends State<LicenseExpiredScreen> {
  final _ctrl = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _activate() async {
    setState(() { _loading = true; _error = null; });
    await Future.delayed(const Duration(milliseconds: 500));
    final ok = await LicenseManager.activate(_ctrl.text);
    if (ok && mounted) {
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const RestartApp()));
    } else if (mounted) {
      setState(() { _error = 'Chave inválida'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.red.shade800, Colors.red.shade600], begin: Alignment.topCenter, end: Alignment.bottomCenter)),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock, size: 80, color: Colors.white),
                const SizedBox(height: 24),
                const Text('Período de Teste Encerrado', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
                const SizedBox(height: 32),
                TextField(controller: _ctrl, decoration: InputDecoration(labelText: 'Chave de Licença', hintText: 'XXXX-XXXX-XXXX-XXXX', filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), errorText: _error), textCapitalization: TextCapitalization.characters, maxLength: 19),
                const SizedBox(height: 16),
                SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _activate, style: ElevatedButton.styleFrom(padding: const EdgeInsets.all(16), backgroundColor: Colors.green), child: _loading ? const CircularProgressIndicator(color: Colors.white) : const Text('Ativar', style: TextStyle(fontSize: 18, color: Colors.white)))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RestartApp extends StatelessWidget {
  const RestartApp({super.key});
  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<dynamic>>(
      future: Future.wait([LicenseManager.checkLicense(), LicenseManager.getRemainingDays()]),
      builder: (context, snap) {
        if (!snap.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
        return MyApp(licenseStatus: snap.data![0] as LicenseStatus, remainingDays: snap.data![1] as int);
      },
    );
  }
}

4. MAIN (copie exatamente):

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final status = await LicenseManager.checkLicense();
  final days = await LicenseManager.getRemainingDays();
  runApp(MyApp(licenseStatus: status, remainingDays: days));
}

5. MYAPP (copie exatamente):

class MyApp extends StatelessWidget {
  final LicenseStatus licenseStatus;
  final int remainingDays;
  const MyApp({super.key, required this.licenseStatus, required this.remainingDays});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue), useMaterial3: true),
      home: licenseStatus == LicenseStatus.expired ? const LicenseExpiredScreen() : HomeScreen(licenseStatus: licenseStatus, remainingDays: remainingDays),
    );
  }
}

6. HOMESCREEN - Crie a tela principal assim:

class HomeScreen extends StatefulWidget {
  final LicenseStatus licenseStatus;
  final int remainingDays;
  const HomeScreen({super.key, required this.licenseStatus, required this.remainingDays});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('App'), centerTitle: true),
      body: Column(
        children: [
          if (widget.licenseStatus == LicenseStatus.trial) TrialBanner(daysRemaining: widget.remainingDays),
          Expanded(child: _buildContent()),
        ],
      ),
    );
  }
  
  Widget _buildContent() {
    // IMPLEMENTE O CONTEUDO DO APP AQUI
  }
}

REGRAS:
- Código DEVE compilar sem erros
- Feche TODAS as chaves e parênteses
- Máximo 350 linhas
- Use dados mockados em listas
- NÃO use ... para abreviar
- Implemente funcionalidades simples mas funcionais

Responda APENAS com código Dart puro.
SEM crases, SEM markdown, SEM explicações.
Comece com: import 'package:flutter/material.dart';`;

  return prompt;
}

async function createGitHubRepo(appIdea) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  const repoName = `app-${Date.now()}`;
  const shortDesc = `App: ${appIdea.substring(0, 50)}...`;
  
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: repoName,
    description: shortDesc,
    auto_init: false,
    private: false
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return data;
}

async function createCompleteFlutterStructure(repoData, mainDartCode, appIdea) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = [repoData.owner.login, repoData.name];

  const files = [
    { path: 'pubspec.yaml', content: getPubspecContent(appIdea) },
    { path: 'analysis_options.yaml', content: getAnalysisOptions() },
    { path: '.gitignore', content: getGitignore() },
    { path: 'README.md', content: getReadme(appIdea) },
    { path: 'lib/main.dart', content: mainDartCode },
    { path: 'android/app/build.gradle', content: getAppBuildGradle() },
    { path: 'android/build.gradle', content: getRootBuildGradle() },
    { path: 'android/gradle.properties', content: getGradleProperties() },
    { path: 'android/settings.gradle', content: getSettingsGradle() },
    { path: 'android/app/src/main/AndroidManifest.xml', content: getAndroidManifest(appIdea) },
    { path: 'android/app/src/main/kotlin/com/example/app/MainActivity.kt', content: getMainActivity() },
    { path: 'android/gradle/wrapper/gradle-wrapper.properties', content: getGradleWrapperProperties() },
    { path: '.github/workflows/build.yml', content: getWorkflowContent() },
    { path: 'android/app/src/main/res/values/styles.xml', content: getStylesXml() },
    { path: 'android/app/src/main/res/drawable/launch_background.xml', content: getLaunchBackground() },
    // CORREÇÃO APLICADA AQUI: O ícone agora é criado na pasta mipmap correta.
    { path: 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', content: getIconXml() },
  ];

  for (const file of files) {
    try {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: file.path,
        message: `Add ${file.path}`,
        content: Buffer.from(file.content).toString('base64')
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Erro ao criar ${file.path}:`, error.message);
    }
  }
}

function getPubspecContent(appName) {
  const cleanName = appName.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `name: ${cleanName}
description: ${appName.substring(0, 50)}
version: 1.0.0+1

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  shared_preferences: ^2.2.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
`;
}

function getAnalysisOptions() {
  return `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: false
    prefer_const_literals_to_create_immutables: false
    use_key_in_widget_constructors: false
`;
}

function getGitignore() {
  return `.DS_Store
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
.pub-cache/
.pub/
build/
.gradle/
*.iml
*.ipr
*.iws
.idea/
local.properties
`;
}

function getReadme(appIdea) {
  return `# ${appIdea.substring(0, 50)}

App gerado automaticamente pela Fábrica de Apps PRO.

## Funcionalidades

- Sistema de trial integrado
- Licenciamento por chave
- Design Material 3

## Como usar

1. Clone este repositório
2. Execute \`flutter pub get\`
3. Execute \`flutter run\`

## Build APK

\`\`\`bash
flutter build apk --release
\`\`\`

O APK estará em: \`build/app/outputs/flutter-apk/app-release.apk\`
`;
}

function getAppBuildGradle() {
  return `plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
}

android {
    namespace "com.example.app"
    compileSdk 34

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = '1.8'
    }

    defaultConfig {
        applicationId "com.example.app"
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }

    buildTypes {
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
            shrinkResources false
        }
    }
}

flutter {
    source "../.."
}
`;
}

function getRootBuildGradle() {
  return `buildscript {
    ext.kotlin_version = '1.9.0'
    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:\$kotlin_version"
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.buildDir = '../build'
subprojects {
    project.buildDir = "\${rootProject.buildDir}/\${project.name}"
}
subprojects {
    project.evaluationDependsOn(':app')
}

tasks.register("clean", Delete) {
    delete rootProject.buildDir
}
`;
}

function getGradleProperties() {
  return `org.gradle.jvmargs=-Xmx4G -XX:+HeapDumpOnOutOfMemoryError
android.useAndroidX=true
android.enableJetifier=true
`;
}

function getSettingsGradle() {
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
    id "org.jetbrains.kotlin.android" version "1.9.0" apply false
}

include ":app"
`;
}

function getAndroidManifest(appName) {
  const cleanName = appName.substring(0, 30).replace(/[<>&"']/g, '');
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="${cleanName}"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher"> 
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
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

function getMainActivity() {
  return `package com.example.app

import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity()
`;
}

function getGradleWrapperProperties() {
  return `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.3-all.zip
`;
}

function getStylesXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">@drawable/launch_background</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
    </style>
</resources>`;
}

function getLaunchBackground() {
  return `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@android:color/white" />
</layer-list>`;
}

function getIconXml() {
  // Cria um ícone simples (um quadrado azul com círculo branco) para não dar erro
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:fillColor="#2196F3" android:pathData="M0,0h108v108h-108z"/>
    <path android:fillColor="#FFFFFF" android:pathData="M54,54m-20,0a20,20 0 1,1 40,0a20,20 0 1,1 -40,0"/>
</vector>`;
}

function getWorkflowContent() {
  return `name: Build APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Java
      uses: actions/setup-java@v4
      with:
        distribution: 'zulu'
        java-version: '17'
    
    - name: Setup Flutter
      uses: subosito/flutter-action@v2
      with:
        flutter-version: '3.24.0'
        channel: 'stable'
    
    - name: Get dependencies
      run: flutter pub get
    
    - name: Analyze code
      run: flutter analyze --no-fatal-infos --no-fatal-warnings || true
    
    - name: Build APK
      run: flutter build apk --release --no-tree-shake-icons
    
    - name: Upload APK
      uses: actions/upload-artifact@v4
      with:
        name: app-release
        path: build/app/outputs/flutter-apk/app-release.apk
        retention-days: 30
`;
}

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║  🚀 Fábrica de Apps Backend v2.1                      ║
║  📍 Porta: ${PORT}                                       ║
╠═══════════════════════════════════════════════════════╣
║  ✅ Claude API: ${process.env.CLAUDE_API_KEY ? 'Configurada' : '❌ Não configurada'}                        
║  ✅ Gemini API: ${process.env.GEMINI_API_KEY ? 'Configurada' : '❌ Não configurada'}                        
║  ✅ GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configurado' : '❌ Não configurado'}                       
╚═══════════════════════════════════════════════════════╝
  `);
});
