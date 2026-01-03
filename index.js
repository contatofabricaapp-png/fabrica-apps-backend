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
    message: 'Fábrica de Apps Backend funcionando!' 
  });
});

// Rota para gerar app
app.post('/api/generate-app', async (req, res) => {
  try {
    const { appIdea, trialDays, claudeApiKey } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'appIdea é obrigatório' });
    }

    if (!claudeApiKey) {
      return res.status(400).json({ error: 'claudeApiKey é obrigatório' });
    }

    // 1. Gerar código com Claude
    console.log('Gerando código Flutter com Claude...');
    const flutterCode = await generateFlutterCode(appIdea, trialDays, claudeApiKey);

    // 2. Criar repositório no GitHub
    console.log('Criando repositório no GitHub...');
    const repoUrl = await createGitHubRepo(appIdea);

    // 3. Fazer commit do código
    console.log('Fazendo commit do código...');
    await commitFlutterCode(repoUrl, flutterCode);

    // 4. Retornar info
    res.json({
      success: true,
      message: 'App criado! GitHub Actions vai compilar o APK em 10-15 minutos.',
      repoUrl: repoUrl,
      actionsUrl: `${repoUrl}/actions`
    });

  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao gerar app',
      details: error.message 
    });
  }
});

// Função para gerar código Flutter com Claude
async function generateFlutterCode(appIdea, trialDays, claudeApiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Gere um app Flutter COMPLETO para: ${appIdea}
        
Com sistema de trial de ${trialDays} dias integrado.
Responda APENAS com o código completo do main.dart.`
      }]
    })
  });

  const data = await response.json();
  return data.content[0].text;
}

// Função para criar repositório no GitHub
async function createGitHubRepo(appIdea) {
  const octokit = new Octokit({ 
    auth: process.env.GITHUB_TOKEN 
  });

  const repoName = `app-${Date.now()}`;
  
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: repoName,
    description: `App gerado: ${appIdea}`,
    auto_init: true,
    private: false
  });

  return data.html_url;
}

// Função para fazer commit do código
async function commitFlutterCode(repoUrl, code) {
  const octokit = new Octokit({ 
    auth: process.env.GITHUB_TOKEN 
  });

  const [owner, repo] = repoUrl.split('/').slice(-2);

  // Criar pubspec.yaml
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'pubspec.yaml',
    message: 'Add pubspec.yaml',
    content: Buffer.from(getPubspecContent()).toString('base64')
  });

  // Criar main.dart
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'lib/main.dart',
    message: 'Add main.dart',
    content: Buffer.from(code).toString('base64')
  });

  // Criar GitHub Action
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: '.github/workflows/build.yml',
    message: 'Add build workflow',
    content: Buffer.from(getWorkflowContent()).toString('base64')
  });
}

// Template do pubspec.yaml
function getPubspecContent() {
  return `name: generated_app
description: App gerado automaticamente
version: 1.0.0

environment:
  sdk: '>=3.0.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  shared_preferences: ^2.2.2
  crypto: ^3.0.3

flutter:
  uses-material-design: true
`;
}

// Template do GitHub Actions
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
      uses: actions/upload-artifact@v3
      with:
        name: app-release
        path: build/app/outputs/flutter-apk/app-release.apk
`;
}

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando na porta ${PORT}`);
});
