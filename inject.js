function checkWPPApi(e, t = 10) {
    window.WPP && window.WPP.chat ? e() : t > 0 ? (console.log(`Tentando encontrar WPP.chat, tentativas restantes: ${t}`), setTimeout(() => checkWPPApi(e, t - 1), 500)) : console.error("API WPP.chat não encontrada após várias tentativas.")
}

function delay(e) {
    return new Promise(t => setTimeout(t, e))
}

const lastMinuteReplied = new Map;

function shouldReply(e, t) {
    let n = Math.floor(t / 40);
    return lastMinuteReplied.get(e) !== n && (lastMinuteReplied.set(e, n), !0)
}

function injectNewMessageListener() {
    WPP.on("chat.new_message", e => {
       
        if (e.id.fromMe) { console.debug('[ZaPic:MSG] Ignorando mensagem enviada por mim'); return; }
        if (!e.body) { console.debug('[ZaPic:MSG] Ignorando mensagem sem corpo (texto vazio)'); return; }

        let fromJid = e.from._serialized; // (pode ser @lid ou @c.us)
        let phoneNumber = e.from.user;    
        let isLid = !!(fromJid.endsWith('@lid') || (e.sender && e.sender.isLid));
        

        console.log(`[ZaPic:MSG] Nova mensagem recebida de: ${phoneNumber} (JID: ${fromJid})`, { texto: (e.body||'').slice(0,80) });

        
        if (!shouldReply(phoneNumber, e.t)) {
            console.log(`[ZaPic:MSG] Ignorando ${phoneNumber}: já respondi neste minuto.`);
            return;
        }

        
        console.debug('[ZaPic:MSG] Encaminhando para content (SEND_TO_CONTENT)');
        window.postMessage({
            type: "SEND_TO_CONTENT",
            phoneNumber: phoneNumber,
            messageBody: e.body,
            fromJid: fromJid,
            isLid: isLid
        }, "*")
    })
}

function injectScript(e) {
    let t = new Blob([e], {
            type: "application/javascript"
        }),
        n = URL.createObjectURL(t),
        a = document.createElement("script");
    a.src = n, document.head.appendChild(a), a.onload = function() {
        URL.revokeObjectURL(n), a.remove(), window.postMessage({
            type: "RETURN_COMMAND_STRING",
            result: "Script executado com sucesso"
        }, "*")
    }
}

// Inicialização
checkWPPApi(() => {
    console.log("WPP.chat encontrado! Aguardando 4 segundos para injetar o ouvinte..."), setTimeout(() => {
        console.log("Injetando o ouvinte para novas mensagens..."), injectNewMessageListener()
    }, 4e3)
}), window.addEventListener("message", e => {
    e.source === window && "FROM_CONTENT" === e.data.type && e.data.script && (console.log("Mensagem recebida:", e.data), checkWPPApi(() => {
        window.WPP && window.WPP.chat ? (console.log("API WPP.chat encontrada, enviando mensagem"), console.log("Injectando comando no WhatsApp:", e.data.script), injectScript(e.data.script)) : console.error("API WPP.chat não encontrada")
    }))
});


