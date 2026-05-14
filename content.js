const manifest = chrome.runtime.getManifest();

// --- FUNÇÃO DE SEGURANÇA: HORA DA REDE (ANTI-BURLA DE RELÓGIO) ---
async function getNetworkTime() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); 
        
        
        const req = await fetch('http://worldtimeapi.org/api/timezone/Etc/UTC', { signal: controller.signal });
        const json = await req.json();
        clearTimeout(timeoutId);
        return new Date(json.datetime).getTime();
    } catch (e) {
       
        console.warn("[MMZAP] Falha ao obter hora da rede, usando sistema.");
        return Date.now();
    }
}

async function checkLicenseStatus() {
    const data = await chrome.storage.local.get('mmzap_license_data');
    const license = data.mmzap_license_data;

    if (!license || !license.hash) return 'NO_LICENSE';

    if (license.expiration) {
        const now = await getNetworkTime();
        if (now > license.expiration) {
            return 'EXPIRED';
        }
    }
    return 'VALID';
}

function renderExpirationScreen() {
    
    const old = document.getElementById('mmzap-expired-overlay');
    if(old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'mmzap-expired-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.96); z-index: 9999999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        color: white; font-family: Segoe UI, sans-serif; text-align: center;
    `;
    
    overlay.innerHTML = `
        <div style="font-size: 50px; margin-bottom: 20px;">⏳</div>
        <h1 style="color: #ff5f5f; margin-bottom: 10px; font-size: 28px;">Período de Teste Encerrado</h1>
        <p style="font-size: 16px; color: #ccc; max-width: 400px; line-height: 1.5; margin-bottom: 30px;">
            Obrigado por testar o <b>MMZAP</b>. Seu tempo de demonstração acabou.<br>
            Adquira a versão completa para continuar aquecendo seus chips.
        </p>
        
        <a href="https://growsoft.io/produtos/" target="_blank" style="
            padding: 15px 40px; background: #00a884; border: none; text-decoration: none;
            border-radius: 50px; color: white; font-weight: bold; font-size: 16px; margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0,168,132, 0.4);">
            COMPRAR LICENÇA AGORA
        </a>

        <button id="btnRemoveLicense" style="
            background: transparent; border: 1px solid #555; color: #777; 
            padding: 8px 20px; border-radius: 5px; cursor: pointer; font-size: 12px; margin-top: 20px;">
            Inserir nova chave
        </button>
    `;
    
    document.body.appendChild(overlay);
    
    document.getElementById('btnRemoveLicense').onclick = async () => {
        await chrome.storage.local.remove('mmzap_license_data');
        location.reload();
    };
}


let extensionState = {
    active: true,
    initialSendDone: false,
    webhookTimer: null,
    userPhoneNumber: null,
    pendingRequests: new Set(),
    isMinimized: false,
    stats: {
        sent: 0,
        received: 0,
        archived: 0
    },
    config: {
        minDelay: 60,
        maxDelay: 180,
        darkMode: false,
        isPaused: false,
        autoPause: false,
        nightStart: 23,
        nightEnd: 7
    }
};

let domElements = {
    toggleContainer: null,
    toggleSwitch: null,
    toggleSlider: null,
    statusText: null,
    settingsButton: null,
    floatingIcon: null
};


let MMZAP_REPLIES = [];


function loadSavedSettings() {
    const savedConfig = localStorage.getItem("mmzapConfig");
    if (savedConfig) {
        try {
            const parsed = JSON.parse(savedConfig);
            extensionState.config = {
                ...extensionState.config,
                ...parsed
            };
            
            
            if (typeof extensionState.config.nightStart === 'undefined') extensionState.config.nightStart = 23;
            if (typeof extensionState.config.nightEnd === 'undefined') extensionState.config.nightEnd = 7;

            
            if (extensionState.config.minDelay < 60) {
                console.log("[MMZAP] Atualizando delay mínimo inseguro para 60s.");
                extensionState.config.minDelay = 60;
                if (extensionState.config.maxDelay < 60) {
                    extensionState.config.maxDelay = 60;
                }
                localStorage.setItem("mmzapConfig", JSON.stringify(extensionState.config));
            }
            

        } catch (e) {
            console.error("Erro ao carregar configs:", e);
        }
    }
}
loadSavedSettings();


function isNightTime() {
    const hour = new Date().getHours();
    const start = extensionState.config.nightStart;
    const end = extensionState.config.nightEnd;

   
    if (start > end) {
        return hour >= start || hour < end;
    } 
    
    else {
        return hour >= start && hour < end;
    }
}

function getTimeUntilMorning() {
    const now = new Date();
    const target = new Date(now);
    
   
    target.setHours(extensionState.config.nightEnd, 0, 0, 0); 

    
    if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
    }
    
    return target.getTime() - now.getTime();
}



class LicenseUI {
    constructor() {
        this.overlayId = "powerzap-license-overlay";
    }
    createLicenseOverlay() {
        this.removeLicenseOverlay();
        let e = document.createElement("div");
        e.id = this.overlayId;
        e.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: Arial, sans-serif;`;
        let t = document.createElement("div");
        t.style.cssText = `background: white; border-radius: 12px; padding: 30px; width: 400px; max-width: 90%; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); text-align: center;`;
        let n = document.createElement("div");
        n.style.cssText = `background: linear-gradient(to right, #000000, #00a884); color: white; padding: 15px; margin: -30px -30px 20px -30px; border-radius: 12px 12px 0 0; font-size: 18px; font-weight: bold;`;
        n.innerHTML = "MMZAP PRO - Ativa\xe7\xe3o de Licen\xe7a";
        let i = document.createElement("div");

        i.innerHTML = `
            <p style="margin-bottom: 20px; color: #333;">Voc\xea precisa de uma licen\xe7a v\xe1lida.</p>
            <input type="text" id="license-input" placeholder="xxxx-xxxx-xxxx-xxxx" style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; font-size: 16px; text-align: center; margin-bottom: 15px; box-sizing: border-box;">
            <div id="license-message" style="margin-bottom: 15px; min-height: 20px;"></div>
            <button id="activate-btn" style="background: linear-gradient(to right, #000000, #00a884); color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; width: 100%; margin-bottom: 10px;">Ativar Licen\xe7a</button>
            <a id="buy-btn" href="https://growsoft.io/mmzap-pro/" target="_blank" 
               style="display: block; width: 100%; padding: 10px 0; 
                      border: 2px solid #000000; border-radius: 6px; 
                      color: #000000; background: transparent; 
                      font-size: 16px; font-weight: bold; text-decoration: none; 
                      cursor: pointer; box-sizing: border-box; transition: all 0.3s ease;">
               Comprar Licen\xe7a
            </a>
        `;
        t.appendChild(n);
        t.appendChild(i);
        e.appendChild(t);
        document.body.appendChild(e);
        this.setupLicenseEvents();
    }
    setupLicenseEvents() {
        let e = document.getElementById("license-input"),
            t = document.getElementById("activate-btn"),
            b = document.getElementById("buy-btn");

        document.getElementById("license-message");
        e.addEventListener("input", (e) => {
            let t = e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
                n = t.match(/.{1,4}/g)?.join("-") || t;
            n.length > 19 && (n = n.substring(0, 19)), (e.target.value = n);
        });
        t.addEventListener("click", async () => {
            let n = e.value.replace(/-/g, "");
            if (16 !== n.length) {
                this.showMessage("Por favor, insira uma chave de licen\xe7a v\xe1lida (16 caracteres)", "error");
                return;
            }
            t.disabled = !0;
            t.textContent = "Ativando...";
            this.showMessage("Verificando licen\xe7a...", "info");
            
            chrome.runtime.sendMessage({
                action: "activateLicense",
                licenseCode: e.value
            }, (e) => {
                e.success ? (this.showMessage("licença ativa ","success"), setTimeout(() => {
                    this.removeLicenseOverlay();
                    window.dispatchEvent(new CustomEvent("licenseActivated"));
                    location.reload(); 
                }, 2e3)) : (this.showMessage(e.message, "error"), (t.disabled = !1), (t.textContent = "Ativar Licen\xe7a"));
            });
        });
        e.addEventListener("keypress", (e) => {
            "Enter" === e.key && t.click();
        });
        if (b) {
            b.addEventListener("mouseenter", () => {
                b.style.backgroundColor = "#000000";
                b.style.color = "white";
            });
            b.addEventListener("mouseleave", () => {
                b.style.backgroundColor = "transparent";
                b.style.color = "#000000";
            });
        }
    }
    showMessage(e, t = "info") {
        let n = document.getElementById("license-message");
        if (!n) return;
        let i = {
            success: "#4CAF50",
            error: "#f44336",
            info: "#2196F3"
        };
        n.style.cssText = `padding: 10px; border-radius: 4px; background-color: ${i[t]}20; border: 1px solid ${i[t]}; color: ${i[t]}; font-size: 14px;`;
        n.textContent = e;
    }
    removeLicenseOverlay() {
        let e = document.getElementById(this.overlayId);
        e && e.remove();
    }
    showVerificationOverlay() {
        let e = document.createElement("div");
        e.id = "powerzap-verification-overlay";
        e.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); z-index: 999999; display: flex; justify-content: center; align-items: center; font-family: Arial, sans-serif;`;
        let t = document.createElement("div");
        t.style.cssText = `background: white; border-radius: 12px; padding: 30px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);`;
        let n = document.createElement("style");
        n.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
        document.head.appendChild(n);
        t.innerHTML = `<div style="background: linear-gradient(to right, #000000, #00a884); color: white; padding: 15px; margin: -30px -30px 20px -30px; border-radius: 12px 12px 0 0; font-size: 18px; font-weight: bold;">PRO</div><div style="margin: 20px 0;"><div style="font-size: 16px; margin-bottom: 10px;">Verificando licen\xe7a...</div><div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #00a884; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div></div>`;
        e.appendChild(t);
        document.body.appendChild(e);
        return e;
    }
}
const licenseUI = new LicenseUI();


function injectScriptFile(e, t) {
    let n = document.getElementsByTagName(t)[0],
        i = document.createElement("script");
    return i.setAttribute("type", "text/javascript"), i.setAttribute("src", chrome.runtime.getURL(e)), n.appendChild(i), new Promise((e) => (i.onload = e));
}

function delay(e) {
    return new Promise((t) => setTimeout(t, e));
}

// --- FUNÇÃO DE INJEÇÃO PRINCIPAL ---
async function initializeZaPic() {
    try {
        console.log("[MMZAP] Iniciando verificações de segurança...");
        
        
        const status = await checkLicenseStatus();

        if (status === 'EXPIRED') {
            console.error("[MMZAP] LICENÇA EXPIRADA. Bloqueando acesso.");
            renderExpirationScreen();
            return; 
        }

        if (status === 'NO_LICENSE') {
            console.log("[MMZAP] Nenhuma licença encontrada. Exibindo login.");
            licenseUI.createLicenseOverlay();
            
            
            window.addEventListener("licenseActivated", () => {
                location.reload(); 
            }, { once: true });
            return;
        }

        
        console.log("[MMZAP] Licença Válida! Inicializando...");

        
        if (extensionState.userPhoneNumber) {
             fetchGlobalMessages(); 
        }

        await checkForConversasAndInjectScripts();
        startObserving();
        injectToggleButton();
    } catch (t) {
        console.error("Erro na inicializa\xe7\xe3o do MMZAP:", t), setTimeout(initializeZaPic, 5e3);
    }
}

