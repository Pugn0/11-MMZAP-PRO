(async () => {
    function e(e, t = 1e4) {
        let o = Date.now(),
            r = (n) => {
                if (e()) n();
                else if (Date.now() - o >= t) throw Error("Timeout waiting for condition");
                else setTimeout(() => r(n), 100);
            };
        return new Promise(r);
    }
    async function t() {
        return await e(() => "function" == typeof WPP.conn.getMyUserId), WPP.conn.getMyUserId();
    }
    function o(e, t) {
        let o = document.createElement("div");
        (o.id = "maturadorOverlay"), (o.style.position = "fixed"), (o.style.top = "0"), (o.style.left = "0"), (o.style.width = "100%"), (o.style.height = "100%"), (o.style.backgroundColor = "rgba(0, 0, 0, 0.5)"), (o.style.zIndex = "9999");
        let r = document.createElement("div");
        (r.id = "maturadorPopup"),
            (r.style.position = "fixed"),
            (r.style.top = "50%"),
            (r.style.left = "50%"),
            (r.style.transform = "translate(-50%, -50%)"),
            (r.style.backgroundColor = "#fff"),
            (r.style.color = "#000"),
            (r.style.border = "1px solid #000"),
            (r.style.padding = "20px"),
            (r.style.zIndex = "10000"),
            (r.style.width = "300px"),
            (r.style.boxShadow = "0px 0px 10px rgba(0, 0, 0, 0.5)");
        let n = document.createElement("div");
        (n.style.background = "linear-gradient(to right, #000000, #00a884)"),
            (n.style.color = "#fff"),
            (n.style.padding = "10px"),
            (n.style.fontSize = "16px"),
            (n.style.fontWeight = "bold"),
            (n.style.display = "flex"),
            (n.style.justifyContent = "space-between"),
            (n.style.alignItems = "center");
        let a = document.createTextNode(e);
        n.appendChild(a);
        let s = document.createElement("span");
        (s.innerText = "X"),
            (s.style.cursor = "pointer"),
            (s.onclick = () => {
                document.body.removeChild(o);
            }),
            n.appendChild(s);
        let d = document.createElement("div");
        (d.id = "maturadorMessage"), (d.style.padding = "10px"), (d.innerHTML = t), r.appendChild(n), r.appendChild(d), o.appendChild(r), document.body.appendChild(o);
    }
    function r(e, t) {
        let o = document.querySelector("#maturadorPopup div:first-child"),
            r = document.getElementById("maturadorMessage");
        o && r && ((o.childNodes[0].nodeValue = e), (r.innerHTML = t));
    }
    try {
        console.log("Tentando obter o n\xfamero de telefone do usu\xe1rio..."), o("Maturador Mutuo", "Conectando...");
        let n = await t();
        if ((console.log("Objeto userId:", n), n && n.user)) {
            let a = n.user;
            console.log("Meu n\xfamero de telefone:", a);

            
            r(
                "MMZap PRO ligado!",
                `A partir de agora, seu n\xfamero come\xe7ar\xe1 a interagir com outros n\xfameros que est\xe3o sincronizados com nossa extens\xe3o.<br><br>
                <strong>Importante:</strong> Voc\xea precisa manter o WhatsApp Web aberto. Mesmo em segundo plano, ele funcionar\xe1 normalmente.<br><br>
                Se a extens\xe3o for desativada, seu n\xfamero deixar\xe1 de receber mensagens dos outros usu\xe1rios.<br><br>
                Voc\xea s\xf3 recebe mensagens se manter a extens\xe3o rodando e ativada.<br><br>
                <strong>Delay:</strong> Você pode ajustar o delay das mensagens para o tempo desejado.<br><br>`
            );
            
            window.postMessage({ type: "SEND_PHONE_NUMBER", phoneNumber: a }, "*");
            // ---------------------------------------------------------

            
            let lidJid = null;
            try {
                const myDev = (typeof WPP?.conn?.getMyDeviceId === 'function') ? WPP.conn.getMyDeviceId() : null;
                console.log("Meu device id:", myDev);
                const lidEntry = (typeof WPP?.contact?.getPnLidEntry === 'function') ? await WPP.contact.getPnLidEntry(a) : null;
                
                const lidCandidates = [];
                if (typeof lidEntry === 'string') lidCandidates.push(lidEntry);
                if (lidEntry && typeof lidEntry._serialized === 'string') lidCandidates.push(lidEntry._serialized);
                if (lidEntry && lidEntry.id && typeof lidEntry.id._serialized === 'string') lidCandidates.push(lidEntry.id._serialized);
                if (lidEntry && typeof lidEntry.lid === 'string') lidCandidates.push(lidEntry.lid);
                if (lidEntry && typeof lidEntry.lid === 'object') {
                    if (typeof lidEntry.lid._serialized === 'string') lidCandidates.push(lidEntry.lid._serialized);
                    if (typeof lidEntry.lid.user === 'string') lidCandidates.push(`${lidEntry.lid.user}@lid`);
                }
                if (lidEntry && typeof lidEntry.user === 'string') lidCandidates.push(`${lidEntry.user}@lid`);
                for (let c of lidCandidates) {
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
                console.warn("Falha ao obter LID do usu\xe1rio (não crítico):", e);
            }

            // Registra o LID no backend se encontrou
            try {
                window.postMessage({ type: "REGISTER_LID", phoneNumber: a, lidJid }, "*");
            } catch (e) {}

        } else console.error('N\xe3o foi poss\xedvel obter o n\xfamero de telefone do usu\xe1rio.');
    } catch (s) {
        console.error("Erro ao obter o n\xfamero de telefone:", s);
    }
})();