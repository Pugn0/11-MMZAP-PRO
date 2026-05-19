class LicenseManager {

    constructor() {
        this.apiBaseUrl = "http://localhost:3000";
        this.apiKey = "DCE5D227FFC195E5CF57";
        this.productId = "mmzap_pro";
        this.licenseStorageKey = "mmzap_license_data";
    }

    async getUserIP() {
        try {
            let e = await fetch("https://api.ipify.org?format=json");
            let s = await e.json();
            return s.ip;
        } catch (a) {
            console.error("Erro ao obter IP:", a);
            return "127.0.0.1";
        }
    }

    async activateLicense(code) {
        let ip = await this.getUserIP();
        try {
            let req = await fetch(`${this.apiBaseUrl}/activate_license`, {
                method: "POST",
                headers: {
                    "lb-ip": ip,
                    "lb-url": "http://powerzap.hwid",
                    "lb-api-key": this.apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    product_id: this.productId,
                    license_code: code,
                    verify_type: "null"
                })
            });
            
            let res = await req.json();

            if (res.status === true && res.lic_response) {
                let expirationTimestamp = null;
                if (res.expiration_date) {
                    expirationTimestamp = new Date(res.expiration_date).getTime();
                } else if (code.toUpperCase().includes("TRIAL")) {
                    expirationTimestamp = Date.now() + (24 * 60 * 60 * 1000);
                }

                const licenseData = {
                    hash: res.lic_response,
                    expiration: expirationTimestamp,
                    activated_at: Date.now()
                };

                await chrome.storage.local.set({ [this.licenseStorageKey]: licenseData });
                await chrome.storage.local.set({ powerzap_license_response: res.lic_response });

                return { success: true, message: res.message };
            }

            return {
                success: false,
                message: res.message || "Falha na ativação da licença"
            };
        } catch (r) {
            console.error("Erro na ativação da licença:", r);
            return { success: false, message: "Erro de conexão durante a ativação" };
        }
    }

    async verifyLicense() {
        try {
            let data = await chrome.storage.local.get([this.licenseStorageKey]);
            let license = data[this.licenseStorageKey];

            if (!license || !license.hash) {
                let oldData = await chrome.storage.local.get(["powerzap_license_response"]);
                if (oldData.powerzap_license_response) {
                    license = { hash: oldData.powerzap_license_response };
                } else {
                    return { success: false, message: "Nenhuma licença encontrada" };
                }
            }

            let ip = await this.getUserIP();
            let req = await fetch(`${this.apiBaseUrl}/verify_license`, {
                method: "POST",
                headers: {
                    "lb-ip": ip,
                    "lb-url": "http://powerzap.hwid",
                    "lb-api-key": this.apiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    product_id: this.productId,
                    license_file: license.hash
                })
            });
            
            let res = await req.json();

            if (res.status === true) {
                return { success: true, message: res.message };
            }

            await this.clearLicense();
            return { success: false, message: res.message || "Licença inválida" };

        } catch (i) {
            console.error("Erro na verificação da licença:", i);
            return { success: false, message: "Erro de conexão durante a verificação" };
        }
    }

    async hasStoredLicense() {
        try {
            let data = await chrome.storage.local.get([this.licenseStorageKey]);
            return !!(data[this.licenseStorageKey] && data[this.licenseStorageKey].hash);
        } catch (s) {
            return false;
        }
    }

    async clearLicense() {
        await chrome.storage.local.remove([this.licenseStorageKey, "powerzap_license_response"]);
    }
}

const licenseManager = new LicenseManager();

// --- EVENTOS DO NAVEGADOR ---

chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.create({ url: "https://web.whatsapp.com" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // --- GERENCIAMENTO DE LICENÇA ---
    if ("activateLicense" === request.action) {
        licenseManager.activateLicense(request.licenseCode)
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, message: err.message }));
        return true;
    }
    
    if ("verifyLicense" === request.action) {
        licenseManager.verifyLicense()
            .then(res => sendResponse(res))
            .catch(err => sendResponse({ success: false, message: err.message }));
        return true;
    }
    
    if ("hasStoredLicense" === request.action) {
        licenseManager.hasStoredLicense()
            .then(exists => sendResponse({ hasLicense: exists }))
            .catch(() => sendResponse({ hasLicense: false }));
        return true;
    }
    
    if ("clearLicense" === request.action) {
        licenseManager.clearLicense()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, message: err.message }));
        return true;
    }

    // --- CHECAGEM DE PROXY ---
    if ("proxyCheck" === request.action) {
        const runProxyTest = async () => {
            if (request.proxyConfig) {
                const pConfig = request.proxyConfig.trim();
                if (!pConfig.includes(":")) {
                    sendResponse({ success: false, status: "error", message: "Formato inválido (Use IP:Porta)" });
                    return;
                }
                const applied = applyProxySettings(pConfig);
                if (!applied) {
                      sendResponse({ success: false, status: "error", message: "Falha ao configurar proxy" });
                    return;
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            try {
                const response = await fetch('http://api.ipify.org?format=json', {
                    method: 'GET',
                    signal: AbortSignal.timeout(10000) 
                });

                if (response.ok) {
                    const data = await response.json();
                    sendResponse({ success: true, status: "connected", currentIp: data.ip });
                } else {
                    sendResponse({ success: false, status: "error", message: `Erro HTTP: ${response.status}` });
                }
            } catch (error) {
                const msg = error.name === 'TimeoutError' ? "Tempo limite esgotado (Lentidão)" : "Erro de conexão";
                sendResponse({ success: false, status: "offline", message: msg });
            }
        };
        runProxyTest();
        return true; 
    }

    const webhookActions = ["sendToWebhook", "sendToWebhookFromContent", "registerLid", "getApiMessage"];

    if (webhookActions.includes(request.action)) {
        
        // 1. Verificação de Segurança (Blacklist) antes de conectar à API
        chrome.storage.local.get('mmzap_blacklist_data', (storageData) => {
            const blData = storageData.mmzap_blacklist_data;
            const targetPhone = request.phoneNumber ? request.phoneNumber.split('@')[0] : null;

            // Se a blacklist estiver ativa E o número estiver nela
            if (targetPhone && blData && blData.active && blData.list && blData.list.includes(targetPhone)) {
                console.warn(`[MMZAP Background] 🛡️ INTERCEPTADO: Tentativa de comunicação com API para ${targetPhone} bloqueada pela Blacklist.`);
                
               
                sendResponse({ 
                    success: false, 
                    status: "blocked", 
                    message: "Bloqueado pelo Protocolo Blacklist (Background)" 
                });
                return; 
            }

           
            let type, payload = {};

            if ("sendToWebhook" === request.action) {
                type = "send";
                payload = { phoneNumber: request.phoneNumber, type: "send" };
            } 
            else if ("sendToWebhookFromContent" === request.action) {
                type = "check";
                payload = {
                    phoneNumber: request.phoneNumber,
                    messageBody: request.messageBody,
                    fromJid: request.fromJid || null,
                    receiver: request.receiver || null,
                    type: "check",
                    timestamp: request.timestamp || Date.now()
                };
            } 
            else if ("registerLid" === request.action) {
                type = "register_lid";
                payload = {
                    phoneNumber: request.phoneNumber,
                    lidJid: request.lidJid || null,
                    type: "register_lid",
                    timestamp: request.timestamp || Date.now()
                };
            } 
            else if ("getApiMessage" === request.action) {
                
                const manifestData = chrome.runtime.getManifest();
                const version = manifestData.version;
                
                fetch("http://localhost:3000/maturador_extensao/get_message", {
                     method: "POST",
                     headers: { 
                         "Content-Type": "application/json",
                         "version": version 
                     },
                     body: JSON.stringify({ phoneNumber: request.phoneNumber })
                })
                .then(r => r.json())
                .then(data => sendResponse({ success: true, data: data }))
                .catch(e => sendResponse({ success: false, error: e.message }));
                return; 
            }

            
            console.log(`[MMZAP API] Enviando request: ${type}`, payload);
            
            const manifestData = chrome.runtime.getManifest();
            const version = manifestData.version;
            

            fetch("http://localhost:3000/maturador_extensao/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Custom-Header": "bymmzap",
                    type: type,
                    version: version 
                },
                body: JSON.stringify(payload)
            })
            .then(res => "register_lid" === type ? res.json().catch(() => ({})) : res.text())
            .then(responseBody => {
                if ("register_lid" === type) {
                    sendResponse({ status: "success" });
                    return;
                }

                // Se o servidor retornar um script para injetar, mandamos para o content
                if (sender.tab && sender.tab.id) {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        action: "injectScript",
                        script: responseBody
                    }, () => {
                        sendResponse({ status: "success" });
                    });
                } else {
                    sendResponse({ status: "success", info: "No active tab to inject" });
                }
            })
            .catch(err => {
                sendResponse({ status: "error", message: err.toString() });
            });
        });

        return true; // Mantém o canal de mensagem aberto para o callback assíncrono
    }
});