function injectCSS() {
    // Removemos a verificação inicial para garantir que, se rodar de novo, ele atualize o estilo
    const oldStyle = document.getElementById("mmzap-custom-styles");
    if (oldStyle) oldStyle.remove();

    let e = document.createElement("style");
    e.id = "mmzap-custom-styles";
    e.textContent = `
    @media screen and (min-width: 1441px) {
        ._ap4q::after { position: fixed; top: 0; left: 0; z-index: var(--layer-0); width: 100%; height: 127px; content: ""; background: linear-gradient(to right, #000000, #00a884); }
    }
    .xq3y45c { background: linear-gradient(to bottom, #13a17a, #303030); }
    
    .mmzap-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); }
    
    /* --- MODAL BASE --- */
    .mmzap-modal { background: #ffffff; color: #111b21 !important; border-radius: 12px; width: 350px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-family: Segoe UI, Helvetica, Arial, sans-serif; transition: all 0.3s ease; }
    .mmzap-modal.dark-theme { background: #222e35; color: #e9edef !important; border: 1px solid #37404a; }
    
    .mmzap-modal-header { font-size: 18px; font-weight: bold; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; color: inherit; }
    .mmzap-form-group { margin-bottom: 15px; }
    .mmzap-label { display: block; margin-bottom: 5px; font-size: 14px; font-weight: 500; color: inherit; }

    /* --- CORREÇÃO AGRESSIVA DOS INPUTS (USANDO !IMPORTANT) --- */
    
    /* Estilo Padrão (Modo Claro) - Texto PRETO e Fundo CINZA CLARO */
    .mmzap-input, 
    .mmzap-blacklist-input { 
        width: 100%; 
        padding: 8px 12px !important; 
        border-radius: 6px !important; 
        box-sizing: border-box; 
        font-size: 14px; 
        border: 1px solid #ccc !important;
        background-color: #f0f2f5 !important; /* Fundo cinza claro */
        color: #111b21 !important; /* Texto quase preto */
        transition: border 0.3s ease;
    }
    
    /* Placeholder (o texto de instrução) escuro */
    .mmzap-input::placeholder,
    .mmzap-blacklist-input::placeholder { 
        color: #54656f !important; /* Cinza escuro */
        opacity: 1 !important;
    }

    /* Estilo Modo Escuro - Texto BRANCO e Fundo ESCURO */
    .mmzap-modal.dark-theme .mmzap-input,
    .mmzap-modal.dark-theme .mmzap-blacklist-input { 
        background: #2a3942 !important; 
        border-color: #2a3942 !important; 
        color: #e9edef !important; /* Texto branco */
    }
    
    .mmzap-modal.dark-theme .mmzap-input::placeholder,
    .mmzap-modal.dark-theme .mmzap-blacklist-input::placeholder { 
        color: #8696a0 !important; /* Cinza claro */
    }

    /* Foco nos inputs */
    .mmzap-input:focus,
    .mmzap-blacklist-input:focus {
        outline: none;
        border-color: #00a884 !important;
        box-shadow: 0 0 5px rgba(0, 168, 132, 0.3);
    }

    
    /* --- RESTANTE DOS ESTILOS --- */
    .mmzap-btn-save { background: linear-gradient(to right, #000000, #00a884); color: white; border: none; padding: 10px; width: 100%; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 5px; transition: opacity 0.2s; }
    .mmzap-btn-save:hover { opacity: 0.9; }

    .mmzap-btn-pause {
        background: transparent; border: 2px solid #000000; color: #000000; padding: 10px; width: 100%; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 15px; transition: all 0.3s ease;
    }
    .mmzap-btn-pause:hover, .mmzap-btn-pause.is-paused {
        background: linear-gradient(to right, #000000, #00a884); color: white; border-color: transparent; border: 2px solid transparent; 
    }

    .mmzap-toggle-theme { cursor: pointer; font-size: 20px; user-select: none; }
    .mmzap-btn-edit { background: transparent; border: none; color: #00a884; cursor: pointer; font-size: 14px; margin-left: auto; padding: 4px 8px; border-radius: 4px; }
    .mmzap-btn-edit:hover { background: rgba(0,168,132, 0.1); }

    .mmzap-btn-close-modal {
        background: transparent;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 20px;
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s ease;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .mmzap-btn-close-modal:hover {
        background: rgba(255, 0, 0, 0.1);
        color: #ff0000;
        transform: scale(1.1);
    }

    .mmzap-custom-checkbox { position: relative; display: inline-block; width: 24px; height: 24px; flex-shrink: 0; }
    .mmzap-custom-checkbox input { opacity: 0; width: 0; height: 0; }
    .mmzap-checkmark { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; border-radius: 6px; transition: 0.3s; }
    .mmzap-custom-checkbox input:checked + .mmzap-checkmark { background: linear-gradient(to right, #000000, #00a884); } 
    .mmzap-checkmark:after { content: ""; position: absolute; display: none; }
    .mmzap-custom-checkbox input:checked + .mmzap-checkmark:after { display: block; }
    .mmzap-custom-checkbox .mmzap-checkmark:after { left: 9px; top: 5px; width: 6px; height: 12px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
    .mmzap-modal.dark-theme .mmzap-checkmark { background-color: #3b4a54; }

    .mmzap-status-text { font-size: 11px; font-weight: bold; margin-left: 10px; text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.3s ease; }
    .mmzap-neon-waiting { color: #777; text-shadow: none; }
    .mmzap-neon-testing { color: #ffae00; text-shadow: 0 0 8px rgba(255, 174, 0, 0.6); }
    .mmzap-neon-active { color: #00ff00; text-shadow: 0 0 8px rgba(0, 255, 0, 0.6); }
    .mmzap-neon-inactive { color: #ff0044; text-shadow: 0 0 8px rgba(255, 0, 68, 0.6); }
    
    .mmzap-btn-disabled { opacity: 0.4 !important; cursor: not-allowed !important; filter: grayscale(100%); }

    .mmzap-info-grid { display: flex; flex-direction: column; gap: 15px; max-height: 400px; overflow-y: auto; padding-right: 5px; }
    .mmzap-cyber-card { 
        background: rgba(0,0,0,0.03); 
        border-left: 4px solid #ccc; 
        border-radius: 0 8px 8px 0; 
        padding: 15px; 
        position: relative; 
        transition: transform 0.2s;
    }
    .mmzap-modal.dark-theme .mmzap-cyber-card { background: rgba(255,255,255,0.05); border-left-color: #555; }
    
    .card-proxy { border-left-color: #000000; }
    .card-syntax { border-left-color: #00a884; }
    .card-finger { border-left-color: #2196F3; }

    .mmzap-card-icon { position: absolute; top: 10px; right: 10px; font-size: 24px; opacity: 0.2; }
    .mmzap-card-title { font-weight: bold; font-size: 14px; margin-bottom: 5px; display: flex; align-items: center; gap: 8px; }
    .mmzap-card-text { font-size: 12px; line-height: 1.4; color: inherit; opacity: 0.8; }
    
    .mmzap-code-box { 
        background: #1e1e1e; color: #0f0; 
        font-family: monospace; font-size: 11px; 
        padding: 8px; border-radius: 4px; margin-top: 8px; 
        border: 1px dashed #444; word-break: break-all;
    }
    
    /* --- CORREÇÃO DO BOTÃO INFO --- */
    .mmzap-info-btn { 
        cursor: pointer; 
        font-size: 20px; 
        color: #00a884; 
        transition: transform 0.2s; 
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1; 
    }
    .mmzap-info-btn:hover { transform: scale(1.1); color: #000000; text-shadow: 0 0 10px rgba(254, 74, 0, 0.5); }

    .mmzap-typing-indicator {
        position: fixed;
        top: 12%; 
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(5px);
        border: 1px solid #00ff00;
        color: #00ff00;
        padding: 8px 20px;
        border-radius: 50px;
        font-size: 13px;
        font-weight: bold;
        z-index: 9999999; 
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
        pointer-events: none; 
    }
    .mmzap-typing-indicator.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
    }
    .mmzap-typing-dots span {
        display: inline-block;
        width: 4px; height: 4px;
        background: #00ff00;
        border-radius: 50%;
        animation: typing 1.4s infinite ease-in-out both;
    }
    .mmzap-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
    .mmzap-typing-dots span:nth-child(2) { animation-delay: -0.16s; }
    
    @keyframes typing {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
    }

    /* --- ESTILIZAÇÃO UNIFICADA DOS BOTÕES FLUTUANTES --- */
    
    .mmzap-btn-floating-stack {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        z-index: 10000;
        white-space: nowrap;
        font-family: Segoe UI, sans-serif;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        min-width: 95px;
        
        /* ESTADO PADRÃO: Escuro e Discreto (Padronizado) */
        background: rgba(11, 20, 26, 0.95); /* Cor escura estilo WhatsApp */
        border: 1px solid #333;
        color: #e9edef;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    /* POSICIONAMENTO INDIVIDUAL */
    .mmzap-btn-agent-theme { top: -42px; }
    .mmzap-btn-blacklist-theme { top: -80px; z-index: 10001; }
    .mmzap-btn-archive-theme { top: -118px; }

    /* ESTADO HOVER: Acende com as cores da aplicação (Unificado) */
    .mmzap-btn-floating-stack:hover {
        background: linear-gradient(to right, #000000, #00a884); /* Degradê Laranja -> Verde */
        border-color: transparent;
        color: white;
        
        /* O Efeito de "Acender" */
        box-shadow: 0 0 20px rgba(0, 168, 132, 0.5), 0 0 10px rgba(254, 74, 0, 0.3); 
        transform: translateX(-50%) translateY(-4px) scale(1.05);
    }
    
    .mmzap-btn-floating-stack:active {
        transform: translateX(-50%) scale(0.95);
    }

    /* --- FIM DOS BOTÕES --- */

    .mmzap-text-gradient {
        background: linear-gradient(to right, #000000, #00a884);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        font-weight: bold;
    }

    .mmzap-blacklist-input-wrapper {
        position: relative;
        display: flex;
        gap: 8px;
        margin-bottom: 15px;
    }
    
    /* Botão (+) Centralizado */
    .mmzap-btn-add {
        background: linear-gradient(to right, #000000, #00a884);
        color: white;
        border: none;
        width: 40px;
        height: 38px; /* Altura fixa */
        border-radius: 6px;
        font-size: 20px;
        cursor: pointer;
        transition: transform 0.2s;
        
        display: flex;
        align-items: center;
        justify-content: center;
        padding-bottom: 3px; 
        line-height: 1;
    }
    .mmzap-btn-add:hover { transform: scale(1.05); opacity: 0.9; }

    /* --- ESTILO BLACKLIST CYBERNÉTICO (ATUALIZADO - Pílula Translúcida) --- */
    .mmzap-tags-container {
        background: rgba(0,0,0,0.02);
        border: 1px dashed #ccc;
        border-radius: 8px;
        padding: 10px;
        min-height: 120px;
        max-height: 200px;
        overflow-y: auto;
        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        gap: 10px;
        transition: all 0.3s ease;
    }
    .mmzap-modal.dark-theme .mmzap-tags-container {
        background: rgba(0,0,0,0.15);
        border-color: #444;
    }

    /* A TAG (O item da lista - ESTILO TRANSLÚCIDO) */
    .mmzap-tag-chip {
        /* Gradiente Laranja -> Verde com transparência bem baixa (Glass) */
        background: linear-gradient(to right, rgba(254, 74, 0, 0.1), rgba(0, 168, 132, 0.1));
        
        /* Borda também translúcida da cor da marca */
        border: 1px solid rgba(0, 168, 132, 0.3);
        
        color: #333;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        font-family: 'Segoe UI', sans-serif;
        display: flex;
        align-items: center;
        gap: 8px;
        
        /* A Animação de Entrada */
        animation: cyberStamp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        transform-origin: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05);
    }
    
    .mmzap-modal.dark-theme .mmzap-tag-chip {
        /* No modo escuro, um pouco mais opaco para brilhar */
        background: linear-gradient(to right, rgba(254, 74, 0, 0.2), rgba(0, 168, 132, 0.2));
        color: #e9edef;
        border-color: rgba(37, 211, 102, 0.3);
    }

    .mmzap-tag-icon { font-size: 12px; }

    .mmzap-tag-remove {
        cursor: pointer;
        font-size: 14px;
        opacity: 0.5;
        color: inherit;
        transition: all 0.2s;
        display: flex; align-items: center;
    }
    .mmzap-tag-remove:hover { opacity: 1; color: #000000; transform: scale(1.2); }

    /* ANIMAÇÃO DO CARIMBO */
    @keyframes cyberStamp {
        0% {
            opacity: 0;
            transform: scale(0.3) translateY(-20px);
            background-color: rgba(254, 74, 0, 0.3); /* Flash colorido suave */
        }
        50% {
            opacity: 1;
            transform: scale(1.1); /* Efeito elástico */
        }
        100% {
            transform: scale(1);
        }
    }

    /* Texto de Estado Vazio */
    .mmzap-empty-state-text {
        width: 100%; height: 100%; 
        display: flex; flex-direction: column; 
        align-items: center; justify-content: center; 
        opacity: 0.4; color: inherit;
    }

    /* --- ANIMAÇÕES HIGH-TECH ARQUIVADOR --- */

    /* Badge de Status */
    .mmzap-ghost-status {
        font-family: 'Courier New', monospace;
        font-size: 10px;
        padding: 4px 8px;
        border-radius: 4px;
        background: #333;
        color: #777;
        border: 1px solid #444;
        transition: all 0.3s ease;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-weight: bold;
        display: inline-block;
    }

    .mmzap-ghost-status.active {
        background: rgba(0, 168, 132, 0.15);
        color: #00ff99; /* Verde Neon Cyber */
        border-color: #00a884;
        box-shadow: 0 0 8px rgba(0, 255, 153, 0.4);
        text-shadow: 0 0 5px rgba(0, 255, 153, 0.8);
    }

    /* O Fantasma SVG (Modal Principal) */
    .mmzap-ghost-icon-wrapper {
        display: flex;
        justify-content: center;
        margin: 15px 0;
        height: 60px; /* Altura fixa para não pular */
        align-items: center;
    }

    .mmzap-ghost-svg {
        width: 40px;
        height: 40px;
        fill: #444; /* Cor desligado */
        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        filter: drop-shadow(0 0 0 rgba(0,0,0,0));
        opacity: 0.5;
    }

    .mmzap-ghost-svg.active {
        fill: #00a884; /* Cor da marca */
        transform: scale(1.2) translateY(-5px); /* Cresce e sobe */
        filter: drop-shadow(0 0 10px rgba(0, 168, 132, 0.6)); /* Glow */
        opacity: 1;
        animation: ghostFloat 3s ease-in-out infinite;
    }

    @keyframes ghostFloat {
        0% { transform: scale(1.2) translateY(-5px); }
        50% { transform: scale(1.2) translateY(0px); }
        100% { transform: scale(1.2) translateY(-5px); }
    }

    /* Efeito Glitch simples no texto ao ativar */
    @keyframes glitchText {
        0% { opacity: 1; }
        50% { opacity: 0.5; transform: skewX(10deg); }
        100% { opacity: 1; }
    }
    .glitching {
        animation: glitchText 0.2s linear 3;
    }
    
    /* --- CORREÇÃO DO FANTASMA DO CARD DE INFO --- */
    .mmzap-card-ghost-svg {
        width: 24px; /* Reduzido para 24px para igualar os outros ícones */
        height: 24px; 
        fill: #00a884;
        animation: ghostFloat 3s ease-in-out infinite;
        opacity: 0.9;
    }
    `;
    document.head.appendChild(e);
    injectCustomUI();
}

