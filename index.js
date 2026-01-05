const express = require('express');
const cors = require('cors');
const { Octokit } = require('octokit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'Fábrica de Apps Backend funcionando!',
    features: ['Claude API', 'Gemini Fallback', 'GitHub Actions', 'Estrutura Flutter Completa']
  });
});

// Rota para gerar app
app.post('/api/generate-app', async (req, res) => {
  try {
    const { appIdea, trialDays, claudeApiKey } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'appIdea é obrigatório' });
    }

    console.log('Gerando código Flutter...');
    const flutterCode = await generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey);

    if (!flutterCode) {
      return res.status(500).json({ 
        error: 'Falha ao gerar código com Claude e Gemini' 
      });
    }

    console.log('Criando repositório no GitHub...');
    const repoData = await createGitHubRepo(appIdea);

    console.log('Criando estrutura completa do Flutter...');
    await createCompleteFlutterStructure(repoData, flutterCode, appIdea);

    res.json({
      success: true,
      message: 'App criado! GitHub Actions vai compilar o APK em 10-15 minutos.',
      repoUrl: repoData.html_url,
      actionsUrl: `${repoData.html_url}/actions`
    });

  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar app',
      details: error.message 
    });
  }
});

// Função para gerar código com fallback Claude → Gemini
async function generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey) {
  try {
    console.log('Tentando gerar com Claude...');
    const code = await generateWithClaude(appIdea, trialDays, claudeApiKey);
    if (code) {
      console.log('✅ Código gerado com Claude!');
      return code;
    }
  } catch (error) {
    console.log('❌ Claude falhou:', error.message);
  }

  try {
    console.log('Tentando gerar com Gemini (fallback)...');
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

// Gerar com Claude
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
      max_tokens: 4096,
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
  return data.content[0].text;
}

// Gerar com Gemini
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
  return data.candidates[0].content.parts[0].text;
}

// Prompt unificado
function getPrompt(appIdea, trialDays) {
  return 'Atue como um desenvolvedor Flutter sênior.

Gere EXCLUSIVAMENTE o conteúdo do arquivo: lib/main.dart

NÃO gere:
- projeto Flutter completo
- pasta android/, ios/, web/, windows/
- arquivos Gradle, Kotlin ou configurações nativas
- instruções de build

O código DEVE:
- Ser compatível com Flutter stable atual
- Funcionar quando colado em um projeto criado com: flutter create nome_do_app
- Usar Material Design 3
- Ter código limpo, organizado e funcional
- Usar apenas Flutter SDK padrão + dependências declaradas

--------------------------------------------------
DEPENDÊNCIAS (já no pubspec.yaml - NÃO altere)
--------------------------------------------------
shared_preferences: ^2.2.2
crypto: ^3.0.3

--------------------------------------------------
SISTEMA DE TRIAL / LICENÇA (OBRIGATÓRIO)
--------------------------------------------------

Copie EXATAMENTE este código do LicenseManager após os imports:

${getLicenseManagerCode(trialDays)}

--------------------------------------------------
INTEGRAÇÃO OBRIGATÓRIA
--------------------------------------------------

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

--------------------------------------------------
APP SOLICITADO
--------------------------------------------------
${appIdea}

--------------------------------------------------
FORMATO DE RESPOSTA
--------------------------------------------------
- APENAS código Dart puro
- SEM \`\`\`dart no início
- SEM \`\`\` no final  
- SEM explicações ou comentários extras
- Comece direto com: import 'package:flutter/material.dart';
- Termine com o último } da classe`;
}