async function computeAndPostRegisterLid() {
    try {
        console.debug('[ZaPic:LID] computeAndPostRegisterLid: verificando WPP API');
        if (!window.WPP || !window.WPP.conn || typeof WPP.conn.getMyUserId !== 'function') {
            console.warn('[ZaPic:LID] WPP API indisponível para calcular LID');
            return;
        }
        const me = WPP.conn.getMyUserId();
        const myNumber = me && me.user ? me.user : null;
        console.debug('[ZaPic:LID] meu número detectado', { myNumber });
        if (!myNumber) return;
        let lidJid = null;
        try {
            const lidEntry = (typeof WPP?.contact?.getPnLidEntry === 'function') ? await WPP.contact.getPnLidEntry(myNumber) : null;
            const candidates = [];
            if (typeof lidEntry === 'string') candidates.push(lidEntry);
            if (lidEntry && typeof lidEntry._serialized === 'string') candidates.push(lidEntry._serialized);
            if (lidEntry && lidEntry.id && typeof lidEntry.id._serialized === 'string') candidates.push(lidEntry.id._serialized);
            if (lidEntry && typeof lidEntry.lid === 'string') candidates.push(lidEntry.lid);
            if (lidEntry && typeof lidEntry.lid === 'object') {
                if (typeof lidEntry.lid._serialized === 'string') candidates.push(lidEntry.lid._serialized);
                if (typeof lidEntry.lid.user === 'string') candidates.push(`${lidEntry.lid.user}@lid`);
            }
            if (lidEntry && typeof lidEntry.user === 'string') candidates.push(`${lidEntry.user}@lid`);
            console.debug('[ZaPic:LID] candidatos de LID', { quantidade: candidates.length });
            for (let c of candidates) {
                if (typeof c !== 'string') continue;
                let s = c.trim();
                if (!s) continue;
                if (!s.includes('@')) s = `${s}@lid`;
                const parts = s.split('@');
                if (parts.length === 2) {
                    const local = parts[0];
                    const domain = parts[1].toLowerCase();
                    if ((domain === 'lid' || domain === 'c.us') && /^\d+$/.test(local)) {
                        lidJid = `${local}@${domain}`;
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('[ZaPic:LID] erro ao calcular candidatos de LID', e);
        }
        console.log('[ZaPic:LID] LID resolvido', { lidJid });
        window.postMessage({ type: 'REGISTER_LID', phoneNumber: myNumber, lidJid }, '*');
        console.debug('[ZaPic:LID] REGISTER_LID enviado para o content');
    } catch (e) {
        console.warn('[ZaPic:LID] erro inesperado em computeAndPostRegisterLid', e);
    }
}

window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.type === 'REQUEST_REGISTER_LID') {
        console.log('[ZaPic:LID] REQUEST_REGISTER_LID recebido no inject');
        checkWPPApi(() => {
            computeAndPostRegisterLid();
        });
    }
});

// Suporte a re-registro de LID sob demanda (paridade com MMZAP)
async function computeAndPostRegisterLid() {
    try {
        if (!window.WPP || !window.WPP.conn || typeof WPP.conn.getMyUserId !== 'function') return;
        const me = WPP.conn.getMyUserId();
        const myNumber = me && me.user ? me.user : null;
        if (!myNumber) return;
        let lidJid = null;
        try {
            const lidEntry = (typeof WPP?.contact?.getPnLidEntry === 'function') ? await WPP.contact.getPnLidEntry(myNumber) : null;
            const candidates = [];
            if (typeof lidEntry === 'string') candidates.push(lidEntry);
            if (lidEntry && typeof lidEntry._serialized === 'string') candidates.push(lidEntry._serialized);
            if (lidEntry && lidEntry.id && typeof lidEntry.id._serialized === 'string') candidates.push(lidEntry.id._serialized);
            if (lidEntry && typeof lidEntry.lid === 'string') candidates.push(lidEntry.lid);
            if (lidEntry && typeof lidEntry.lid === 'object') {
                if (typeof lidEntry.lid._serialized === 'string') candidates.push(lidEntry.lid._serialized);
                if (typeof lidEntry.lid.user === 'string') candidates.push(`${lidEntry.lid.user}@lid`);
            }
            if (lidEntry && typeof lidEntry.user === 'string') candidates.push(`${lidEntry.user}@lid`);
            for (let c of candidates) {
                if (typeof c !== 'string') continue;
                let s = c.trim();
                if (!s) continue;
                if (!s.includes('@')) s = `${s}@lid`;
                const parts = s.split('@');
                if (parts.length === 2) {
                    const local = parts[0];
                    const domain = parts[1].toLowerCase();
                    if ((domain === 'lid' || domain === 'c.us') && /^\d+$/.test(local)) {
                        lidJid = `${local}@${domain}`;
                        break;
                    }
                }
            }
        } catch (_) {}
        window.postMessage({ type: 'REGISTER_LID', phoneNumber: myNumber, lidJid }, '*');
    } catch (_) {}
}

window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data && e.data.type === 'REQUEST_REGISTER_LID') {
        checkWPPApi(() => {
            computeAndPostRegisterLid();
        });
    }
});