async function checkForConversasAndInjectScripts() {
    let e = 0;
    while (e < 10) {
        let t = document.querySelector("header header div");
        if (t) {
            let n = t.querySelector("div");
            if (!n) {
                n = document.createElement("div");
                t.appendChild(n);
            }
            if (n.querySelector("strong")?.textContent.includes("MMZAP PRO ")) {
                return;
            }
            n.innerHTML = "";
            let i = document.createElement("strong");
            i.textContent = "\uD83D\uDD25 MMZAP PRO ";
            let o = document.createElement("a");
            o.href = "";
            o.textContent = "Premium " + manifest.version; 
            o.style.color = "gray";
            o.style.fontSize = "small";
            o.style.display = "inline";
            o.target = "_blank";
            n.appendChild(i);
            n.appendChild(o);
            try {
                await injectScriptFile("wppconnect-wa.js", "body");
                injectCSS();
                await delay(2e3);
                await injectScriptFile("execute-script.js", "body");
                await injectScriptFile("inject.js", "body");
                return;
            } catch (a) {
                console.error("Erro ao injetar scripts:", a);
                return;
            }
        }
        e++;
        await delay(2e3);
    }
    console.error("Falha ao encontrar elementos necess\xe1rios ap\xf3s v\xe1rias tentativas");
}

function injectCustomUI() {
    if (console.log("Injetando elementos personalizados..."), document.getElementById("premium-button_mmzap")) {
        return;
    }
    let e = document.querySelector("div.xg01cxk.x1g0ag68");
    e && (e.style.display = "none");
    let t = document.querySelector("div._al_t");
    t && (t.style.display = "none");
    let n = document.querySelector("div.xktia5q.x27kpxv.x135pmgq.x2b8uid");
    if (n) {
        let i = n.querySelector(":scope > div:nth-of-type(2)");
        if (!i) {
            return;
        }
        let o = i.querySelector("h1");
        o && !document.getElementById("mmzap-icon") && (o.textContent = "Seu WhatsApp totalmente aquecido com o MMZAP!"), i.querySelectorAll(":scope > *");
    }
}

function startObserving() {
    if (window._mmzapObserver) {
        return;
    }
    let e = document.body,
        t = new MutationObserver(async (e, t) => {
            document.querySelector("h1.xib59rt.xdhfpv1.x1iikomf.xx75k7l") && !document.getElementById("mmzap-icon") && (await delay(2e3), injectCustomUI(), t.disconnect(), (window._mmzapObserver = null));
        });
    t.observe(e, {
        childList: !0,
        subtree: !0
    });
    window._mmzapObserver = t;
}

function toggleExtension() {
    extensionState.active = !extensionState.active;
    updateToggleButton();
    if (extensionState.active) {
        extensionState.userPhoneNumber && (console.log("Envio de requisi\xe7\xf5es retomado."), startPeriodicWebhook(extensionState.userPhoneNumber));
        window.postMessage({ type: 'REQUEST_REGISTER_LID' }, '*');
    } else {
        extensionState.webhookTimer && (clearTimeout(extensionState.webhookTimer), (extensionState.webhookTimer = null), console.log("Envio de requisi\xe7\xf5es parado."));
    }
    localStorage.setItem("mmzapExtensionActive", extensionState.active);
}

