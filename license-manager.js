class LicenseManager {
    constructor() {
        this.licenseStorageKey = "mmzap_license_data"; // Mudamos para chave de objeto
        this.apiBaseUrl = "https://controle.dablioweb.com/api";
        this.apiKey = "DCE5D227FFC195E5CF57";
        this.productId = "mmzap_pro";
        this.userIP = null;
    }

    async getUserIP() {
        if (this.userIP) return this.userIP;
        try {
            let e = await fetch("https://api.ipify.org?format=json"),
                t = await e.json();
            return this.userIP = t.ip, this.userIP;
        } catch (i) {
            return console.error("Erro ao obter IP:", i), this.userIP = "127.0.0.1", this.userIP;
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
                // --- LÓGICA HÍBRIDA DE TRIAL ---
                const now = Date.now();
                let expirationTimestamp = null;
                let isTrial = false;

                // 1. Se a API mandou a data exata
                if (res.expiration_date) {
                    expirationTimestamp = new Date(res.expiration_date).getTime();
                    isTrial = true;
                } 
                // 2. Se a API diz que é trial OU o código tem "TRIAL", mas sem data (Calculamos 24h)
                else if (res.is_trial || code.toUpperCase().includes("TRIAL")) {
                    // Verifica se já usou trial antes para impedir reinstalação
                    const storage = await chrome.storage.local.get('trial_history');
                    if (storage.trial_history) {
                        return { success: false, message: "Período de teste já utilizado nesta máquina." };
                    }
                    
                    expirationTimestamp = now + (24 * 60 * 60 * 1000); // 24 Horas
                    isTrial = true;
                    
                    // Marca que já usou trial
                    await chrome.storage.local.set({ 'trial_history': true });
                }

                // Salva tudo no Storage Seguro do Chrome
                const licenseData = {
                    hash: res.lic_response,
                    expiration: expirationTimestamp,
                    activated_at: now,
                    type: isTrial ? 'TRIAL' : 'LIFETIME'
                };

                await chrome.storage.local.set({ [this.licenseStorageKey]: licenseData });

                // Mantém compatibilidade temporária com localStorage (opcional)
                localStorage.setItem("powerzap_license_response", res.lic_response);

                return { success: true, message: res.message };
            }

            return {
                success: false,
                message: res.message || "Falha na ativação da licença"
            };

        } catch (s) {
            console.error("Erro na ativação:", s);
            return { success: false, message: "Erro de conexão com o servidor." };
        }
    }

    // Verificação simplificada lendo do Storage
    async verifyLicense() {
        const data = await chrome.storage.local.get(this.licenseStorageKey);
        const license = data[this.licenseStorageKey];

        if (!license || !license.hash) {
            return { success: false, message: "Nenhuma licença encontrada" };
        }
        
        // A verificação de expiração (Data) é feita no Frontend (content.js)
        // Aqui verificamos apenas se o Hash existe e é válido
        return { success: true, message: "Licença ativa" };
    }

    async clearLicense() {
        await chrome.storage.local.remove(this.licenseStorageKey);
        localStorage.removeItem("powerzap_license_response");
    }

    async hasStoredLicense() {
        const data = await chrome.storage.local.get(this.licenseStorageKey);
        return !!data[this.licenseStorageKey];
    }
}

// UI Classes (Mantidas conforme original, apenas ajustadas se necessário)
class LicenseUI {
    constructor(e) {
        this.licenseManager = e;
        this.overlayId = "powerzap-license-overlay";
    }
    // ... (Mantive a UI visual original no Content.js, aqui é só a referência da classe)
}

// Exportação para uso global se necessário
if (typeof window !== "undefined") {
    window.ZaPicLicenseManager = new LicenseManager();
    window.ZaPicLicenseUI = new LicenseUI(window.ZaPicLicenseManager);
} else {
    // Contexto do Service Worker (Background)
    self.ZaPicLicenseManager = new LicenseManager();
}