function getLicenseManagerCode(trialDays) {
  return `// ===== SISTEMA DE LICENÇA E TRIAL =====
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';

class LicenseManager {
  static const String _firstRunKey = 'first_run_date';
  static const String _licenseKey = 'license_key';
  static const int _trialDays = ${trialDays};
  static const String _secretKey = 'SECRET_${Date.now()}';

  static Future<LicenseStatus> checkLicense() async {
    final prefs = await SharedPreferences.getInstance();
    final storedLicense = prefs.getString(_licenseKey);
    if (storedLicense != null) return LicenseStatus.licensed;
    
    final firstRunString = prefs.getString(_firstRunKey);
    if (firstRunString == null) {
      await prefs.setString(_firstRunKey, DateTime.now().toIso8601String());
      return LicenseStatus.trial;
    }
    
    final firstRun = DateTime.parse(firstRunString);
    final daysPassed = DateTime.now().difference(firstRun).inDays;
    return daysPassed < _trialDays ? LicenseStatus.trial : LicenseStatus.expired;
  }

  static Future<int> getDaysRemaining() async {
    final prefs = await SharedPreferences.getInstance();
    final firstRunString = prefs.getString(_firstRunKey);
    if (firstRunString == null) return _trialDays;
    final firstRun = DateTime.parse(firstRunString);
    final daysPassed = DateTime.now().difference(firstRun).inDays;
    return (_trialDays - daysPassed).clamp(0, _trialDays);
  }

  static Future<bool> activateLicense(String license) async {
    if (license.length == 19) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_licenseKey, license);
      return true;
    }
    return false;
  }
}

enum LicenseStatus { trial, licensed, expired }

class LicenseBlockScreen extends StatefulWidget {
  @override
  _LicenseBlockScreenState createState() => _LicenseBlockScreenState();
}

class _LicenseBlockScreenState extends State<LicenseBlockScreen> {
  final _controller = TextEditingController();
  bool _loading = false;
  String? _error;

  void _activate() async {
    setState(() { _loading = true; _error = null; });
    await Future.delayed(Duration(seconds: 1));
    final success = await LicenseManager.activateLicense(_controller.text.trim().toUpperCase());
    if (success) {
      Navigator.of(context).pushReplacementNamed('/');
    } else {
      setState(() { _error = 'Chave inválida!'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.red.shade900, Colors.red.shade700],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.lock_outline, size: 80, color: Colors.white),
                SizedBox(height: 30),
                Text('Período de Teste Expirado', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white), textAlign: TextAlign.center),
                SizedBox(height: 16),
                Text('Seu período de ${trialDays} dias terminou.\\nInsira uma chave de licença.', style: TextStyle(fontSize: 16, color: Colors.white70), textAlign: TextAlign.center),
                SizedBox(height: 50),
                TextField(
                  controller: _controller,
                  decoration: InputDecoration(
                    labelText: 'Chave de Licença',
                    hintText: 'XXXX-XXXX-XXXX-XXXX',
                    prefixIcon: Icon(Icons.vpn_key),
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    errorText: _error,
                  ),
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 19,
                  enabled: !_loading,
                ),
                SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _activate,
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                    child: _loading ? CircularProgressIndicator(color: Colors.white) : Text('Ativar Licença', style: TextStyle(fontSize: 18, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class TrialBanner extends StatelessWidget {
  final int daysRemaining;
  const TrialBanner({required this.daysRemaining});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.orange.shade700, Colors.orange.shade500])),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.access_time, color: Colors.white, size: 20),
          SizedBox(width: 8),
          Text('Teste: $daysRemaining dia${daysRemaining == 1 ? "" : "s"} restante${daysRemaining == 1 ? "" : "s"}', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        ],
      ),
    );
  }
}';
}

// Criar repositório
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

// Criar estrutura COMPLETA do Flutter
async function createCompleteFlutterStructure(repoData, mainDartCode, appIdea) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = [repoData.owner.login, repoData.name];

  const files = [
    // Root files
    { path: 'pubspec.yaml', content: getPubspecContent(appIdea) },
    { path: 'analysis_options.yaml', content: getAnalysisOptions() },
    { path: '.gitignore', content: getGitignore() },
    { path: 'README.md', content: getReadme(appIdea) },
    
    // Lib
    { path: 'lib/main.dart', content: mainDartCode },
    
    // Android structure
    { path: 'android/app/build.gradle', content: getAppBuildGradle() },
    { path: 'android/build.gradle', content: getRootBuildGradle() },
    { path: 'android/gradle.properties', content: getGradleProperties() },
    { path: 'android/settings.gradle', content: getSettingsGradle() },
    { path: 'android/app/src/main/AndroidManifest.xml', content: getAndroidManifest(appIdea) },
    { path: 'android/app/src/main/kotlin/com/example/app/MainActivity.kt', content: getMainActivity() },
    { path: 'android/gradle/wrapper/gradle-wrapper.properties', content: getGradleWrapperProperties() },
    
    // GitHub Actions (COM V4!)
    { path: '.github/workflows/build.yml', content: getWorkflowContent() },
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

// ===== TEMPLATES DOS ARQUIVOS =====

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
  crypto: ^3.0.3

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
`;
}

function getReadme(appIdea) {
  return `# ${appIdea.substring(0, 50)}

App gerado automaticamente pela Fábrica de Apps.

## Como usar

1. Clone este repositório
2. Execute \`flutter pub get\`
3. Execute \`flutter run\`

## Build APK

\`\`\`bash
flutter build apk --release
\`\`\`
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
    repositories {
        google()
        mavenCentral()
    }

    dependencies {
        classpath "com.android.tools.build:gradle:8.1.0"
        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.0"
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
`;
}

function getGradleProperties() {
  return `org.gradle.jvmargs=-Xmx4G
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
    id "dev.flutter.flutter-gradle-plugin" version "1.0.0" apply false
}

include ":app"
`;
}

function getAndroidManifest(appName) {
  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:label="${appName.substring(0, 30)}"
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

function getWorkflowContent() {
  return `name: Build APK

on:
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Java
      uses: actions/setup-java@v3
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
    
    - name: Build APK
      run: flutter build apk --release
    
    - name: Upload APK
      uses: actions/upload-artifact@v4
      with:
        name: app-release
        path: build/app/outputs/flutter-apk/app-release.apk
`;
}

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
  console.log(`✅ Claude API: ${process.env.CLAUDE_API_KEY ? 'Configurada' : 'Não configurada'}`);
  console.log(`✅ Gemini API: ${process.env.GEMINI_API_KEY ? 'Configurada' : 'Não configurada'}`);
  console.log(`✅ GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configurado' : 'Não configurado'}`);
});