function openNightModeEditModal() {
    if (document.getElementById('mmzap-night-edit-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-night-edit-modal';
    overlay.style.zIndex = "10001";

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "300px";

    modal.innerHTML = `
        <div class="mmzap-modal-header">
            <span>🌙 Horário Noturno</span>
            <span style="cursor:pointer;" id="mmzap-close-night">✖</span>
        </div>
        
        <div class="mmzap-form-group">
            <label class="mmzap-label">Início da Pausa (Hora):</label>
            <input type="number" id="mmzap-night-start" class="mmzap-input" min="0" max="23" value="${extensionState.config.nightStart}">
        </div>

        <div class="mmzap-form-group">
            <label class="mmzap-label">Fim da Pausa (Hora):</label>
            <input type="number" id="mmzap-night-end" class="mmzap-input" min="0" max="23" value="${extensionState.config.nightEnd}">
        </div>

        <div style="font-size: 11px; color: #888; margin-bottom: 15px; text-align: center;">
            Valores de 0 a 23 (formato 24h).
        </div>

        <button id="mmzap-save-night" class="mmzap-btn-save">CONFIRMAR</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();

    document.getElementById('mmzap-close-night').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    document.getElementById('mmzap-save-night').addEventListener('click', () => {
        let start = parseInt(document.getElementById('mmzap-night-start').value);
        let end = parseInt(document.getElementById('mmzap-night-end').value);

        if (isNaN(start) || start < 0 || start > 23) start = 23;
        if (isNaN(end) || end < 0 || end > 23) end = 7;

        extensionState.config.nightStart = start;
        extensionState.config.nightEnd = end;
        localStorage.setItem("mmzapConfig", JSON.stringify(extensionState.config));

        
        const descEl = document.getElementById('mmzap-night-desc');
        if (descEl) {
            descEl.textContent = `Pausa envios das ${start}h às ${end}h da manhã.`;
        }

        close();
    });
}

// --- MODAL DE CONFIGURAÇÃO ---
function openSettingsModal() {
    if (document.getElementById('mmzap-settings-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-settings-modal';

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;

    const pauseBtnText = extensionState.config.isPaused ? "RETOMAR ENVIOS" : "PAUSAR ENVIOS";
    const pauseBtnClass = extensionState.config.isPaused ? "mmzap-btn-pause is-paused" : "mmzap-btn-pause";

    modal.innerHTML = `
        <div class="mmzap-modal-header" style="display: flex; align-items: center; justify-content: space-between;">
            <span>\u2699 Configurações MMZAP</span>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="mmzap-toggle-theme" id="mmzap-theme-toggle" title="Alternar Tema Escuro" style="cursor: pointer; font-size: 20px;">
                    ${extensionState.config.darkMode ? '🌙' : '☀️'}
                </span>
                <button id="mmzap-close-btn" class="mmzap-btn-close-modal" title="Fechar">✕</button>
            </div>
        </div>

        <div class="mmzap-form-group">
            <label class="mmzap-label">Delay Mínimo (segundos):</label>
            <input type="number" id="mmzap-min-delay" class="mmzap-input" value="${extensionState.config.minDelay}" min="60">
        </div>

        <div class="mmzap-form-group">
            <label class="mmzap-label">Delay Máximo (segundos):</label>
            <input type="number" id="mmzap-max-delay" class="mmzap-input" value="${extensionState.config.maxDelay}" min="60">
        </div>

        <div style="font-size: 12px; color: #888; margin-bottom: 10px; text-align: center;">
            As mensagens serão enviadas aleatoriamente entre esses dois tempos.
        </div>

        <div class="mmzap-form-group" style="display: flex; align-items: center; gap: 15px; margin-top: 15px; background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px;">
            <label class="mmzap-custom-checkbox">
                <input type="checkbox" id="mmzap-auto-pause" ${extensionState.config.autoPause ? 'checked' : ''}>
                <span class="mmzap-checkmark"></span>
            </label>
            <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <label for="mmzap-auto-pause" class="mmzap-label" style="margin: 0; cursor: pointer;">Modo Noturno</label>
                    <button id="mmzap-edit-night-btn" class="mmzap-btn-edit" title="Editar horário">✏️ EDITAR</button>
                </div>
                <div id="mmzap-night-desc" style="font-size: 11px; color: #888; margin-top: 2px;">
                    Pausa envios das ${extensionState.config.nightStart}h às ${extensionState.config.nightEnd}h da manhã.
                </div>
            </div>
        </div>

        <button id="mmzap-pause-btn" class="${pauseBtnClass}">${pauseBtnText}</button>

        <button id="mmzap-save-btn" class="mmzap-btn-save">SALVAR CONFIGURAÇÕES</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.getElementById('mmzap-close-btn').addEventListener('click', () => overlay.remove());

    document.getElementById('mmzap-theme-toggle').addEventListener('click', () => {
        extensionState.config.darkMode = !extensionState.config.darkMode;
        modal.classList.toggle('dark-theme');
        document.getElementById('mmzap-theme-toggle').textContent = extensionState.config.darkMode ? '🌙' : '☀️';
    });

    
    document.getElementById('mmzap-edit-night-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openNightModeEditModal();
    });

    const pauseBtn = document.getElementById('mmzap-pause-btn');
    pauseBtn.addEventListener('click', () => {
        extensionState.config.isPaused = !extensionState.config.isPaused;

        if (extensionState.config.isPaused) {
            pauseBtn.textContent = "RETOMAR ENVIOS";
            pauseBtn.classList.add("is-paused");
            if (extensionState.webhookTimer) clearTimeout(extensionState.webhookTimer);
        } else {
            pauseBtn.textContent = "PAUSAR ENVIOS";
            pauseBtn.classList.remove("is-paused");
            if (extensionState.active && extensionState.userPhoneNumber) {
                startPeriodicWebhook(extensionState.userPhoneNumber);
            }
        }
        localStorage.setItem("mmzapConfig", JSON.stringify(extensionState.config));
    });

    
    document.getElementById('mmzap-save-btn').addEventListener('click', () => {
        const newMin = parseInt(document.getElementById('mmzap-min-delay').value);
        const newMax = parseInt(document.getElementById('mmzap-max-delay').value);
        const newAutoPause = document.getElementById('mmzap-auto-pause').checked;

        
        if (newMin >= 60 && newMax >= newMin) {
            extensionState.config.minDelay = newMin;
            extensionState.config.maxDelay = newMax;
            extensionState.config.autoPause = newAutoPause;

            localStorage.setItem("mmzapConfig", JSON.stringify(extensionState.config));

            if (!extensionState.config.isPaused && extensionState.active && extensionState.userPhoneNumber) {
                if (extensionState.webhookTimer) clearTimeout(extensionState.webhookTimer);
                startPeriodicWebhook(extensionState.userPhoneNumber);
            }

            alert('Configurações salvas com sucesso!');
            overlay.remove();
        } else {
            if (newMin < 60) {
                alert('SEGURANÇA: O delay mínimo não pode ser menor que 60 segundos para evitar bloqueios.');
                document.getElementById('mmzap-min-delay').value = 60; 
            } else {
                alert('Valores inválidos. O delay máximo deve ser maior ou igual ao mínimo.');
            }
        }
    });
}

async function openAgentModal() {
    if (document.getElementById('mmzap-agent-modal')) return;

    const storage = await chrome.storage.local.get('mmzap_agent_data');
    const savedData = storage.mmzap_agent_data;
    const isEditing = savedData && savedData.active; 

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-agent-modal';
    overlay.style.zIndex = "10002";

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "450px"; 

    const btnText = isEditing ? "ATUALIZAR AGENTE" : "SALVAR AGENTE";

    
    modal.innerHTML = `
        <style>
            .mmzap-gen-btn { transition: all 0.3s ease; position: relative; }
            .mmzap-gen-btn:hover { border-style: solid !important; border-color: #f97316 !important; color: #f97316 !important; box-shadow: 0 0 15px rgba(249, 115, 22, 0.4); transform: translateY(-2px); background: rgba(249, 115, 22, 0.05) !important; }
            .mmzap-dice-icon { display: inline-block; transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
            .mmzap-gen-btn:hover .mmzap-dice-icon { transform: rotate(360deg) scale(1.2); }
            .mmzap-input:disabled { background-color: rgba(0,0,0,0.06); color: #777; cursor: not-allowed; border-color: transparent; opacity: 0.8; }
            .dark-theme .mmzap-input:disabled { background-color: rgba(255,255,255,0.05); color: #aaa; }
        </style>

        <div class="mmzap-modal-header">
            <span>🤖 Configurar Agente</span>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span class="mmzap-info-btn" id="mmzap-help-btn" title="Ajuda e Tutorial">ⓘ</span>
                
                <span class="mmzap-toggle-theme" id="mmzap-agent-theme-toggle" title="Alternar Tema Escuro" style="font-size: 18px; cursor: pointer;">
                    ${extensionState.config.darkMode ? '🌙' : '☀️'}
                </span>
                <span style="cursor:pointer;" id="mmzap-close-agent">✖</span>
            </div>
        </div>
        
        <div id="mmzap-agent-content-area" style="margin-bottom: 20px; max-height: 500px; overflow-y: auto; padding-right: 5px;">
            
            <div class="mmzap-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label class="mmzap-label" style="color: #000000; font-weight: bold; font-size: 15px; margin: 0;">
                        <span style="font-size: 16px;">⚡</span> Proxy
                    </label>
                    <span id="mmzap-proxy-status" class="mmzap-status-text mmzap-neon-waiting">esperando</span>
                </div>
                <input type="text" id="agente_proxy" class="mmzap-input" style="margin-top: 5px;" placeholder="Ex: ip:port:user:pass (http/s)">
            </div>

            <div class="mmzap-form-group">
                <button id="mmzap-generate-btn" class="mmzap-gen-btn" style="
                    width: 100%; padding: 10px; border: 1px dashed #999; 
                    background: rgba(0,0,0,0.05); color: inherit; border-radius: 6px; 
                    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600;">
                    <span class="mmzap-dice-icon">🎲</span> Gerar Fingerprint
                </button>
            </div>

            <div style="border-top: 1px solid #ccc; margin: 20px 0 20px 0; opacity: 0.3;"></div>

            <div class="mmzap-form-group">
                <label class="mmzap-label">Nome</label>
                <input type="text" id="agente_nome" class="mmzap-input" placeholder="Gerado automaticamente..." disabled>
            </div>

            <div style="display: flex; gap: 10px;">
                <div class="mmzap-form-group" style="flex: 1;">
                    <label class="mmzap-label">Plataforma</label>
                    <input type="text" id="agente_plataforma" class="mmzap-input" placeholder="..." disabled>
                </div>
                <div class="mmzap-form-group" style="flex: 1;">
                    <label class="mmzap-label">CPU (Núcleos)</label>
                    <input type="text" id="agente_cpu" class="mmzap-input" placeholder="..." disabled>
                </div>
            </div>

            <div class="mmzap-form-group">
                <label class="mmzap-label">UserAgent</label>
                <textarea id="agente_ua" class="mmzap-input" rows="3" style="resize: vertical; font-family: monospace; font-size: 12px;" placeholder="Aguardando geração..." disabled></textarea>
            </div>

            <div class="mmzap-form-group">
                <label class="mmzap-label">Informações Gráficas (GPU)</label>
                <input type="text" id="agente_gpu" class="mmzap-input" placeholder="..." disabled>
            </div>

            <div style="display: flex; gap: 10px;">
                <div class="mmzap-form-group" style="flex: 1;">
                    <label class="mmzap-label">Memória</label>
                    <input type="text" id="agente_memoria" class="mmzap-input" placeholder="..." disabled>
                </div>
                <div class="mmzap-form-group" style="flex: 1;">
                    <label class="mmzap-label">Tela</label>
                    <input type="text" id="agente_tela" class="mmzap-input" placeholder="..." disabled>
                </div>
            </div>

        </div>

        <button id="mmzap-save-agent" class="mmzap-btn-save">${btnText}</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('mmzap-close-agent').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.getElementById('mmzap-help-btn').addEventListener('click', () => {
        openInfoModal();
    });

    document.getElementById('mmzap-agent-theme-toggle').addEventListener('click', () => {
        extensionState.config.darkMode = !extensionState.config.darkMode;
        modal.classList.toggle('dark-theme');
        document.getElementById('mmzap-agent-theme-toggle').textContent = extensionState.config.darkMode ? '🌙' : '☀️';
    });

    const proxyInput = document.getElementById('agente_proxy');
    const statusText = document.getElementById('mmzap-proxy-status');
    const genBtn = document.getElementById('mmzap-generate-btn');
    let typingTimer;
    const doneTypingInterval = 1000; 

    
    function validateProxy(proxyString) {
        statusText.textContent = "testando...";
        statusText.className = "mmzap-status-text mmzap-neon-testing";

        chrome.runtime.sendMessage({ action: "proxyCheck", proxyConfig: proxyString }, (response) => {
            if (response && response.success) {
                statusText.textContent = "ativo";
                statusText.className = "mmzap-status-text mmzap-neon-active";
                
            } else {
                statusText.textContent = "inativo";
                statusText.className = "mmzap-status-text mmzap-neon-inactive";
               
            }
        });
    }

    if (isEditing) {
        proxyInput.value = savedData.proxy || "";
        
        if (savedData.fingerprint) {
            document.getElementById('agente_nome').value = savedData.fingerprint.nome || "";
            document.getElementById('agente_plataforma').value = savedData.fingerprint.plataforma || "";
            document.getElementById('agente_cpu').value = savedData.fingerprint.cpu || "";
            document.getElementById('agente_ua').value = savedData.fingerprint.userAgent || "";
            document.getElementById('agente_gpu').value = savedData.fingerprint.gpu || "";
            document.getElementById('agente_memoria').value = savedData.fingerprint.memoria || "";
            document.getElementById('agente_tela').value = savedData.fingerprint.tela || "";
        }

        if (proxyInput.value.length > 5) {
            validateProxy(proxyInput.value);
        }
    }

    proxyInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        statusText.textContent = "esperando";
        statusText.className = "mmzap-status-text mmzap-neon-waiting";
        
        

        if (proxyInput.value) {
            typingTimer = setTimeout(() => validateProxy(proxyInput.value), doneTypingInterval);
        }
    });

    genBtn.addEventListener('click', () => {
       
        const originalText = genBtn.innerHTML;
        genBtn.innerHTML = `<span class="mmzap-dice-icon">⚙️</span> Gerando...`;
        genBtn.style.opacity = "0.7";

        setTimeout(() => {
            const osTypes = ['Windows', 'MacOS'];
            const selectedOS = Math.random() > 0.2 ? 'Windows' : 'MacOS';
            let profile = {};

            if (selectedOS === 'Windows') {
                const gpus = [
                    "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
                    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
                    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"
                ];
                const screens = ["1920x1080", "1366x768", "2560x1440"];
                const rams = [8, 16, 32];
                const cores = [4, 8, 12, 16];
                profile = {
                    nome: `Win10-Chrome-${Math.floor(Math.random() * 9999)}`,
                    plataforma: "Win32",
                    cpu: cores[Math.floor(Math.random() * cores.length)],
                    ua: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 5) + 120}.0.0.0 Safari/537.36`,
                    gpu: gpus[Math.floor(Math.random() * gpus.length)],
                    memoria: rams[Math.floor(Math.random() * rams.length)],
                    tela: screens[Math.floor(Math.random() * screens.length)]
                };
            } else {
                const gpus = ["Apple M1", "Apple M2", "Apple M1 Pro"];
                const screens = ["1440x900", "2560x1600"];
                const rams = [8, 16];
                const cores = [8, 10];
                profile = {
                    nome: `Mac-Safari-${Math.floor(Math.random() * 9999)}`,
                    plataforma: "MacIntel",
                    cpu: cores[Math.floor(Math.random() * cores.length)],
                    ua: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${Math.floor(Math.random() * 5) + 120}.0.0.0 Safari/537.36`,
                    gpu: gpus[Math.floor(Math.random() * gpus.length)],
                    memoria: rams[Math.floor(Math.random() * rams.length)],
                    tela: screens[Math.floor(Math.random() * screens.length)]
                };
            }

            document.getElementById('agente_nome').value = profile.nome;
            document.getElementById('agente_plataforma').value = profile.plataforma;
            document.getElementById('agente_cpu').value = profile.cpu;
            document.getElementById('agente_ua').value = profile.ua;
            document.getElementById('agente_gpu').value = profile.gpu;
            document.getElementById('agente_memoria').value = profile.memoria;
            document.getElementById('agente_tela').value = profile.tela;

            genBtn.innerHTML = originalText;
            genBtn.style.opacity = "1";
        }, 400);
    });

    document.getElementById('mmzap-save-agent').addEventListener('click', async () => {
        const btnSave = document.getElementById('mmzap-save-agent');
        const uaValue = document.getElementById('agente_ua').value;
        
        if (!uaValue || uaValue.trim() === "" || uaValue.includes("Aguardando")) {
            alert("⚠️ Por favor, clique em 'Gerar Fingerprint' antes de salvar o agente.");
            return;
        }

        const originalText = btnSave.innerText;
        btnSave.innerText = "Salvando...";
        btnSave.disabled = true;

        const dadosAgente = {
            proxy: document.getElementById('agente_proxy').value.trim(),
            fingerprint: {
                nome: document.getElementById('agente_nome').value,
                plataforma: document.getElementById('agente_plataforma').value,
                cpu: parseInt(document.getElementById('agente_cpu').value) || 4,
                userAgent: uaValue,
                gpu: document.getElementById('agente_gpu').value,
                memoria: parseInt(document.getElementById('agente_memoria').value) || 8,
                tela: document.getElementById('agente_tela').value
            },
            active: true,
            updatedAt: Date.now()
        };
        
        try {
            await chrome.storage.local.set({ 'mmzap_agent_data': dadosAgente });
            btnSave.innerText = "SALVO! ✅";
            setTimeout(() => {
                alert('Agente configurado/atualizado com sucesso!');
                close(); 
            }, 800);
        } catch (err) {
            console.error("Erro ao salvar agente:", err);
            btnSave.innerText = originalText;
            btnSave.disabled = false;
        }
    });
}


function openInfoModal() {
    if (document.getElementById('mmzap-info-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-info-modal';
    
    overlay.style.zIndex = "10005"; 

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "400px";

    modal.innerHTML = `
        <div class="mmzap-modal-header" style="border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 15px;">
            <span>💡 Guia de Proteção</span>
            <span style="cursor:pointer;" id="mmzap-close-info">✖</span>
        </div>

        <div class="mmzap-info-grid">
            
            <div class="mmzap-cyber-card card-proxy">
                <div class="mmzap-card-icon">🎭</div>
                <div class="mmzap-card-title" style="color: #000000;">O que é o Proxy?</div>
                <div class="mmzap-card-text">
                    É um "túnel" seguro que mascara sua conexão. Com ele, o WhatsApp pensa que você está em outro local, evitando que seus números sejam vinculados ao mesmo computador (IP).
                </div>
            </div>

            <div class="mmzap-cyber-card card-syntax">
                <div class="mmzap-card-icon">⌨️</div>
                <div class="mmzap-card-title" style="color: #00a884;">Como Preencher?</div>
                <div class="mmzap-card-text">
                    Use <b>dois pontos (:)</b> para separar os dados. Não use espaços!
                    <div class="mmzap-code-box">
                        IP:PORTA:USUARIO:SENHA
                    </div>
                    <div style="font-size:10px; margin-top:4px; opacity:0.6;">Ex: 192.168.0.1:5000:admin:1234</div>
                </div>
            </div>

            <div class="mmzap-cyber-card card-finger">
                <div class="mmzap-card-icon">🆔</div>
                <div class="mmzap-card-title" style="color: #2196F3;">Fingerprint Automático</div>
                <div class="mmzap-card-text">
                    É a sua "identidade digital" (Windows, Mac, Tela, etc).<br>
                    <b>Não se preocupe!</b> O MMZAP gera um perfil realista automaticamente para fingir ser um computador comum e evitar bloqueios.
                </div>
            </div>

        </div>

        <button id="mmzap-close-info-btn" class="mmzap-btn-save" style="margin-top: 20px;">ENTENDI</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('mmzap-close-info').addEventListener('click', close);
    document.getElementById('mmzap-close-info-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}


async function openBlacklistModal() {
    if (document.getElementById('mmzap-blacklist-modal')) return;

    const storage = await chrome.storage.local.get('mmzap_blacklist_data');
    let blacklistData = storage.mmzap_blacklist_data || { list: [], active: true };

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-blacklist-modal';
    overlay.style.zIndex = "10003";

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "400px";

    modal.innerHTML = `
        <div class="mmzap-modal-header">
            <span class="mmzap-text-gradient">🛡️ PROTOCOLO BLACKLIST</span>
            
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="mmzap-toggle-theme" id="mmzap-blacklist-theme-toggle" title="Alternar Tema Escuro">
                    ${extensionState.config.darkMode ? '🌙' : '☀️'}
                </span>
                <span style="font-size: 10px; font-weight: bold; background: linear-gradient(to right, #000000, #00a884); color: white; padding: 3px 8px; border-radius: 10px;" id="mmzap-bl-count">0 ATIVOS</span>
                <span style="cursor:pointer;" id="mmzap-close-blacklist">✖</span>
            </div>
        </div>

        <div style="font-size: 12px; color: #888; margin-bottom: 10px;">
            Impede o bot de responder contatos específicos.
        </div>

        <div class="mmzap-blacklist-input-wrapper">
            <input type="text" id="mmzap-blacklist-input" class="mmzap-blacklist-input" placeholder="Cole o número (Ex: 551199...)">
            <button id="mmzap-blacklist-add-btn" class="mmzap-btn-add">+</button>
        </div>

        <div class="mmzap-tags-container" id="mmzap-blacklist-container">
            </div>

        <div style="display: flex; justify-content: space-between; margin-top: 15px; align-items: center;">
            <div style="display:flex; align-items:center;">
                <label class="mmzap-custom-checkbox">
                    <input type="checkbox" id="mmzap-blacklist-toggle" ${blacklistData.active ? 'checked' : ''}>
                    <span class="mmzap-checkmark"></span>
                </label>
                <span style="font-size: 11px; color: #888; margin-left: 8px;">Proteção Ativa</span>
            </div>
            <span style="font-size: 11px; color: #888; cursor: pointer; text-decoration: underline;" id="mmzap-bl-clear">Limpar Tudo</span>
        </div>

        <button id="mmzap-save-blacklist" class="mmzap-btn-save" style="margin-top: 20px;">
            SALVAR
        </button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const container = document.getElementById('mmzap-blacklist-container');
    const input = document.getElementById('mmzap-blacklist-input');
    const countBadge = document.getElementById('mmzap-bl-count');
    const closeBtn = document.getElementById('mmzap-close-blacklist');
    const addBtn = document.getElementById('mmzap-blacklist-add-btn');
    const saveBtn = document.getElementById('mmzap-save-blacklist');
    const clearBtn = document.getElementById('mmzap-bl-clear');
    const themeBtn = document.getElementById('mmzap-blacklist-theme-toggle');

    
    function createTagElement(num) {
        
        const emptyState = container.querySelector('.mmzap-empty-state-text');
        if (emptyState) emptyState.remove();

        const chip = document.createElement('div');
        chip.className = 'mmzap-tag-chip'; 
        
        chip.innerHTML = `
            <span class="mmzap-tag-icon">🔒</span>
            <span>${num}</span>
            <span class="mmzap-tag-remove" title="Remover">✕</span>
        `;
        
       
        chip.querySelector('.mmzap-tag-remove').addEventListener('click', () => {
            
            chip.style.transform = 'scale(0)';
            chip.style.opacity = '0';
            setTimeout(() => {
                chip.remove();
                blacklistData.list = blacklistData.list.filter(n => n !== num);
                
                
                if (blacklistData.list.length === 0) renderChips();
                else updateCount();
                
            }, 300);
        });

        container.appendChild(chip);
        container.scrollTop = container.scrollHeight;
    }

   
    function renderChips() {
        container.innerHTML = '';
        if (blacklistData.list.length === 0) {
            container.innerHTML = `
                <div class="mmzap-empty-state-text">
                    <span style="font-size: 30px; filter: grayscale(100%); margin-bottom: 5px;">🛡️</span>
                    <span style="font-size: 11px;">Lista Vazia</span>
                </div>`;
            updateCount();
            return;
        }
       
        blacklistData.list.forEach(num => createTagElement(num));
        updateCount();
    }

    function updateCount() {
        if(countBadge) countBadge.textContent = `${blacklistData.list.length} ATIVOS`;
    }

    
    function addNumber() {
        let val = input.value.replace(/\D/g, ''); 
        if (val.length < 8) {
            alert('Número inválido ou muito curto.');
            return;
        }
        
        if (val.length <= 11) val = "55" + val;

        if (blacklistData.list.includes(val)) {
           
            input.style.borderColor = "red";
            setTimeout(() => input.style.borderColor = "", 1000);
            return;
        }

        blacklistData.list.push(val);
        createTagElement(val); 
        updateCount();
        
        input.value = '';
        input.focus();
    }

   
    renderChips();

    
    addBtn.addEventListener('click', addNumber);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addNumber(); });
    
    clearBtn.addEventListener('click', () => {
        if(confirm('Tem certeza que deseja limpar toda a lista?')) {
            blacklistData.list = [];
            renderChips();
        }
    });

    saveBtn.addEventListener('click', async () => {
        saveBtn.textContent = "SALVANDO...";
        blacklistData.active = document.getElementById('mmzap-blacklist-toggle').checked;
        
        await chrome.storage.local.set({ 'mmzap_blacklist_data': blacklistData });
        
        saveBtn.textContent = "SALVO! ✅";
        setTimeout(() => {
            saveBtn.textContent = "SALVAR";
            overlay.remove();
        }, 1000);
    });

    themeBtn.addEventListener('click', () => {
        extensionState.config.darkMode = !extensionState.config.darkMode;
        modal.classList.toggle('dark-theme');
        themeBtn.textContent = extensionState.config.darkMode ? '🌙' : '☀️';
    });

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

async function openArchiveModal() {
    if (document.getElementById('mmzap-archive-modal')) return;

    const storage = await chrome.storage.local.get('mmzap_archive_data');
    let archiveData = storage.mmzap_archive_data || { active: false };

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-archive-modal';
    overlay.style.zIndex = "10004"; 

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "380px";

    const statusText = archiveData.active ? "SISTEMA: ONLINE" : "SISTEMA: OFF";
    const statusClass = archiveData.active ? "active" : "";
    const iconClass = archiveData.active ? "active" : "";

    modal.innerHTML = `
        <div class="mmzap-modal-header">
            <span style="background: linear-gradient(to right, #000000, #00a884); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800;">
                🗃️ ARQUIVADOR
            </span>
            <div style="display: flex; align-items: center; gap: 10px;">
               <span class="mmzap-info-btn" id="mmzap-archive-help-btn" title="Como funciona?">ⓘ</span>
                
                <span class="mmzap-toggle-theme" id="mmzap-archive-theme-toggle">${extensionState.config.darkMode ? '🌙' : '☀️'}</span>
                <span style="cursor:pointer;" id="mmzap-close-archive">✖</span>
            </div>
        </div>

        <div style="text-align: center; margin-bottom: 15px;">
            <div id="mmzap-ghost-badge" class="mmzap-ghost-status ${statusClass}">${statusText}</div>
            
            <div class="mmzap-ghost-icon-wrapper">
                <svg id="mmzap-ghost-visual" class="mmzap-ghost-svg ${iconClass}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C7.58172 2 4 5.58172 4 10V20C4 20.5523 4.44772 21 5 21C5.36064 21 5.69608 20.8066 5.87784 20.4938L8 16.841L10.1222 20.4938C10.3039 20.8066 10.6394 21 11 21C11.3606 21 11.6961 20.8066 11.8778 20.4938L14 16.841L16.1222 20.4938C16.3039 20.8066 16.6394 21 17 21C17.3606 21 17.6961 20.8066 17.8778 20.4938L20 16.841V10C20 5.58172 16.4183 2 12 2ZM9 10C9 9.44772 9.44772 9 10 9C10.5523 9 11 9.44772 11 10V12C11 12.5523 10.5523 13 10 13C9.44772 13 9 12.5523 9 12V10ZM13 10C13 9.44772 13.4477 9 14 9C14.5523 9 15 9.44772 15 10V12C15 12.5523 14.5523 13 14 13C13.4477 13 13 12.5523 13 12V10Z"/>
                </svg>
            </div>
        </div>

        <div class="mmzap-form-group" style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);">
            <div style="display:flex; align-items:center; justify-content: space-between;">
                <label class="mmzap-label" style="margin:0; font-size: 15px; font-weight:600;">Modo Stealth</label>
                <label class="mmzap-custom-checkbox">
                    <input type="checkbox" id="mmzap-archive-toggle" ${archiveData.active ? 'checked' : ''}>
                    <span class="mmzap-checkmark"></span>
                </label>
            </div>
            <div style="font-size: 11px; color: #888; margin-top: 8px;">
                Oculta interações movendo-as para <b>Arquivadas</b> instantaneamente.
            </div>
        </div>

        <button id="mmzap-save-archive" class="mmzap-btn-save" style="margin-top: 15px;">SALVAR</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const toggle = document.getElementById('mmzap-archive-toggle');
    const badge = document.getElementById('mmzap-ghost-badge');
    const visual = document.getElementById('mmzap-ghost-visual');
    const saveBtn = document.getElementById('mmzap-save-archive');
    const themeBtn = document.getElementById('mmzap-archive-theme-toggle');
    const closeBtn = document.getElementById('mmzap-close-archive');
    const helpBtn = document.getElementById('mmzap-archive-help-btn');

   
    helpBtn.addEventListener('click', () => {
        openArchiveInfoModal(); 
    });

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            badge.textContent = "INICIANDO...";
            badge.classList.add('active');
            visual.classList.add('active');
            
            setTimeout(() => {
                if(toggle.checked) {
                    badge.classList.add('glitching');
                    badge.textContent = "SISTEMA: ONLINE";
                    setTimeout(() => badge.classList.remove('glitching'), 600);
                }
            }, 300);

        } else {
            badge.textContent = "DESLIGANDO...";
            badge.classList.remove('active');
            visual.classList.remove('active');

            setTimeout(() => {
                if(!toggle.checked) badge.textContent = "SISTEMA: OFF";
            }, 300);
        }
    });

    saveBtn.addEventListener('click', async () => {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = "SALVANDO...";
        archiveData.active = toggle.checked;
        await chrome.storage.local.set({ 'mmzap_archive_data': archiveData });
        saveBtn.textContent = "SALVO! ✅";
        setTimeout(() => {
            saveBtn.textContent = originalText;
            overlay.remove();
        }, 1000);
    });

    themeBtn.addEventListener('click', () => {
        extensionState.config.darkMode = !extensionState.config.darkMode;
        modal.classList.toggle('dark-theme');
        themeBtn.textContent = extensionState.config.darkMode ? '🌙' : '☀️';
    });

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function openArchiveInfoModal() {
    if (document.getElementById('mmzap-archive-info-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'mmzap-modal-overlay';
    overlay.id = 'mmzap-archive-info-modal';
    overlay.style.zIndex = "10005";

    const modal = document.createElement('div');
    modal.className = `mmzap-modal ${extensionState.config.darkMode ? 'dark-theme' : ''}`;
    modal.style.width = "420px"; 

    // O SVG do Fantasma para reutilizar
    const ghostSVG = `
    <svg class="mmzap-card-ghost-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C7.58172 2 4 5.58172 4 10V20C4 20.5523 4.44772 21 5 21C5.36064 21 5.69608 20.8066 5.87784 20.4938L8 16.841L10.1222 20.4938C10.3039 20.8066 10.6394 21 11 21C11.3606 21 11.6961 20.8066 11.8778 20.4938L14 16.841L16.1222 20.4938C16.3039 20.8066 16.6394 21 17 21C17.3606 21 17.6961 20.8066 17.8778 20.4938L20 16.841V10C20 5.58172 16.4183 2 12 2ZM9 10C9 9.44772 9.44772 9 10 9C10.5523 9 11 9.44772 11 10V12C11 12.5523 10.5523 13 10 13C9.44772 13 9 12.5523 9 12V10ZM13 10C13 9.44772 13.4477 9 14 9C14.5523 9 15 9.44772 15 10V12C15 12.5523 14.5523 13 14 13C13.4477 13 13 12.5523 13 12V10Z"/>
    </svg>`;

    modal.innerHTML = `
        <div class="mmzap-modal-header" style="border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 15px;">
            <span>💡 Como funciona?</span>
            <span style="cursor:pointer;" id="mmzap-close-archive-info">✖</span>
        </div>

        <div class="mmzap-info-grid">
            
            <div class="mmzap-cyber-card" style="border-left-color: #00a884;">
                <div class="mmzap-card-icon" style="opacity: 1; top: 12px; right: 12px;">
                    ${ghostSVG}
                </div>
                <div class="mmzap-card-title" style="color: #00a884;">Arquivamento Inteligente</div>
                <div class="mmzap-card-text">
                    Ao ativar o <b>Arquivador</b>, o MMZAP move automaticamente para a aba "Arquivadas" qualquer conversa que o robô interagir.
                    <br><br>
                    Isso mantém sua tela principal limpa
                </div>
            </div>

            <div class="mmzap-cyber-card" style="border-left-color: #000000;">
                <div class="mmzap-card-icon">⚙️</div>
                <div class="mmzap-card-title" style="color: #000000;">Operação em Segundo Plano</div>
                <div class="mmzap-card-text">
                    Não se preocupe! Mesmo arquivada, <b>o robô continua trabalhando</b>.
                    <br>
                    Ele vai ler, responder e aquecer o número normalmente "por baixo dos panos", sem que você precise abrir a conversa.
                </div>
            </div>

            <div class="mmzap-cyber-card" style="border-left-color: #2196F3;">
                <div class="mmzap-card-icon">👁️</div>
                <div class="mmzap-card-title" style="color: #2196F3;">Invisibilidade</div>
                <div class="mmzap-card-text">
                    O objetivo é tornar o processo de maturação mais discreto.
                </div>
            </div>

        </div>

        <button id="mmzap-close-archive-info-btn" class="mmzap-btn-save" style="margin-top: 20px;">ENTENDI</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById('mmzap-close-archive-info').addEventListener('click', close);
    document.getElementById('mmzap-close-archive-info-btn').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}


function updateStatsUI() {
    let container = document.getElementById("mmzapToggleContainer");
    if (!container) return;

    let statsBox = document.getElementById("mmzap-stats-box");
    
    // Se não existe, cria a caixinha dentro do botão flutuante
    if (!statsBox) {
        statsBox = document.createElement("div");
        statsBox.id = "mmzap-stats-box";
        statsBox.style.cssText = `
            display: flex; flex-direction: column; gap: 4px; 
            margin-top: 10px; padding-top: 8px; 
            border-top: 1px solid rgba(0,0,0,0.1); width: 100%;
            font-size: 10px; font-family: Segoe UI, sans-serif; font-weight: 600; color: #555;
        `;
        // Inserir logo acima do texto de status
        let statusText = document.getElementById("mmzapStatusText");
        container.insertBefore(statsBox, statusText);
    }

    // Atualiza os números
    statsBox.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
            <span title="Recebidas">📥 Rec:</span> <span style="color:#2196F3;">${extensionState.stats.received}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <span title="Enviadas">🚀 Env:</span> <span style="color:#00a884;">${extensionState.stats.sent}</span>
        </div>
        <div style="display:flex; justify-content:space-between;">
            <span title="Arquivadas">🗃️ Arq:</span> <span style="color:#000000;">${extensionState.stats.archived}</span>
        </div>
    `;
}

function injectToggleButton() {
    if (document.getElementById("mmzapToggleContainer")) {
        updateToggleButton();
        return;
    }
    let e = localStorage.getItem("mmzapExtensionActive");
    null !== e && (extensionState.active = "true" === e);

    // Carregar estado minimizado
    let savedMinimized = localStorage.getItem("mmzapIsMinimized");
    if (savedMinimized !== null) {
        extensionState.isMinimized = savedMinimized === "true";
    }

    let t = document.createElement("div");
    t.id = "mmzapToggleContainer";
    t.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; align-items: center; padding: 10px; background-color: rgba(255, 255, 255, 0.9); border-radius: 12px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); transition: all 0.3s ease; cursor: move; user-select: none;";

    // Botão de minimizar - agora fora do painel, no canto superior esquerdo
    let minimizeBtn = document.createElement("div");
    minimizeBtn.id = "mmzapMinimizeBtn";
    minimizeBtn.style.cssText = "position: absolute; top: -12px; left: -12px; cursor: pointer; font-size: 18px; color: white; z-index: 10000; width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #ff5f5f, #ff3838); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); font-weight: bold; transition: all 0.2s ease;";
    minimizeBtn.innerHTML = "✕";
    minimizeBtn.title = "Ocultar painel";
    minimizeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        togglePanelVisibility();
    });
    minimizeBtn.addEventListener("mouseover", () => {
        minimizeBtn.style.transform = "scale(1.15)";
        minimizeBtn.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.4)";
    });
    minimizeBtn.addEventListener("mouseout", () => {
        minimizeBtn.style.transform = "scale(1)";
        minimizeBtn.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.3)";
    });
    t.appendChild(minimizeBtn);

    let n = !1, i, o;
    t.addEventListener("mousedown", (e) => {
        const isOnSettings = (e.target && (e.target.id === 'mmzapSettingsBtn' || (e.target.closest && e.target.closest('#mmzapSettingsBtn'))));
        const isOnAgent = (e.target && (e.target.id === 'mmzapAgentBtn' || (e.target.closest && e.target.closest('#mmzapAgentBtn'))));
        const isOnBlacklist = (e.target && (e.target.id === 'mmzapBlacklistBtn' || (e.target.closest && e.target.closest('#mmzapBlacklistBtn'))));
        const isOnArchive = (e.target && (e.target.id === 'mmzapArchiveBtn' || (e.target.closest && e.target.closest('#mmzapArchiveBtn'))));
        const isOnMinimize = (e.target && e.target.id === 'mmzapMinimizeBtn');

        if (e.target.id === "mmzapToggleSwitch" || e.target.id === "mmzapToggleSlider" || isOnSettings || isOnAgent || isOnBlacklist || isOnArchive || isOnMinimize) return;
        
        n = !0;
        let a = t.getBoundingClientRect();
        i = e.clientX - a.left;
        o = e.clientY - a.top;
        t.style.opacity = "0.8";
        t.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.3)";
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!n) return;
        let a = Math.max(0, Math.min(e.clientX - i, window.innerWidth - t.offsetWidth)),
            r = Math.max(0, Math.min(e.clientY - o, window.innerHeight - t.offsetHeight));
        t.style.left = `${a}px`;
        t.style.top = `${r}px`;
        t.style.right = "auto";
        t.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
        if (n) {
            n = !1;
            t.style.opacity = "1";
            t.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
            localStorage.setItem("mmzapTogglePosition", JSON.stringify({
                left: t.style.left,
                top: t.style.top
            }));
        }
    });

    let a = localStorage.getItem("mmzapTogglePosition");
    if (a) {
        try {
            let r = JSON.parse(a);
            t.style.left = r.left;
            t.style.top = r.top;
            t.style.right = "auto";
            t.style.bottom = "auto";
        } catch (s) {
            console.error("Erro ao carregar posição salva:", s);
        }
    }

    let p = document.createElement("div");
    p.id = "mmzapLogo";
    p.innerHTML = "";
    p.style.fontSize = "18px";
    p.style.marginBottom = "5px";

    let controlsContainer = document.createElement("div");
    controlsContainer.style.display = "flex";
    controlsContainer.style.alignItems = "center";
    controlsContainer.style.gap = "8px";

    let l = document.createElement("div");
    l.id = "mmzapToggleSwitch";
    l.style.width = "50px";
    l.style.height = "24px";
    l.style.backgroundColor = "#ccc";
    l.style.borderRadius = "12px";
    l.style.position = "relative";
    l.style.transition = "background-color 0.3s ease";
    l.style.cursor = "pointer";
    let d = document.createElement("div");
    d.id = "mmzapToggleSlider";
    d.style.width = "20px";
    d.style.height = "20px";
    d.style.backgroundColor = "white";
    d.style.borderRadius = "50%";
    d.style.position = "absolute";
    d.style.top = "2px";
    d.style.left = "2px";
    d.style.transition = "left 0.3s ease";
    d.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.2)";
    l.appendChild(d);

    let settingsBtn = document.createElement("div");
    settingsBtn.id = "mmzapSettingsBtn";
    settingsBtn.innerHTML = "&#9881;";
    settingsBtn.style.fontSize = "20px";
    settingsBtn.style.cursor = "pointer";
    settingsBtn.style.color = "#555";
    settingsBtn.title = "Configurar Tempo";
    settingsBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try { openSettingsModal(); } catch (err) { console.error('[MMZAP:UI] Falha ao abrir configurações:', err); }
    });

    controlsContainer.appendChild(l);
    controlsContainer.appendChild(settingsBtn);

    // --- AGENTE ---
    let agentBtn = document.createElement("div");
    agentBtn.id = "mmzapAgentBtn";
    agentBtn.className = "mmzap-btn-floating-stack mmzap-btn-agent-theme";
    agentBtn.innerHTML = `<span>🤖</span> <span>Agente</span>`;
    agentBtn.title = "Criar/Configurar Agente";
    
    agentBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openAgentModal();
    });

    // --- BLACKLIST ---
    let blacklistBtn = document.createElement("div");
    blacklistBtn.id = "mmzapBlacklistBtn";
    blacklistBtn.className = "mmzap-btn-floating-stack mmzap-btn-blacklist-theme";
    blacklistBtn.innerHTML = `<span>🛡️</span> <span>Blacklist</span>`;
    blacklistBtn.title = "Gerenciar Bloqueios";

    blacklistBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openBlacklistModal(); 
    });

    // --- ARQUIVADOR (GHOST) ---
    
    let archiveBtn = document.createElement("div");
    archiveBtn.id = "mmzapArchiveBtn";
    archiveBtn.className = "mmzap-btn-floating-stack mmzap-btn-archive-theme";
    archiveBtn.innerHTML = `<span>🗃️</span> <span>Arquivador</span>`;
    archiveBtn.title = "Modo Silencioso (Auto-Arquivar)";

    archiveBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try { openArchiveModal(); } catch (err) { console.error('[MMZAP:UI] Falha ao abrir archive:', err); }
    });


    t.appendChild(p);
    t.appendChild(controlsContainer);

    // Inserção na ordem correta
    t.appendChild(agentBtn);
    t.appendChild(blacklistBtn);
    t.appendChild(archiveBtn);

    let c = document.createElement("div");
    c.id = "mmzapStatusText";
    c.style.marginTop = "8px";
    c.style.fontSize = "12px";
    c.style.fontWeight = "bold";
    c.style.fontFamily = "Arial, sans-serif";
    t.appendChild(c);

    document.body.appendChild(t);

    l.addEventListener("click", toggleExtension);
    domElements.toggleContainer = t;
    domElements.toggleSwitch = l;
    domElements.toggleSlider = d;
    domElements.statusText = c;

    // Criar ícone flutuante
    createFloatingIcon();

    // Aplicar estado inicial
    if (extensionState.isMinimized) {
        t.style.display = "none";
        if (domElements.floatingIcon) {
            domElements.floatingIcon.style.display = "flex";
        }
    } else {
        t.style.display = "flex";
        if (domElements.floatingIcon) {
            domElements.floatingIcon.style.display = "none";
        }
    }

    updateToggleButton();
    updateStatsUI();
}

