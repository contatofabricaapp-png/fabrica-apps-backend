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
    message: 'Fábrica de Apps Backend v3.0 - Corrigido!',
    features: ['Claude API', 'Gemini Fallback', 'GitHub Actions', 'Flutter V2 Embedding', 'Sistema de Licenças']
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

    const licenseKeys = generateLicenseKeys(10);

    res.json({
      success: true,
      message: 'App criado! GitHub Actions vai compilar o APK em 10-15 minutos.',
      repoUrl: repoData.html_url,
      actionsUrl: repoData.html_url + '/actions',
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
  const segment = function() {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };
  return segment() + '-' + segment() + '-' + segment() + '-' + segment();
}

function generateLicenseKeys(count) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    keys.push({ id: i + 1, key: generateLicenseKey() });
  }
  return keys;
}

// ============================================
// GERAÇÃO DE CÓDIGO COM IA
// ============================================
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

  const prompt = getPrompt(appIdea, trialDays);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error('Claude API error: ' + response.status);
  }

  const data = await response.json();
  let code = data.content[0].text;
  
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

  const prompt = getPrompt(appIdea, trialDays);

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) {
    throw new Error('Gemini API error: ' + response.status);
  }

  const data = await response.json();
  let code = data.candidates[0].content.parts[0].text;
  
  code = code.replace(/```dart\n?/g, '');
  code = code.replace(/```\n?/g, '');
  code = code.trim();
  
  return code;
}

