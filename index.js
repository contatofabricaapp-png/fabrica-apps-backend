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
    features: ['Claude API', 'Gemini Fallback', 'GitHub Actions']
  });
});

// Rota para gerar app
app.post('/api/generate-app', async (req, res) => {
  try {
    const { appIdea, trialDays, claudeApiKey } = req.body;

    if (!appIdea) {
      return res.status(400).json({ error: 'appIdea é obrigatório' });
    }

    // 1. Gerar código com Claude ou Gemini (com fallback)
    console.log('Gerando código Flutter...');
    const flutterCode = await generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey);

    if (!flutterCode) {
      return res.status(500).json({ 
        error: 'Falha ao gerar código com Claude e Gemini' 
      });
    }

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

// Função para gerar código com fallback Claude → Gemini
async function generateFlutterCodeWithFallback(appIdea, trialDays, claudeApiKey) {
  // Tenta Claude primeiro
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

  // Se Claude falhar, tenta Gemini
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
  return `Gere um app Flutter COMPLETO e FUNCIONAL para: ${appIdea}

IMPORTANTE - Sistema de Trial de ${trialDays} dias:

Adicione estas dependências no pubspec.yaml:
- shared_preferences: ^2.2.2
- crypto: ^3.0.3

Integre o sistema de licenciamento com:
- Trial de ${trialDays} dias
- Banner mostrando dias restantes
- Tela de bloqueio quando expirar
- Validação de chave de licença (formato: XXXX-XXXX-XXXX-XXXX)

Use Material Design 3, código limpo e funcional.
Responda APENAS com o código completo do main.dart.`;
}

// Função para criar repositório no GitHub
async function createGitHubRepo(appIdea) {
  const octokit = new Octokit({ 
    auth: process.env.GITHUB_TOKEN 
  });

  const repoName = `app-${Date.now()}`;
  
  const shortDescription = `App: ${appIdea.substring(0, 50)}...`;

const { data } = await octokit.rest.repos.createForAuthenticatedUser({
  name: repoName,
  description: shortDescription,
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

  // Aguarda repo estar pronto
  await new Promise(resolve => setTimeout(resolve, 2000));

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
version: 1.0.0+1

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
  console.log(`✅ Claude API: ${process.env.CLAUDE_API_KEY ? 'Configurada' : 'Não configurada'}`);
  console.log(`✅ Gemini API: ${process.env.GEMINI_API_KEY ? 'Configurada' : 'Não configurada'}`);
  console.log(`✅ GitHub Token: ${process.env.GITHUB_TOKEN ? 'Configurado' : 'Não configurado'}`);
});