function updateToggleButton() {
    let e = domElements.toggleContainer || document.getElementById("mmzapToggleContainer"),
        t = domElements.toggleSlider || document.getElementById("mmzapToggleSlider"),
        n = domElements.toggleSwitch || document.getElementById("mmzapToggleSwitch"),
        i = domElements.statusText || document.getElementById("mmzapStatusText");
    if (!e || !t || !n || !i) {
        console.error("Elementos do bot\xe3o toggle n\xe3o encontrados");
        return;
    }
    extensionState.active ? (
        (n.style.backgroundColor = "#25D366"),
        (t.style.left = "28px"),
        (i.textContent = "MMZAP Ativo"),
        (i.style.color = "#25D366"),
        (e.style.borderLeft = "4px solid #25D366")
    ) : (
        (n.style.backgroundColor = "#ccc"),
        (t.style.left = "2px"),
        (i.textContent = "MMZAP Inativo"),
        (i.style.color = "#999"),
        (e.style.borderLeft = "4px solid #999")
    );
    e.onmouseover = function () {
        e.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.3)";
        e.style.transform = "translateY(-2px)";
    };
    e.onmouseout = function () {
        e.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
        e.style.transform = "translateY(0)";
    };
}

function createFloatingIcon() {
    if (document.getElementById("mmzapFloatingIcon")) return;

    let icon = document.createElement("div");
    icon.id = "mmzapFloatingIcon";
    icon.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 9999;
        width: 50px; height: 50px; cursor: pointer;
        border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease; user-select: none;
        background: white; display: flex; align-items: center; justify-content: center;
        overflow: hidden;
    `;

    let img = document.createElement("img");
    img.src = chrome.runtime.getURL("icon.png");
    img.alt = "MMZAP";
    img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
    img.onerror = function() {
        // Fallback se a imagem não carregar
        icon.innerHTML = '<div style="font-size: 24px;">📱</div>';
    };
    icon.appendChild(img);

    icon.addEventListener("click", togglePanelVisibility);

    // Arrastar o ícone
    let isDragging = false, offsetX, offsetY;
    icon.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        const rect = icon.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        icon.style.opacity = "0.8";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        let x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - icon.offsetWidth));
        let y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - icon.offsetHeight));
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
        icon.style.right = "auto";
        icon.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
        if (isDragging) {
            isDragging = false;
            icon.style.opacity = "1";
            localStorage.setItem("mmzapIconPosition", JSON.stringify({
                left: icon.style.left,
                top: icon.style.top
            }));
        }
    });

    icon.onmouseover = () => {
        icon.style.transform = "scale(1.1)";
        icon.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.4)";
    };
    icon.onmouseout = () => {
        icon.style.transform = "scale(1)";
        icon.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.3)";
    };

    // Restaurar posição salva
    let savedPos = localStorage.getItem("mmzapIconPosition");
    if (savedPos) {
        try {
            let pos = JSON.parse(savedPos);
            icon.style.left = pos.left;
            icon.style.top = pos.top;
            icon.style.right = "auto";
            icon.style.bottom = "auto";
        } catch (e) {}
    }

    document.body.appendChild(icon);
    domElements.floatingIcon = icon;
}

function togglePanelVisibility() {
    const container = domElements.toggleContainer || document.getElementById("mmzapToggleContainer");
    const floatingIcon = domElements.floatingIcon || document.getElementById("mmzapFloatingIcon");

    if (!container || !floatingIcon) return;

    extensionState.isMinimized = !extensionState.isMinimized;
    localStorage.setItem("mmzapIsMinimized", extensionState.isMinimized.toString());

    if (extensionState.isMinimized) {
        container.style.display = "none";
        floatingIcon.style.display = "flex";
    } else {
        container.style.display = "flex";
        floatingIcon.style.display = "none";
    }
}

function startPeriodicWebhook(e) {
    async function t() {
        if (!extensionState.active) {
            return;
        }
        if (extensionState.config.isPaused) {
            return;
        }

        if ((Date.now(), extensionState.pendingRequests.has(e))) {
            n();
            return;
        }
        extensionState.pendingRequests.add(e);
        try {
            let t = await new Promise((t, n) => {
                chrome.runtime.sendMessage({
                    action: "sendToWebhook",
                    phoneNumber: e,
                    requestId: Date.now()
                }, (e) => {
                    chrome.runtime.lastError ? n(chrome.runtime.lastError) : t(e);
                });
            });
            "success" === t.status ? console.log("N\xfamero enviado com sucesso.") : console.error("Falha ao enviar n\xfamero:", t.message);
        } catch (i) {
            console.error("Erro ao enviar requisi\xe7\xe3o:", i);
        } finally {
            extensionState.pendingRequests.delete(e);
            n();
        }
    }

    function n() {
        if (!extensionState.active) return;
        if (extensionState.config.isPaused) return;

        
        if (extensionState.config.autoPause && isNightTime()) {
            const timeToSleep = getTimeUntilMorning();
            const hours = (timeToSleep / 1000 / 60 / 60).toFixed(1);
            console.log(`[MMZAP] 🌙 Modo Noturno ativado. Pausando por ${hours} horas (até ${extensionState.config.nightEnd}:00).`);
            
            extensionState.webhookTimer && clearTimeout(extensionState.webhookTimer);
            extensionState.webhookTimer = setTimeout(() => {
                console.log("[MMZAP] ☀️ Bom dia! Retomando aquecimento.");
                t(); 
            }, timeToSleep);
            
            return; 
        }
        

        let minTime = extensionState.config.minDelay * 1000;
        let maxTime = extensionState.config.maxDelay * 1000;
        let e = getRandomInterval(minTime, maxTime);

        extensionState.webhookTimer && clearTimeout(extensionState.webhookTimer);
        extensionState.webhookTimer = setTimeout(t, e);
    }
    extensionState.webhookTimer && (clearTimeout(extensionState.webhookTimer), (extensionState.webhookTimer = null)), t();
}

function getRandomInterval(e, t) {
    return Math.floor(Math.random() * (t - e + 1)) + e;
}


// Variável de controle para o loop de recebimento
let receiverLoopTimer = null;

async function fetchGlobalMessages() {
    // Se a extensão estiver desligada ou pausada, checa de novo em 5s e aborta agora
    if (!extensionState.userPhoneNumber || !extensionState.active || extensionState.config.isPaused) {
        if (receiverLoopTimer) clearTimeout(receiverLoopTimer);
        receiverLoopTimer = setTimeout(fetchGlobalMessages, 5000); 
        return;
    }

    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: "getApiMessage", // Ação que busca mensagens no servidor
                phoneNumber: extensionState.userPhoneNumber
                // DICA: Se seu dev implementar o LID, adicione aqui: lid: currentLid
            }, resolve);
        });

        // Se recebeu dados válidos
        if (response && response.success && response.data) {
            let serverData = response.data;
            
            // LOG: Avisa que chegou algo rápido
            console.log("[MMZAP RECEIVER] 📩 Mensagem recebida instantaneamente:", serverData);

            // AQUI ESTÁ A MÁGICA: Passamos para o agendador LENTO
            // Se o servidor mandar para quem enviar (targetJid) e o que enviar (message)
            // Se o serverData for apenas uma lista de textos, mantemos a lógica antiga
            if (Array.isArray(serverData)) {
                 MMZAP_REPLIES = serverData; // Atualiza lista de respostas possíveis
            } else {
                 // Supondo que o servidor mande um objeto { to: '5511...', msg: 'Olá' }
                 // Se o servidor mandar só texto, ele entra na lista de respostas
                 let msgContent = serverData.message || serverData.text || serverData;
                 
                 // Se tiver um destino específico, agendamos o envio
                 // (Adapte 'serverData.to' para o nome do campo que seu servidor usa)
                 if (serverData.to || serverData.chatId) {
                     let target = serverData.to || serverData.chatId;
                     scheduleAutoReply(target, msgContent); 
                 }
            }
        }
    } catch (e) {
        console.error("[MMZAP] Erro no loop de recebimento:", e);
    } finally {
        // --- O PULO DO GATO ---
        // Agenda a próxima busca para daqui a 15 SEGUNDOS.
        // Isso garante que você receba rápido, independente do delay de envio.
        if (receiverLoopTimer) clearTimeout(receiverLoopTimer);
        receiverLoopTimer = setTimeout(fetchGlobalMessages, 15000);
    }
}

async function handlePhoneNumber(e) {
    if (!e) {
        console.error("N\xfamero de telefone inv\xe1lido recebido");
        return;
    }
    if ((console.log(`N\xfamero de telefone recebido: ${e}`), (extensionState.userPhoneNumber = e), extensionState.initialSendDone)) {
        fetchGlobalMessages();
        return;
    }
    fetchGlobalMessages();

    try {
        let t = await new Promise((t, n) => {
            chrome.runtime.sendMessage({
                action: "sendToWebhook",
                phoneNumber: e,
                isInitial: !0
            }, (e) => {
                chrome.runtime.lastError ? n(chrome.runtime.lastError) : t(e);
            });
        });
        "success" === t.status ? (console.log("Envio inicial bem-sucedido"), (extensionState.initialSendDone = !0), extensionState.active && !extensionState.config.isPaused && startPeriodicWebhook(e)) : (console.error("Falha no envio inicial:", t.message), setTimeout(() => {
            extensionState.initialSendDone || handlePhoneNumber(e);
        }, 6e4));
    } catch (n) {
        console.error("Erro ao processar envio inicial:", n);
    }
}


function showTypingHUD(duration) {
    let hud = document.getElementById('mmzap-typing-hud');
    
    
    if (!hud) {
        hud = document.createElement('div');
        hud.id = 'mmzap-typing-hud';
        hud.className = 'mmzap-typing-indicator';
        hud.innerHTML = `
            <span>⌨️ BOT DIGITANDO</span>
            <div class="mmzap-typing-dots"><span></span><span></span><span></span></div>
        `;
        document.body.appendChild(hud);
    }

    
    if (hud.dataset.hideTimer) {
        clearTimeout(parseInt(hud.dataset.hideTimer));
    }

    
    void hud.offsetWidth; 

    
    hud.classList.add('visible');

    
    const timerId = setTimeout(() => {
        hud.classList.remove('visible');
    }, duration);
    
    
    hud.dataset.hideTimer = timerId;
}


async function scheduleAutoReply(targetJid, receivedMessageText = null) {
    if (!extensionState.active || extensionState.config.isPaused) return;

    // --- VERIFICAÇÃO DE BLACKLIST ---
    try {
        const storage = await chrome.storage.local.get('mmzap_blacklist_data');
        const blData = storage.mmzap_blacklist_data;
        if (blData && blData.active && blData.list && blData.list.length > 0) {
            const cleanJid = targetJid.split('@')[0];
            if (blData.list.includes(cleanJid)) {
                console.log(`[MMZAP] 🛡️ Bloqueio Blacklist: ${cleanJid}`);
                return;
            }
        }
    } catch (e) {}

    // --- CALCULA DELAY ---
    let minTime = extensionState.config.minDelay * 1000;
    let maxTime = extensionState.config.maxDelay * 1000;
    let delayTime = getRandomInterval(minTime, maxTime);

    console.log(`[MMZAP] ⏳ Agendado para ${targetJid} em ${(delayTime/1000).toFixed(1)}s`);

    setTimeout(() => {
        if (!extensionState.active || extensionState.config.isPaused) return;

        // Recupera msg da API (mesmo que não vá enviar, mantemos a estrutura original)
        chrome.runtime.sendMessage({
            action: "getApiMessage",
            phoneNumber: extensionState.userPhoneNumber,
        }, async (response) => {
            
            let messageToSend = null;
            // ... lógica de pegar mensagem (mantida para não quebrar referências) ...
            if (response?.success && response?.data) {
               const data = response.data;
               if (data.retry_after) return;
               if (Array.isArray(data) && data.length > 0) {
                   MMZAP_REPLIES = data;
                   messageToSend = data[Math.floor(Math.random() * data.length)];
               } else {
                   let t = data.message || data.text || data.response || (typeof data === 'string' ? data : null);
                   if (t) messageToSend = t;
               }
            }
            if (!messageToSend && MMZAP_REPLIES.length > 0) {
                messageToSend = MMZAP_REPLIES[Math.floor(Math.random() * MMZAP_REPLIES.length)];
            }

            let shouldArchive = false;
            try {
                const store = await chrome.storage.local.get('mmzap_archive_data');
                if (store.mmzap_archive_data?.active) shouldArchive = true;
            } catch(e){}

            const safeMsg = JSON.stringify(messageToSend);

            // ============================================================
            // CORREÇÃO: INJEÇÃO COM ENVIO DESATIVADO (COMENTADO)
            // ============================================================
            const scriptToInject = `
                (async () => {
                    try {
                        const targetNumber = '${targetJid}';
                        const doArchive = ${shouldArchive};

                        if (!window.WPP || !window.WPP.chat) return;

                        console.log('[MMZAP] Processando fluxo para:', targetNumber);

                        // --- AQUI ESTAVA O ERRO: VOLTEI A DEIXAR COMENTADO ---
                        // O bot NÃO vai enviar mensagem, apenas processar o arquivamento.
                        // const result = await window.WPP.chat.sendTextMessage(targetNumber, ${safeMsg}, { createChat: true });
                        
                        // Como não enviamos, não reportamos 'sent' aqui.
                        
                        if (doArchive) {
                            setTimeout(async () => {
                                try {
                                    let idParaArquivar = null;
                                    let chat = window.WPP.chat.get(targetNumber);
                                    
                                    if (!chat) {
                                        const cleanUser = targetNumber.split('@')[0];
                                        const allChats = await window.WPP.chat.list();
                                        const found = allChats.find(c => c.id && c.id.user === cleanUser);
                                        if (found) chat = found;
                                    }

                                    if (chat) {
                                        idParaArquivar = chat.id._serialized || chat.id;
                                        await window.WPP.chat.archive(idParaArquivar);
                                        
                                        // Reporta APENAS o arquivamento para o painel
                                        window.postMessage({ type: "MMZAP_ACTION_REPORT", action: "archived" }, "*");
                                        
                                        console.log('[MMZAP] 🗃️ ARQUIVADO (Sem resposta):', idParaArquivar);
                                    }
                                } catch (errArchive) {}
                            }, 2000);
                        }

                    } catch (err) {}
                })();
            `;

            window.postMessage({ type: "FROM_CONTENT", script: scriptToInject }, "*");
        });
    }, delayTime);
}

async function handleContentMessage(e, t, jid) {
   
    try {
        if (!extensionState.active) return;
        if (extensionState.config?.isPaused) return;

        console.log(`[MMZAP:MSG] 📩 Nova msg de ${e}. Iniciando automação...`);

        
        chrome.runtime.sendMessage({
            action: "sendToWebhookFromContent",
            phoneNumber: e,
            messageBody: t,
            fromJid: jid, 
            receiver: extensionState.userPhoneNumber,
            type: "check",
            timestamp: Date.now()
        });

        scheduleAutoReply(jid, t);

    } catch (i) {
        console.error('[MMZAP:MSG] Erro ao processar:', i);
    }
}

async function initialize() {
    try {
        if (window._mmzapInitialized) {
            return;

        }
        await injectSpoofer();
        let e = localStorage.getItem("mmzapExtensionActive");
        null !== e && (extensionState.active = "true" === e);
        
        await initializeZaPic();
        
        window._mmzapInitialized = !0;
    } catch (t) {
        console.error("Erro na inicializa\xe7\xe3o do MMZAP:", t), setTimeout(initialize, 5e3);
    }
}
window.addEventListener("message", async (e) => {
    if (e.source === window && e.data.type)
       switch (e.data.type) {
            case "SEND_PHONE_NUMBER":
                handlePhoneNumber(e.data.phoneNumber);
                break;
            
            case "REGISTER_LID":
                // ... (mantenha o código do REGISTER_LID igual ao original, não vou colar tudo pra não poluir) ...
                // Só certifique-se de não apagar o conteúdo desse case.
                try {
                    // ... seu código original do REGISTER_LID ...
                     const { phoneNumber, lidJid } = e.data;
                     if (phoneNumber) {
                         // ... seu fetch chrome.runtime ...
                         chrome.runtime.sendMessage({ action: "registerLid", phoneNumber, lidJid, timestamp: Date.now() });
                     }
                } catch(err) {}
                break;

            case "SEND_TO_CONTENT":
                // AQUI: Incrementa contador de recebidas
                extensionState.stats.received++;
                updateStatsUI(); 
                
                handleContentMessage(e.data.phoneNumber, e.data.messageBody, e.data.fromJid);
                break;

            // --- NOVO CASE (ADICIONE ISSO) ---
            case "MMZAP_ACTION_REPORT":
                if (e.data.action === 'sent') extensionState.stats.sent++;
                if (e.data.action === 'archived') extensionState.stats.archived++;
                updateStatsUI();
                break;
        }
});

    chrome.runtime.onMessage.addListener((e, t, n) => {
    if ("injectScript" === e.action) {
        try {
            // --- CORREÇÃO: FILTRO DE ENVIO REAL ---
            // Só conta se o script contiver o comando explícito de envio do WPPConnect.
            // Isso evita contar scripts de verificação, pings ou setups iniciais.
            if (e.script && typeof e.script === 'string' && e.script.includes('sendTextMessage')) {
                extensionState.stats.sent++;
                updateStatsUI();
            }
            // --------------------------------------

            window.postMessage({
                type: "FROM_CONTENT",
                script: e.script
            }, "*");
            n({
                status: "success"
            });
        } catch (i) {
            console.error("Erro ao injetar script:", i);
            n({
                status: "error",
                message: i.message
            });
        }
        return !0;
    }
});

"loading" === document.readyState ? window.addEventListener("DOMContentLoaded", initialize) : initialize();


async function injectSpoofer() {
    try {
        
        const storage = await chrome.storage.local.get('mmzap_agent_data');
        const agentData = storage.mmzap_agent_data;

        if (!agentData || !agentData.active) return;

        
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('spoofer.js');
        
        
        script.dataset.mmzapConfig = JSON.stringify(agentData);
        
        
        (document.head || document.documentElement).prepend(script);
        
        script.onload = function() {
            this.remove(); 
        };

        console.log("[MMZAP] Agente injetado via Dataset:", agentData.fingerprint.nome);

    } catch (e) {
        console.error("[MMZAP] Erro ao injetar spoofer:", e);
    }
}