// ============================================
// PROMPT OTIMIZADO
// ============================================
function getPrompt(appIdea, trialDays) {
  var prompt = 'Gere um arquivo main.dart COMPLETO e COMPILAVEL para Flutter.\n\n';
  prompt += 'APP SOLICITADO: ' + appIdea + '\n\n';
  prompt += 'ESTRUTURA OBRIGATORIA - Siga EXATAMENTE:\n\n';
  
  prompt += '1. IMPORTS (apenas estes dois):\n';
  prompt += 'import \'package:flutter/material.dart\';\n';
  prompt += 'import \'package:shared_preferences/shared_preferences.dart\';\n\n';
  
  prompt += '2. SISTEMA DE LICENCAS (copie exatamente apos os imports):\n\n';
  prompt += 'enum LicenseStatus { trial, licensed, expired }\n\n';
  prompt += 'class LicenseManager {\n';
  prompt += '  static const String _firstRunKey = \'app_first_run\';\n';
  prompt += '  static const String _licenseKey = \'app_license\';\n';
  prompt += '  static const int trialDays = ' + trialDays + ';\n\n';
  prompt += '  static Future<LicenseStatus> checkLicense() async {\n';
  prompt += '    final prefs = await SharedPreferences.getInstance();\n';
  prompt += '    if (prefs.getString(_licenseKey) != null) return LicenseStatus.licensed;\n';
  prompt += '    final firstRun = prefs.getString(_firstRunKey);\n';
  prompt += '    if (firstRun == null) {\n';
  prompt += '      await prefs.setString(_firstRunKey, DateTime.now().toIso8601String());\n';
  prompt += '      return LicenseStatus.trial;\n';
  prompt += '    }\n';
  prompt += '    final startDate = DateTime.parse(firstRun);\n';
  prompt += '    final daysUsed = DateTime.now().difference(startDate).inDays;\n';
  prompt += '    return daysUsed < trialDays ? LicenseStatus.trial : LicenseStatus.expired;\n';
  prompt += '  }\n\n';
  prompt += '  static Future<int> getRemainingDays() async {\n';
  prompt += '    final prefs = await SharedPreferences.getInstance();\n';
  prompt += '    final firstRun = prefs.getString(_firstRunKey);\n';
  prompt += '    if (firstRun == null) return trialDays;\n';
  prompt += '    final startDate = DateTime.parse(firstRun);\n';
  prompt += '    final daysUsed = DateTime.now().difference(startDate).inDays;\n';
  prompt += '    return (trialDays - daysUsed).clamp(0, trialDays);\n';
  prompt += '  }\n\n';
  prompt += '  static Future<bool> activate(String key) async {\n';
  prompt += '    final cleaned = key.trim().toUpperCase();\n';
  prompt += '    if (cleaned.length == 19 && cleaned.contains(\'-\')) {\n';
  prompt += '      final prefs = await SharedPreferences.getInstance();\n';
  prompt += '      await prefs.setString(_licenseKey, cleaned);\n';
  prompt += '      return true;\n';
  prompt += '    }\n';
  prompt += '    return false;\n';
  prompt += '  }\n';
  prompt += '}\n\n';
  
  prompt += '3. WIDGETS DO SISTEMA (copie exatamente):\n\n';
  prompt += 'class TrialBanner extends StatelessWidget {\n';
  prompt += '  final int daysRemaining;\n';
  prompt += '  const TrialBanner({super.key, required this.daysRemaining});\n\n';
  prompt += '  @override\n';
  prompt += '  Widget build(BuildContext context) {\n';
  prompt += '    return Container(\n';
  prompt += '      width: double.infinity,\n';
  prompt += '      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),\n';
  prompt += '      color: daysRemaining <= 2 ? Colors.red : Colors.orange,\n';
  prompt += '      child: Text(\n';
  prompt += '        \'Periodo de teste: \' + daysRemaining.toString() + \' dias restantes\',\n';
  prompt += '        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),\n';
  prompt += '        textAlign: TextAlign.center,\n';
  prompt += '      ),\n';
  prompt += '    );\n';
  prompt += '  }\n';
  prompt += '}\n\n';
  
  prompt += 'class LicenseExpiredScreen extends StatefulWidget {\n';
  prompt += '  const LicenseExpiredScreen({super.key});\n';
  prompt += '  @override\n';
  prompt += '  State<LicenseExpiredScreen> createState() => _LicenseExpiredScreenState();\n';
  prompt += '}\n\n';
  
  prompt += 'class _LicenseExpiredScreenState extends State<LicenseExpiredScreen> {\n';
  prompt += '  final _ctrl = TextEditingController();\n';
  prompt += '  bool _loading = false;\n';
  prompt += '  String? _error;\n\n';
  prompt += '  Future<void> _activate() async {\n';
  prompt += '    setState(() { _loading = true; _error = null; });\n';
  prompt += '    await Future.delayed(const Duration(milliseconds: 500));\n';
  prompt += '    final ok = await LicenseManager.activate(_ctrl.text);\n';
  prompt += '    if (ok && mounted) {\n';
  prompt += '      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const RestartApp()));\n';
  prompt += '    } else if (mounted) {\n';
  prompt += '      setState(() { _error = \'Chave invalida\'; _loading = false; });\n';
  prompt += '    }\n';
  prompt += '  }\n\n';
  prompt += '  @override\n';
  prompt += '  Widget build(BuildContext context) {\n';
  prompt += '    return Scaffold(\n';
  prompt += '      body: Container(\n';
  prompt += '        decoration: BoxDecoration(gradient: LinearGradient(colors: [Colors.red.shade800, Colors.red.shade600], begin: Alignment.topCenter, end: Alignment.bottomCenter)),\n';
  prompt += '        child: SafeArea(\n';
  prompt += '          child: Padding(\n';
  prompt += '            padding: const EdgeInsets.all(24),\n';
  prompt += '            child: Column(\n';
  prompt += '              mainAxisAlignment: MainAxisAlignment.center,\n';
  prompt += '              children: [\n';
  prompt += '                const Icon(Icons.lock, size: 80, color: Colors.white),\n';
  prompt += '                const SizedBox(height: 24),\n';
  prompt += '                const Text(\'Periodo de Teste Encerrado\', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),\n';
  prompt += '                const SizedBox(height: 32),\n';
  prompt += '                TextField(controller: _ctrl, decoration: InputDecoration(labelText: \'Chave de Licenca\', hintText: \'XXXX-XXXX-XXXX-XXXX\', filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)), errorText: _error), textCapitalization: TextCapitalization.characters, maxLength: 19),\n';
  prompt += '                const SizedBox(height: 16),\n';
  prompt += '                SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _activate, style: ElevatedButton.styleFrom(padding: const EdgeInsets.all(16), backgroundColor: Colors.green), child: _loading ? const CircularProgressIndicator(color: Colors.white) : const Text(\'Ativar\', style: TextStyle(fontSize: 18, color: Colors.white)))),\n';
  prompt += '              ],\n';
  prompt += '            ),\n';
  prompt += '          ),\n';
  prompt += '        ),\n';
  prompt += '      ),\n';
  prompt += '    );\n';
  prompt += '  }\n';
  prompt += '}\n\n';
  
  prompt += 'class RestartApp extends StatelessWidget {\n';
  prompt += '  const RestartApp({super.key});\n';
  prompt += '  @override\n';
  prompt += '  Widget build(BuildContext context) {\n';
  prompt += '    return FutureBuilder<List<dynamic>>(\n';
  prompt += '      future: Future.wait([LicenseManager.checkLicense(), LicenseManager.getRemainingDays()]),\n';
  prompt += '      builder: (context, snap) {\n';
  prompt += '        if (!snap.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));\n';
  prompt += '        return MyApp(licenseStatus: snap.data![0] as LicenseStatus, remainingDays: snap.data![1] as int);\n';
  prompt += '      },\n';
  prompt += '    );\n';
  prompt += '  }\n';
  prompt += '}\n\n';
  
  prompt += '4. MAIN (copie exatamente):\n\n';
  prompt += 'void main() async {\n';
  prompt += '  WidgetsFlutterBinding.ensureInitialized();\n';
  prompt += '  final status = await LicenseManager.checkLicense();\n';
  prompt += '  final days = await LicenseManager.getRemainingDays();\n';
  prompt += '  runApp(MyApp(licenseStatus: status, remainingDays: days));\n';
  prompt += '}\n\n';
  
  prompt += '5. MYAPP (copie exatamente):\n\n';
  prompt += 'class MyApp extends StatelessWidget {\n';
  prompt += '  final LicenseStatus licenseStatus;\n';
  prompt += '  final int remainingDays;\n';
  prompt += '  const MyApp({super.key, required this.licenseStatus, required this.remainingDays});\n\n';
  prompt += '  @override\n';
  prompt += '  Widget build(BuildContext context) {\n';
  prompt += '    return MaterialApp(\n';
  prompt += '      title: \'App\',\n';
  prompt += '      debugShowCheckedModeBanner: false,\n';
  prompt += '      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue), useMaterial3: true),\n';
  prompt += '      home: licenseStatus == LicenseStatus.expired ? const LicenseExpiredScreen() : HomeScreen(licenseStatus: licenseStatus, remainingDays: remainingDays),\n';
  prompt += '    );\n';
  prompt += '  }\n';
  prompt += '}\n\n';
  
  prompt += '6. HOMESCREEN - Crie a tela principal do app com as funcionalidades solicitadas.\n';
  prompt += 'A HomeScreen DEVE receber licenseStatus e remainingDays como parametros.\n';
  prompt += 'DEVE mostrar TrialBanner no topo se licenseStatus == LicenseStatus.trial.\n\n';
  
  prompt += 'REGRAS IMPORTANTES:\n';
  prompt += '- Codigo DEVE compilar sem erros\n';
  prompt += '- Feche TODAS as chaves e parenteses\n';
  prompt += '- Maximo 350 linhas\n';
  prompt += '- Use dados mockados em listas\n';
  prompt += '- NAO use ... para abreviar\n';
  prompt += '- Implemente funcionalidades simples mas funcionais\n\n';
  
  prompt += 'Responda APENAS com codigo Dart puro.\n';
  prompt += 'SEM crases, SEM markdown, SEM explicacoes.\n';
  prompt += 'Comece com: import \'package:flutter/material.dart\';';
  
  return prompt;
}

