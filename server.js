/**
 * ============================================================
 *  MMZAP-PRO • Servidor Local (Express)
 * ------------------------------------------------------------
 *  - Licenciamento vitalício (LIFETIME) + Trial 24h
 *  - Maturador de chips com persistência em database.json
 *  - Painel administrativo /admin (Tailwind via CDN)
 *
 *  Start:  node server.js
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

// =================================================================
// CONFIG
// =================================================================
const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const DEFAULT_TEST_NUMBER = '5511942675488';
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_LOG_ENTRIES = 200;
const API_KEY_ESPERADA = 'DCE5D227FFC195E5CF57';
const PRODUCT_ID_ESPERADO = 'mmzap_pro';

// =================================================================
// MIDDLEWARES
// =================================================================
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, lb-ip, lb-url, lb-api-key, version, X-Custom-Header, type'
    );
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use((req, _res, next) => {
    if (req.url !== '/admin' && !req.url.startsWith('/api/admin/data')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// =================================================================
// BANCO DE DADOS — database.json (fs nativo)
// Estrutura:
// {
//   chips: [
//     { phoneNumber, lidJid, totalMessagesSent, totalMessagesReceived, lastActivity }
//   ],
//   activityLog: [
//     { timestamp, type, from, to?, phrase?, lidJid?, message }
//   ]
// }
// =================================================================
function initDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify({ chips: [], activityLog: [] }, null, 2),
            'utf-8'
        );
        console.log('[DB] database.json criado em', DB_FILE);
    }
}

function readDB() {
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data.chips)) data.chips = [];
        if (!Array.isArray(data.activityLog)) data.activityLog = [];
        return data;
    } catch (err) {
        console.warn('[DB] Falha ao ler database.json, recriando vazio:', err.message);
        const empty = { chips: [], activityLog: [] };
        writeDB(empty);
        return empty;
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function pushLog(db, entry) {
    db.activityLog.unshift({ timestamp: new Date().toISOString(), ...entry });
    if (db.activityLog.length > MAX_LOG_ENTRIES) {
        db.activityLog.length = MAX_LOG_ENTRIES;
    }
}

function findChip(db, phoneNumber) {
    return db.chips.find((c) => c.phoneNumber === phoneNumber);
}

function upsertChip(db, phoneNumber, extras = {}) {
    let chip = findChip(db, phoneNumber);
    const nowIso = new Date().toISOString();
    if (!chip) {
        chip = {
            phoneNumber,
            lidJid: extras.lidJid || null,
            totalMessagesSent: 0,
            totalMessagesReceived: 0,
            lastActivity: nowIso
        };
        db.chips.push(chip);
        return { chip, created: true };
    }
    chip.lastActivity = nowIso;
    if (extras.lidJid && !chip.lidJid) chip.lidJid = extras.lidJid;
    return { chip, created: false };
}

initDB();

// =================================================================
// GERADOR DE FRASES HUMANIZADAS
// =================================================================
const GREETINGS = [
    'Oi',
    'Olá',
    'E aí',
    'Bom dia',
    'Boa tarde',
    'Boa noite',
    'Salve',
    'Fala'
];
const QUESTIONS = [
    'tudo bem?',
    'como vai?',
    'tudo certo?',
    'beleza?',
    'firmeza?',
    'na paz?',
    'td jóia?',
    'tudo tranquilo?'
];
const FRASES_SIMPLES = [
    'Acabei de ver sua mensagem',
    'Já te respondo, calma',
    'Tô resolvendo umas coisas aqui',
    'Combinado, valeu',
    'Tá tranquilo então',
    'Pode deixar comigo',
    'Recebi sim, obrigado',
    'Anotei aqui, depois te falo',
    'Tô em reunião agora',
    'Vou almoçar e já volto',
    'Daqui a pouco te ligo',
    'Manda no zap mesmo',
    'Bora marcar',
    'Tô achando que vai dar certo',
    'Já tô indo aí',
    'Olha só o que aconteceu',
    'Cara, nem te conto',
    'Tô na correria, depois falo',
    'Que dia foi corrido hoje',
    'Valeu demais',
    'Pode deixar que vejo',
    'Show, fechou',
    'Beleza, tmj',
    'Tranquilo, sem stress'
];
const ESTADOS = ['corrido', 'tranquilo', 'puxado', 'cansativo', 'animado', 'parado'];
const LOCAIS = [
    'em casa',
    'no trampo',
    'na rua',
    'no carro',
    'no escritório',
    'almoçando'
];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function gerarFraseHumana() {
    const templates = [
        () => `${pick(GREETINGS)}, ${pick(QUESTIONS)}`,
        () => `${pick(GREETINGS)}! ${pick(FRASES_SIMPLES)}`,
        () => pick(FRASES_SIMPLES),
        () => `Hoje tá ${pick(ESTADOS)} viu`,
        () => `Tô ${pick(LOCAIS)} agora`,
        () => `Vc tá ${pick(LOCAIS)}?`,
        () => `${pick(GREETINGS)}, ${pick(FRASES_SIMPLES).toLowerCase()}`,
        () => `${pick(FRASES_SIMPLES)} 😅`,
        () => `kkk ${pick(FRASES_SIMPLES).toLowerCase()}`,
        () => `${pick(GREETINGS)}! ${pick(QUESTIONS)} ${pick(FRASES_SIMPLES).toLowerCase()}`
    ];
    return pick(templates)();
}

function escaparParaJsString(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function montarComandoEnvio(numeroDestino, frase) {
    const fraseEsc = escaparParaJsString(frase);
    return `WPP.chat.sendTextMessage('${numeroDestino}@c.us', '${fraseEsc}', { createChat: true })`;
}

function extrairNumero(jidOuNumero = '') {
    return String(jidOuNumero || '').split('@')[0].trim();
}

// =================================================================
// RATE LIMIT (em memória, por número)
// =================================================================
const lastRequestAt = new Map();

function rateLimited(phoneNumber) {
    if (!phoneNumber) return false;
    const now = Date.now();
    const prev = lastRequestAt.get(phoneNumber) || 0;
    if (now - prev < RATE_LIMIT_WINDOW_MS) return true;
    lastRequestAt.set(phoneNumber, now);
    return false;
}

// =================================================================
// ROTA: POST /maturador_extensao/request
// =================================================================
app.post('/maturador_extensao/request', (req, res) => {
    const body = req.body || {};
    const headerType = req.headers['type'];
    const type = body.type || headerType || '';
    const phoneNumber = extrairNumero(body.phoneNumber);
    const db = readDB();

    // ---------------- REGISTER_LID ----------------
    if (type === 'register_lid') {
        const lidJid = body.lidJid || null;
        const existed = !!findChip(db, phoneNumber);
        const { chip, created } = upsertChip(db, phoneNumber, { lidJid });

        if (created) {
            pushLog(db, {
                type: 'connect',
                from: phoneNumber,
                lidJid,
                message: `Chip ${phoneNumber} entrou na rede`
            });
            console.log(`[register_lid] novo chip: ${phoneNumber}`);
        } else {
            // Atualiza lidJid se chegou vazio antes
            if (lidJid && (!chip.lidJid || chip.lidJid !== lidJid)) {
                chip.lidJid = lidJid;
            }
            pushLog(db, {
                type: 'heartbeat',
                from: phoneNumber,
                message: `Chip ${phoneNumber} reportou atividade`
            });
            console.log(`[register_lid] atividade existente: ${phoneNumber}`);
        }

        writeDB(db);
        return res.status(200).json({ status: 'ok', existed });
    }

    // ---------------- SEND ----------------
    if (type === 'send') {
        if (rateLimited(phoneNumber)) {
            console.warn(`[send] RATE LIMIT bloqueando ${phoneNumber}`);
            return res.status(429).json({
                error: 'Rate limit exceeded for normal system',
                retry_after: 59
            });
        }

        // Garante que o remetente exista na base
        upsertChip(db, phoneNumber, {});

        // Sorteio do alvo
        let alvo;
        const outros = db.chips.filter((c) => c.phoneNumber !== phoneNumber);

        if (db.chips.length <= 1 || outros.length === 0) {
            // Só há 1 chip na rede → usa número padrão de teste
            alvo = DEFAULT_TEST_NUMBER;
        } else {
            // Sorteio automático entre os outros chips
            alvo = outros[Math.floor(Math.random() * outros.length)].phoneNumber;
        }

        // Atualiza contadores
        const nowIso = new Date().toISOString();
        const sender = findChip(db, phoneNumber);
        if (sender) {
            sender.totalMessagesSent = (sender.totalMessagesSent || 0) + 1;
            sender.lastActivity = nowIso;
        }
        const receiver = findChip(db, alvo);
        if (receiver) {
            receiver.totalMessagesReceived = (receiver.totalMessagesReceived || 0) + 1;
            receiver.lastActivity = nowIso;
        }

        // Gera frase e monta comando exatamente no formato esperado
        const frase = gerarFraseHumana();
        const comando = montarComandoEnvio(alvo, frase);

        pushLog(db, {
            type: 'message',
            from: phoneNumber,
            to: alvo,
            phrase: frase,
            message: `Chip ${phoneNumber} enviou mensagem para Chip ${alvo}`
        });

        writeDB(db);

        console.log(`[send] ${phoneNumber} → ${alvo} :: ${frase}`);

        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(comando);
    }

    // ---------------- CHECK (mensagem recebida na conversa) ----------------
    if (type === 'check') {
        if (phoneNumber) {
            upsertChip(db, phoneNumber, {});
            writeDB(db);
        }
        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send('');
    }

    // ---------------- TIPO DESCONHECIDO ----------------
    console.warn('[request] type desconhecido:', type);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send('');
});

// =================================================================
// ROTA: POST /maturador_extensao/get_message
// =================================================================
app.post('/maturador_extensao/get_message', (_req, res) => {
    return res.status(200).json({
        status: 'ok',
        success: true,
        message: '',
        data: {}
    });
});

// =================================================================
// LICENCIAMENTO (mantido intocado em sua forma original LIFETIME)
// =================================================================
const issuedLicenses = new Map();

function gerarHashLicenca() {
    return crypto.randomBytes(25).toString('hex');
}

function isTrialCode(code = '') {
    return String(code).toUpperCase().includes('TRIAL');
}

app.post('/activate_license', (req, res) => {
    const ip = req.headers['lb-ip'] || req.ip;
    const apiKey = req.headers['lb-api-key'];
    const { product_id, license_code } = req.body || {};

    if (!license_code) {
        return res.json({ status: false, message: 'Código de licença não informado.' });
    }
    if (apiKey && apiKey !== API_KEY_ESPERADA) {
        console.warn('[activate] api-key diferente do esperado:', apiKey);
    }
    if (product_id && product_id !== PRODUCT_ID_ESPERADO) {
        console.warn('[activate] product_id inesperado:', product_id);
    }

    const lic_response = gerarHashLicenca();
    let expiration_date = null;
    let is_trial = false;
    let message = 'Licença ativada com sucesso!';

    if (isTrialCode(license_code)) {
        is_trial = true;
        expiration_date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        message = 'Licença TRIAL ativada (24 horas).';
    }

    issuedLicenses.set(lic_response, {
        code: license_code,
        type: is_trial ? 'TRIAL' : 'LIFETIME',
        activated_at: new Date().toISOString(),
        expiration_date,
        ip
    });

    const payload = { status: true, lic_response, message };
    if (expiration_date) payload.expiration_date = expiration_date;
    if (is_trial) payload.is_trial = true;

    console.log(`[activate] OK ${license_code} (${is_trial ? 'TRIAL' : 'LIFETIME'})`);
    return res.json(payload);
});

app.post('/verify_license', (req, res) => {
    const { product_id, license_file } = req.body || {};

    if (!license_file) {
        return res.json({ status: false, message: 'Hash de licença ausente.' });
    }
    if (product_id && product_id !== PRODUCT_ID_ESPERADO) {
        console.warn('[verify] product_id inesperado:', product_id);
    }

    const registro = issuedLicenses.get(license_file);

    // Servidor reiniciou e perdeu o Map em memória? Modo permissivo (LIFETIME)
    if (!registro) {
        return res.json({ status: true, message: 'Licença ativa.' });
    }

    if (registro.expiration_date) {
        if (Date.now() > new Date(registro.expiration_date).getTime()) {
            return res.json({ status: false, message: 'Período de teste expirado.' });
        }
    }

    return res.json({ status: true, message: 'Licença válida.' });
});

// =================================================================
// API DO PAINEL ADMINISTRATIVO
// =================================================================
app.get('/api/admin/data', (_req, res) => {
    const db = readDB();
    const totalChips = db.chips.length;
    const totalEnviadas = db.chips.reduce(
        (acc, c) => acc + (c.totalMessagesSent || 0),
        0
    );
    const totalRecebidas = db.chips.reduce(
        (acc, c) => acc + (c.totalMessagesReceived || 0),
        0
    );

    // "Mensagens trocadas na rede local" = soma de envios efetivos
    const totalMensagensTrocadas = totalEnviadas;

    // Chips ordenados por atividade mais recente
    const chipsOrdenados = [...db.chips].sort((a, b) => {
        const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return tb - ta;
    });

    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        metrics: {
            totalChips,
            totalMensagensTrocadas,
            totalEnviadas,
            totalRecebidas
        },
        chips: chipsOrdenados,
        activityLog: db.activityLog
    });
});

app.post('/api/admin/clear', (_req, res) => {
    try {
        if (fs.existsSync(DB_FILE)) {
            fs.unlinkSync(DB_FILE);
        }
    } catch (err) {
        console.warn('[admin] Falha ao remover database.json:', err.message);
    }
    initDB();
    lastRequestAt.clear();
    console.log('[admin] Rede resetada: database.json removido e recriado vazio.');
    res.json({ ok: true, message: 'Rede resetada com sucesso.' });
});

// =================================================================
// PAINEL VISUAL — GET /admin
// =================================================================
app.get('/admin', (_req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderAdminHTML());
});

// =================================================================
// HEALTH / INDEX
// =================================================================
app.get('/', (_req, res) => {
    res.json({
        ok: true,
        service: 'MMZAP-PRO Local Server',
        admin: 'http://localhost:' + PORT + '/admin',
        endpoints: [
            'POST /activate_license',
            'POST /verify_license',
            'POST /maturador_extensao/request',
            'POST /maturador_extensao/get_message',
            'GET  /admin',
            'GET  /api/admin/data',
            'POST /api/admin/clear'
        ]
    });
});

// =================================================================
// HTML DO PAINEL (Tailwind via CDN, Dark Mode)
// =================================================================
function renderAdminHTML() {
    return `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>MMZAP PRO • Painel da Rede</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
      }
    }
  }
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  body {
    background:
      radial-gradient(1200px 600px at 10% -10%, rgba(16,185,129,0.10), transparent 60%),
      radial-gradient(900px 500px at 110% 10%, rgba(99,102,241,0.10), transparent 60%),
      #030712;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .glass {
    background: rgba(17, 24, 39, 0.55);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .pulse-dot {
    width: 9px; height: 9px; border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 0 0 rgba(16,185,129,0.7);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
    70%  { box-shadow: 0 0 0 14px rgba(16,185,129,0); }
    100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
  }
  .log-enter { animation: fadeSlide .35s ease-out; }
  @keyframes fadeSlide {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .scrollbar::-webkit-scrollbar-thumb {
    background: #374151; border-radius: 4px;
  }
  .scrollbar::-webkit-scrollbar-thumb:hover { background: #4b5563; }
  .gradient-text {
    background: linear-gradient(90deg, #10b981 0%, #06b6d4 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .card-shine {
    position: relative; overflow: hidden;
  }
  .card-shine::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%);
    pointer-events: none;
  }
</style>
</head>
<body class="text-gray-100 min-h-screen">

<div class="max-w-7xl mx-auto p-6 lg:p-10">

  <!-- ================= HEADER ================= -->
  <header class="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-4">
    <div class="flex items-center gap-4">
      <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center font-extrabold text-2xl shadow-lg shadow-emerald-500/30">
        M
      </div>
      <div>
        <h1 class="text-2xl lg:text-3xl font-extrabold tracking-tight">
          MMZAP <span class="gradient-text">PRO</span>
          <span class="text-gray-500 font-medium text-lg ml-2">• Rede de Chips</span>
        </h1>
        <p class="text-sm text-gray-400 flex items-center gap-2 mt-1">
          <span class="pulse-dot"></span>
          Servidor local online — atualização automática a cada 5 segundos
        </p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      <span id="lastUpdate" class="text-xs text-gray-500">aguardando dados…</span>
      <button id="btnReset"
        class="px-4 py-2 text-sm font-semibold rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 transition">
        ⟲ Resetar Rede
      </button>
    </div>
  </header>

  <!-- ================= CARDS DE MÉTRICAS ================= -->
  <section class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">

    <div class="glass card-shine rounded-2xl p-7">
      <div class="flex items-center justify-between mb-3">
        <p class="text-gray-400 text-xs uppercase tracking-[0.18em] font-semibold">Chips Conectados</p>
        <span class="text-2xl">📱</span>
      </div>
      <p id="mTotalChips" class="text-5xl font-extrabold gradient-text">0</p>
      <p class="text-xs text-gray-500 mt-2">Números registrados na rede local</p>
    </div>

    <div class="glass card-shine rounded-2xl p-7">
      <div class="flex items-center justify-between mb-3">
        <p class="text-gray-400 text-xs uppercase tracking-[0.18em] font-semibold">Mensagens Trocadas</p>
        <span class="text-2xl">💬</span>
      </div>
      <p id="mTotalMsgs" class="text-5xl font-extrabold gradient-text">0</p>
      <p class="text-xs text-gray-500 mt-2">Total de mensagens disparadas na rede</p>
    </div>

  </section>

  <!-- ================= TABELA + LOG ================= -->
  <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">

    <!-- TABELA DE CHIPS -->
    <div class="glass rounded-2xl p-6 lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold">Chips na Rede</h2>
        <span id="chipCount" class="text-xs text-gray-500 px-2 py-1 rounded-full bg-white/5">0 registros</span>
      </div>
      <div class="overflow-x-auto scrollbar">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-gray-400 text-xs uppercase tracking-wider border-b border-white/10">
              <th class="text-left py-3 px-2 font-semibold">Telefone</th>
              <th class="text-left py-3 px-2 font-semibold">LID JID</th>
              <th class="text-right py-3 px-2 font-semibold">Enviadas</th>
              <th class="text-right py-3 px-2 font-semibold">Recebidas</th>
              <th class="text-right py-3 px-2 font-semibold">Última Atividade</th>
            </tr>
          </thead>
          <tbody id="tblChips" class="divide-y divide-white/5">
            <tr><td colspan="5" class="text-center text-gray-500 py-10">Aguardando conexão de chips…</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- LOG DE ATIVIDADE -->
    <div class="glass rounded-2xl p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold">Log de Atividade</h2>
        <span id="logCount" class="text-xs text-gray-500 px-2 py-1 rounded-full bg-white/5">0</span>
      </div>
      <ul id="logList" class="space-y-2 max-h-[520px] overflow-y-auto scrollbar pr-1">
        <li class="text-center text-gray-500 text-sm py-10">Nenhuma atividade ainda</li>
      </ul>
    </div>

  </section>

  <footer class="text-center text-xs text-gray-600 mt-12">
    MMZAP PRO • Painel local de monitoramento — dados persistidos em <code class="text-emerald-400">database.json</code>
  </footer>
</div>

<script>
(function () {
  const $ = (id) => document.getElementById(id);

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString('pt-BR'); }
    catch (_) { return '—'; }
  }
  function fmtDateTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR');
    } catch (_) { return '—'; }
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function iconForLog(t) {
    if (t === 'message')   return '➡️';
    if (t === 'connect')   return '🟢';
    if (t === 'heartbeat') return '💓';
    return '•';
  }

  async function loadData() {
    try {
      const r = await fetch('/api/admin/data', { cache: 'no-store' });
      const data = await r.json();
      renderMetrics(data.metrics || {});
      renderChips(data.chips || []);
      renderLog(data.activityLog || []);
      $('lastUpdate').textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    } catch (err) {
      console.error('Falha ao carregar dados:', err);
      $('lastUpdate').textContent = 'Falha na atualização';
    }
  }

  function renderMetrics(m) {
    $('mTotalChips').textContent = m.totalChips || 0;
    $('mTotalMsgs').textContent  = m.totalMensagensTrocadas || 0;
  }

  function renderChips(chips) {
    const tbody = $('tblChips');
    $('chipCount').textContent = chips.length + (chips.length === 1 ? ' registro' : ' registros');
    if (!chips.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-10">Aguardando conexão de chips…</td></tr>';
      return;
    }
    tbody.innerHTML = chips.map(function (c) {
      return '<tr class="hover:bg-white/5 transition">'
        + '<td class="py-3 px-2 font-mono text-emerald-300">' + escapeHtml(c.phoneNumber || '—') + '</td>'
        + '<td class="py-3 px-2 font-mono text-xs text-gray-400 max-w-[200px] truncate" title="' + escapeHtml(c.lidJid || '') + '">' + escapeHtml(c.lidJid || '—') + '</td>'
        + '<td class="py-3 px-2 text-right text-cyan-300 font-semibold">' + (c.totalMessagesSent || 0) + '</td>'
        + '<td class="py-3 px-2 text-right text-indigo-300 font-semibold">' + (c.totalMessagesReceived || 0) + '</td>'
        + '<td class="py-3 px-2 text-right text-gray-400 text-xs">' + fmtDateTime(c.lastActivity) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderLog(log) {
    const ul = $('logList');
    $('logCount').textContent = log.length;
    if (!log.length) {
      ul.innerHTML = '<li class="text-center text-gray-500 text-sm py-10">Nenhuma atividade ainda</li>';
      return;
    }
    ul.innerHTML = log.slice(0, 100).map(function (entry) {
      const icon = iconForLog(entry.type);
      let body;
      if (entry.type === 'message') {
        body = 'Chip <span class="text-emerald-300 font-mono">' + escapeHtml(entry.from) + '</span> '
             + '<span class="text-gray-500">enviou mensagem para</span> '
             + 'Chip <span class="text-cyan-300 font-mono">' + escapeHtml(entry.to) + '</span>'
             + '<div class="text-xs text-gray-400 italic mt-1">"' + escapeHtml(entry.phrase || '') + '"</div>';
      } else if (entry.type === 'connect') {
        body = 'Chip <span class="text-emerald-300 font-mono">' + escapeHtml(entry.from) + '</span> '
             + '<span class="text-gray-500">entrou na rede</span>';
      } else if (entry.type === 'heartbeat') {
        body = 'Chip <span class="text-emerald-300 font-mono">' + escapeHtml(entry.from) + '</span> '
             + '<span class="text-gray-500">reportou atividade</span>';
      } else {
        body = escapeHtml(entry.message || '');
      }
      return '<li class="log-enter bg-white/5 hover:bg-white/[0.07] rounded-lg px-3 py-2 text-sm border border-white/5">'
        + '<div class="flex items-start gap-2">'
        + '<span class="leading-none mt-0.5">' + icon + '</span>'
        + '<div class="flex-1 leading-snug">' + body + '</div>'
        + '<span class="text-[10px] text-gray-500 whitespace-nowrap mt-0.5">' + fmtTime(entry.timestamp) + '</span>'
        + '</div></li>';
    }).join('');
  }

  $('btnReset').addEventListener('click', async function () {
    if (!confirm('Tem certeza que deseja resetar TODA a rede? Essa ação apaga o arquivo database.json.')) return;
    try {
      const r = await fetch('/api/admin/clear', { method: 'POST' });
      const j = await r.json();
      console.log('Reset:', j);
      await loadData();
    } catch (e) {
      alert('Falha ao resetar: ' + e.message);
    }
  });

  loadData();
  setInterval(loadData, 5000);
})();
</script>

</body>
</html>`;
}

// =================================================================
// START
// =================================================================
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('  MMZAP-PRO Local Server');
    console.log('  Base URL:     http://localhost:' + PORT);
    console.log('  Admin Panel:  http://localhost:' + PORT + '/admin');
    console.log('  Database:     ' + DB_FILE);
    console.log('  Endpoints:');
    console.log('    POST /activate_license');
    console.log('    POST /verify_license');
    console.log('    POST /maturador_extensao/request');
    console.log('    POST /maturador_extensao/get_message');
    console.log('    GET  /admin');
    console.log('    GET  /api/admin/data');
    console.log('    POST /api/admin/clear');
    console.log('==================================================');
});
