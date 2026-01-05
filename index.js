const express = require('express');
const cors = require('cors');
const axios = require('axios');
const archiver = require('archiver');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Função para gerar o prompt
function getPrompt(appIdea, trialDays) {
  return `Você é um desenvolvedor Flutter SÊNIOR com 10+ anos de experiência.

Gere um app Flutter COMPLETO, FUNCIONAL e PROFISSIONAL para: ${appIdea}

REQUISITOS TÉCNICOS:
- Use Material Design 3
- Código limpo, comentado e bem estruturado
- Siga as melhores práticas do Flutter
- Use StatefulWidget/StatelessWidget apropriadamente
- Nomenclatura clara e intuitiva
- Tratamento de erros adequado
- Performance otimizada

IMPORTANTE - Sistema de Trial de ${trialDays} dias:

Adicione estas dependências no pubspec.yaml:
- shared_preferences: ^2.2.2
- crypto: ^3.0.3

Integre o sistema de licenciamento com:
- Trial de ${trialDays} dias
- Banner mostrando dias restantes durante o trial
- Tela de bloqueio profissional quando expirar
- Validação de chave de licença (formato: XXXX-XXXX-XXXX-XXXX)
- Mensagens claras e amigáveis ao usuário

INTERFACE:
- Design moderno e atrativo
- Cores profissionais e harmoniosas  
- Navegação intuitiva
- Feedback visual em todas as ações
- Animações suaves (onde apropriado)

FUNCIONALIDADES:
- Todas as funcionalidades devem ser REAIS e FUNCIONAIS
- Não use placeholders ou "TODO"
- Dados devem ser salvos e persistidos
- Validação de formulários
- Mensagens de erro/sucesso claras

Responda APENAS com o código completo do main.dart, SEM markdown backticks.
Não inclua \`\`\`dart no início nem \`\`\` no final.`;
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
    // Limpa markdown backticks se existirem
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
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
    // Limpa markdown backticks se existirem
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

// Template do settings.gradle (CORRIGIDO)
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

// Endpoint principal
app.post('/generate', async (req, res) => {
  try {
    const { appIdea, apiKey, trialDays = 7 } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'Descrição do app é obrigatória' });
    }

    // Decide qual API usar
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

    // Cria estrutura de arquivos
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
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Fábrica de Apps Backend',
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