// ============================================
// CRIAÇÃO DO REPOSITÓRIO GITHUB
// ============================================
async function createGitHubRepo(appIdea) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  
  const repoName = 'app-' + Date.now();
  const shortDesc = 'App: ' + appIdea.substring(0, 50) + '...';
  
  const { data } = await octokit.rest.repos.createForAuthenticatedUser({
    name: repoName,
    description: shortDesc,
    auto_init: false,
    private: false
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return data;
}

// ============================================
// CRIAÇÃO DA ESTRUTURA FLUTTER COMPLETA
// ============================================
async function createCompleteFlutterStructure(repoData, mainDartCode, appIdea) {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const owner = repoData.owner.login;
  const repo = repoData.name;

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
    { path: 'android/gradle/wrapper/gradle-wrapper.properties', content: getGradleWrapperProperties() },
    { path: 'android/app/src/main/res/values/styles.xml', content: getStylesXml() },
    { path: 'android/app/src/main/res/drawable/launch_background.xml', content: getLaunchBackground() },
    { path: 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png', content: getIconBase64() },
    { path: 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png', content: getIconBase64() },
    { path: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', content: getIconBase64() },
    { path: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', content: getIconBase64() },
    { path: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', content: getIconBase64() },
    { path: 'android/app/src/main/kotlin/com/example/app/MainActivity.kt', content: getMainActivity() },
    { path: 'android/app/src/main/AndroidManifest.xml', content: getAndroidManifest(appIdea) },
    { path: '.github/workflows/build.yml', content: getWorkflowContent() }
  ];

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    try {
      console.log('📄 Criando: ' + file.path);
      
      // Se for imagem PNG, o content já é base64
      var contentBase64;
      if (file.path.endsWith('.png')) {
        contentBase64 = file.content; // já é base64
      } else {
        contentBase64 = Buffer.from(file.content).toString('base64');
      }
      
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: owner,
        repo: repo,
        path: file.path,
        message: 'Add ' + file.path,
        content: contentBase64
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('❌ Erro ao criar ' + file.path + ':', error.message);
    }
  }
}

// ============================================
// ARQUIVOS DE CONFIGURAÇÃO FLUTTER
// ============================================
function getPubspecContent(appName) {
  var cleanName = appName.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (!cleanName || cleanName[0].match(/[0-9]/)) {
    cleanName = 'app_' + cleanName;
  }
  var content = 'name: ' + cleanName + '\n';
  content += 'description: ' + appName.substring(0, 50) + '\n';
  content += 'version: 1.0.0+1\n\n';
  content += 'environment:\n';
  content += '  sdk: \'>=3.0.0 <4.0.0\'\n\n';
  content += 'dependencies:\n';
  content += '  flutter:\n';
  content += '    sdk: flutter\n';
  content += '  shared_preferences: ^2.2.2\n\n';
  content += 'dev_dependencies:\n';
  content += '  flutter_test:\n';
  content += '    sdk: flutter\n';
  content += '  flutter_lints: ^3.0.0\n\n';
  content += 'flutter:\n';
  content += '  uses-material-design: true\n';
  return content;
}

function getAnalysisOptions() {
  var content = 'include: package:flutter_lints/flutter.yaml\n\n';
  content += 'linter:\n';
  content += '  rules:\n';
  content += '    prefer_const_constructors: false\n';
  content += '    prefer_const_literals_to_create_immutables: false\n';
  content += '    use_key_in_widget_constructors: false\n';
  content += '    avoid_print: false\n';
  return content;
}

function getGitignore() {
  var content = '.DS_Store\n';
  content += '.dart_tool/\n';
  content += '.flutter-plugins\n';
  content += '.flutter-plugins-dependencies\n';
  content += '.packages\n';
  content += '.pub-cache/\n';
  content += '.pub/\n';
  content += 'build/\n';
  content += '.gradle/\n';
  content += '*.iml\n';
  content += '*.ipr\n';
  content += '*.iws\n';
  content += '.idea/\n';
  content += 'local.properties\n';
  return content;
}

function getReadme(appIdea) {
  var content = '# ' + appIdea.substring(0, 50) + '\n\n';
  content += 'App gerado automaticamente pela Fabrica de Apps PRO.\n\n';
  content += '## Funcionalidades\n\n';
  content += '- Sistema de trial integrado\n';
  content += '- Licenciamento por chave\n';
  content += '- Design Material 3\n\n';
  content += '## Como usar\n\n';
  content += '1. Clone este repositorio\n';
  content += '2. Execute `flutter pub get`\n';
  content += '3. Execute `flutter run`\n\n';
  content += '## Build APK\n\n';
  content += '```bash\n';
  content += 'flutter build apk --release\n';
  content += '```\n';
  return content;
}

function getAppBuildGradle() {
  var content = 'plugins {\n';
  content += '    id "com.android.application"\n';
  content += '    id "kotlin-android"\n';
  content += '    id "dev.flutter.flutter-gradle-plugin"\n';
  content += '}\n\n';
  content += 'android {\n';
  content += '    namespace "com.example.app"\n';
  content += '    compileSdk 34\n\n';
  content += '    compileOptions {\n';
  content += '        sourceCompatibility JavaVersion.VERSION_1_8\n';
  content += '        targetCompatibility JavaVersion.VERSION_1_8\n';
  content += '    }\n\n';
  content += '    kotlinOptions {\n';
  content += '        jvmTarget = \'1.8\'\n';
  content += '    }\n\n';
  content += '    defaultConfig {\n';
  content += '        applicationId "com.example.app"\n';
  content += '        minSdk 21\n';
  content += '        targetSdk 34\n';
  content += '        versionCode 1\n';
  content += '        versionName "1.0"\n';
  content += '    }\n\n';
  content += '    buildTypes {\n';
  content += '        release {\n';
  content += '            signingConfig signingConfigs.debug\n';
  content += '            minifyEnabled false\n';
  content += '            shrinkResources false\n';
  content += '        }\n';
  content += '    }\n';
  content += '}\n\n';
  content += 'flutter {\n';
  content += '    source "../.."\n';
  content += '}\n';
  return content;
}

function getRootBuildGradle() {
  var content = 'buildscript {\n';
  content += '    ext.kotlin_version = \'1.9.0\'\n';
  content += '    repositories {\n';
  content += '        google()\n';
  content += '        mavenCentral()\n';
  content += '    }\n\n';
  content += '    dependencies {\n';
  content += '        classpath \'com.android.tools.build:gradle:8.1.0\'\n';
  content += '        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"\n';
  content += '    }\n';
  content += '}\n\n';
  content += 'allprojects {\n';
  content += '    repositories {\n';
  content += '        google()\n';
  content += '        mavenCentral()\n';
  content += '    }\n';
  content += '}\n\n';
  content += 'rootProject.buildDir = \'../build\'\n';
  content += 'subprojects {\n';
  content += '    project.buildDir = "${rootProject.buildDir}/${project.name}"\n';
  content += '}\n';
  content += 'subprojects {\n';
  content += '    project.evaluationDependsOn(\':app\')\n';
  content += '}\n\n';
  content += 'tasks.register("clean", Delete) {\n';
  content += '    delete rootProject.buildDir\n';
  content += '}\n';
  return content;
}

function getGradleProperties() {
  var content = 'org.gradle.jvmargs=-Xmx4G -XX:+HeapDumpOnOutOfMemoryError\n';
  content += 'android.useAndroidX=true\n';
  content += 'android.enableJetifier=true\n';
  return content;
}

function getSettingsGradle() {
  var content = 'pluginManagement {\n';
  content += '    def flutterSdkPath = {\n';
  content += '        def properties = new Properties()\n';
  content += '        file("local.properties").withInputStream { properties.load(it) }\n';
  content += '        def flutterSdkPath = properties.getProperty("flutter.sdk")\n';
  content += '        assert flutterSdkPath != null, "flutter.sdk not set in local.properties"\n';
  content += '        return flutterSdkPath\n';
  content += '    }()\n\n';
  content += '    includeBuild("${flutterSdkPath}/packages/flutter_tools/gradle")\n\n';
  content += '    repositories {\n';
  content += '        google()\n';
  content += '        mavenCentral()\n';
  content += '        gradlePluginPortal()\n';
  content += '    }\n';
  content += '}\n\n';
  content += 'plugins {\n';
  content += '    id "dev.flutter.flutter-plugin-loader" version "1.0.0"\n';
  content += '    id "com.android.application" version "8.1.0" apply false\n';
  content += '    id "org.jetbrains.kotlin.android" version "1.9.0" apply false\n';
  content += '}\n\n';
  content += 'include ":app"\n';
  return content;
}

function getGradleWrapperProperties() {
  var content = 'distributionBase=GRADLE_USER_HOME\n';
  content += 'distributionPath=wrapper/dists\n';
  content += 'zipStoreBase=GRADLE_USER_HOME\n';
  content += 'zipStorePath=wrapper/dists\n';
  content += 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.3-all.zip\n';
  return content;
}

function getStylesXml() {
  var content = '<?xml version="1.0" encoding="utf-8"?>\n';
  content += '<resources>\n';
  content += '    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">\n';
  content += '        <item name="android:windowBackground">@drawable/launch_background</item>\n';
  content += '    </style>\n';
  content += '    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">\n';
  content += '        <item name="android:windowBackground">?android:colorBackground</item>\n';
  content += '    </style>\n';
  content += '</resources>\n';
  return content;
}

function getLaunchBackground() {
  var content = '<?xml version="1.0" encoding="utf-8"?>\n';
  content += '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n';
  content += '    <item android:drawable="@android:color/white" />\n';
  content += '</layer-list>\n';
  return content;
}

function getMainActivity() {
  var content = 'package com.example.app\n\n';
  content += 'import io.flutter.embedding.android.FlutterActivity\n\n';
  content += 'class MainActivity: FlutterActivity()\n';
  return content;
}

// CORRIGIDO: AndroidManifest com Flutter V2 Embedding correto
function getAndroidManifest(appName) {
  var cleanName = appName.substring(0, 30).replace(/[<>&"']/g, '');
  
  var content = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n';
  content += '    <application\n';
  content += '        android:label="' + cleanName + '"\n';
  content += '        android:name="${applicationName}"\n';
  content += '        android:icon="@mipmap/ic_launcher">\n';
  content += '        <activity\n';
  content += '            android:name=".MainActivity"\n';
  content += '            android:exported="true"\n';
  content += '            android:launchMode="singleTop"\n';
  content += '            android:theme="@style/LaunchTheme"\n';
  content += '            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"\n';
  content += '            android:hardwareAccelerated="true"\n';
  content += '            android:windowSoftInputMode="adjustResize">\n';
  content += '            <meta-data\n';
  content += '                android:name="io.flutter.embedding.android.NormalTheme"\n';
  content += '                android:resource="@style/NormalTheme"\n';
  content += '                />\n';
  content += '            <intent-filter>\n';
  content += '                <action android:name="android.intent.action.MAIN"/>\n';
  content += '                <category android:name="android.intent.category.LAUNCHER"/>\n';
  content += '            </intent-filter>\n';
  content += '        </activity>\n';
  content += '        <meta-data\n';
  content += '            android:name="flutterEmbedding"\n';
  content += '            android:value="2" />\n';
  content += '    </application>\n';
  content += '    <uses-permission android:name="android.permission.INTERNET"/>\n';
  content += '</manifest>\n';
  return content;
}

// Ícone PNG 48x48 simples em base64 (quadrado azul com círculo branco)
function getIconBase64() {
  // Este é um PNG válido de 48x48 pixels - ícone azul simples
  return 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAABN0lEQVR4nO2ZwQ6CMBCGZ8b3f0sDvoGJZ+ON6MnE+ADeuBgvgjG+iMYHwIuJ8SDBmSxhgFKgBUr5k+ZA2P/r7hQopSiKoiiKoihKDrAdAGwAbAGsAKwBLAAsAMwBzABMAUwATACMAYwADJE4PQB9AHcAByAFsAfQA9AB0AZwKxgpBAC0ALQA3APYA2kC6ABoAbgH8gCkA6AFoA3gEcgTQAtAG8AzkBeAFoAWgBaAHoA+gD6ANwBvIN4BvAF9AH0AfQB9AH0AbwDeQHwAeAPxCeATxBeAbyCuQHwDeAN6B/oGeg+gD6D3APoA+gD6APoA+gD6APoA+gD6APoA+gD6APoA+gD6AIYAhgBGAEYAxgDGACYAJgCmAKYAZgBmAOYA5gAWABYAlgCWAFYAVgDWihFO+AVz1mTg5PyyIwAAAABJRU5ErkJggg==';
}

function getWorkflowContent() {
  var content = 'name: Build APK\n\n';
  content += 'on:\n';
  content += '  push:\n';
  content += '    branches: [ main ]\n';
  content += '  workflow_dispatch:\n\n';
  content += 'jobs:\n';
  content += '  build:\n';
  content += '    runs-on: ubuntu-latest\n';
  content += '    \n';
  content += '    steps:\n';
  content += '    - uses: actions/checkout@v4\n';
  content += '    \n';
  content += '    - name: Setup Java\n';
  content += '      uses: actions/setup-java@v4\n';
  content += '      with:\n';
  content += '        distribution: \'zulu\'\n';
  content += '        java-version: \'17\'\n';
  content += '    \n';
  content += '    - name: Setup Flutter\n';
  content += '      uses: subosito/flutter-action@v2\n';
  content += '      with:\n';
  content += '        flutter-version: \'3.24.0\'\n';
  content += '        channel: \'stable\'\n';
  content += '    \n';
  content += '    - name: Get dependencies\n';
  content += '      run: flutter pub get\n';
  content += '    \n';
  content += '    - name: Build APK\n';
  content += '      run: flutter build apk --release --no-tree-shake-icons\n';
  content += '    \n';
  content += '    - name: Upload APK\n';
  content += '      uses: actions/upload-artifact@v4\n';
  content += '      with:\n';
  content += '        name: app-release\n';
  content += '        path: build/app/outputs/flutter-apk/app-release.apk\n';
  content += '        retention-days: 30\n';
  return content;
}

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, function() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  🚀 Fábrica de Apps Backend v3.0                      ║');
  console.log('║  📍 Porta: ' + PORT + '                                       ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log('║  Claude API: ' + (process.env.CLAUDE_API_KEY ? '✅ Configurada' : '❌ Não configurada') + '                      ║');
  console.log('║  Gemini API: ' + (process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ Não configurada') + '                      ║');
  console.log('║  GitHub Token: ' + (process.env.GITHUB_TOKEN ? '✅ Configurado' : '❌ Não configurado') + '                    ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
});
