(function () {
    'use strict';

    
    const currentScript = document.currentScript;
    const configRaw = currentScript ? currentScript.dataset.mmzapConfig : null;

    
    if (!configRaw) return;

    let AGENT_DATA;
    try {
        AGENT_DATA = JSON.parse(configRaw);
    } catch (e) {
        console.error("[MMZAP Spoofer] Erro crítico ao ler JSON do agente:", e);
        return;
    }
    
    
    if (!AGENT_DATA || !AGENT_DATA.active || !AGENT_DATA.fingerprint) {
        return;
    }

    const fp = AGENT_DATA.fingerprint;
    
    const spoofNavigator = (prop, value) => {
        try {
            Object.defineProperty(navigator, prop, {
                get: () => value,
                configurable: true 
            });
        } catch (e) {
            console.error(`[MMZAP] Erro ao mascarar navigator.${prop}`, e);
        }
    };

    // --- 3. APLICANDO A MÁSCARA NO NAVIGATOR ---

    if (fp.userAgent) {
        spoofNavigator('userAgent', fp.userAgent);
        
        
        const appVersion = fp.userAgent.replace('Mozilla/', '');
        spoofNavigator('appVersion', appVersion);
    }

    if (fp.plataforma) {
        spoofNavigator('platform', fp.plataforma);
    }

    if (fp.cpu) {
        spoofNavigator('hardwareConcurrency', fp.cpu);
    }

    if (fp.memoria) {
        spoofNavigator('deviceMemory', fp.memoria);
    }

    
    
    if (fp.tela) {
        try {
            const [width, height] = fp.tela.split('x').map(Number);
            if (width && height) {
                
                Object.defineProperty(window.screen, 'width', { get: () => width });
                Object.defineProperty(window.screen, 'height', { get: () => height });
                
                
                Object.defineProperty(window.screen, 'availWidth', { get: () => width });
                Object.defineProperty(window.screen, 'availHeight', { get: () => height - 40 }); 
            }
        } catch (e) {
            console.error("[MMZAP] Erro ao mascarar tela", e);
        }
    }

    

    if (fp.gpu) {
        const getParameterProxy = (target, thisArg, args) => {
            const param = args[0];
            
            
            
            if (param === 37445) {
                return "Google Inc. (NVIDIA)"; 
            }
            if (param === 37446) {
                return fp.gpu; 
            }

           
            return Reflect.apply(target, thisArg, args);
        };

        
        const hookWebGL = (contextName) => {
            try {
               
                const proto = window[contextName] ? window[contextName].prototype : null;
                
                if (proto) {
                    const originalGetParameter = proto.getParameter;
                    
                   
                    proto.getParameter = new Proxy(originalGetParameter, {
                        apply: getParameterProxy
                    });
                }
            } catch (e) { 
                
            }
        };

        
        hookWebGL('WebGLRenderingContext');
        hookWebGL('WebGL2RenderingContext');
    }

})();