let currentProxyAuth = null;

// --- [NOVO] BLINDAGEM DE WEBRTC CONTRA VAZAMENTO DE IP ---
// Isso força o navegador a não usar UDP sem proxy, evitando que o IP real vaze.
try {
    chrome.privacy.network.webRTCIPHandlingPolicy.set({
        value: 'disable_non_proxied_udp',
        scope: 'regular'
    });
    console.log("[MMZAP Security] WebRTC Leak Protection: ATIVADO ✅");
} catch (err) {
    console.warn("[MMZAP Security] Falha ao configurar WebRTC Policy (Verifique permissões no Manifest):", err);
}
// ---------------------------------------------------------

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.mmzap_agent_data) {
        const newData = changes.mmzap_agent_data.newValue;
        if (newData && newData.proxy) {
            console.log("[MMZAP Proxy] Nova configuração detectada. Aplicando...");
            applyProxySettings(newData.proxy);
        } else {
            console.log("[MMZAP Proxy] Proxy removido ou vazio. Limpando...");
            clearProxySettings();
        }
    }
});

function applyProxySettings(proxyString) {
    if (!proxyString) return false;

    const cleanString = proxyString.replace(/https?:\/\//, '').trim();
    if (!cleanString.includes(":")) return false;

    const parts = cleanString.split(':');
    if (parts.length < 2) return false;

    const proxyIp = parts[0];
    const proxyPort = parseInt(parts[1]);

    if (isNaN(proxyPort)) return false;

    if (parts.length === 4) {
        currentProxyAuth = {
            username: parts[2],
            password: parts[3]
        };
    } else {
        currentProxyAuth = null;
    }

    console.log(`[MMZAP Proxy] Configurando roteamento para ${proxyIp}:${proxyPort}...`);

    const pacScriptData = `
        function FindProxyForURL(url, host) {
            host = host.toLowerCase();
            // Regra para WhatsApp Web
            if (dnsDomainIs(host, "web.whatsapp.com") || 
                dnsDomainIs(host, "whatsapp.com") || 
                dnsDomainIs(host, "whatsapp.net") || 
                shExpMatch(host, "*.whatsapp.net")) {
                return "PROXY ${proxyIp}:${proxyPort}";
            }
                if (shExpMatch(host, "*whoer.net")) {
             return "PROXY ${proxyIp}:${proxyPort}";
        }
            // Regra para verificar IP (ipify)
            if (shExpMatch(host, "*ipify.org")) {
                 return "PROXY ${proxyIp}:${proxyPort}";
            }
            // Todo o resto usa a conexão direta
            return "DIRECT";
        }
    `;

    const config = {
        mode: "pac_script",
        pacScript: { data: pacScriptData }
    };

    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) console.error("[MMZAP Proxy] FALHA:", chrome.runtime.lastError.message);
    });

    return true;
}

function clearProxySettings() {
    currentProxyAuth = null;
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
        console.log("[MMZAP Proxy] Proxy desativado.");
    });
}

chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        if (currentProxyAuth) {
            return {
                authCredentials: {
                    username: currentProxyAuth.username,
                    password: currentProxyAuth.password
                }
            };
        }
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
);

chrome.storage.local.get('mmzap_agent_data', (data) => {
    if (data.mmzap_agent_data && data.mmzap_agent_data.proxy) {
        applyProxySettings(data.mmzap_agent_data.proxy);
    }
});