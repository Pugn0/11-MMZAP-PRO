# Histórico da Conversa - Projeto MMZAP-PRO

## Data: 14 de Maio de 2026

Este documento resume o progresso da análise e discussão sobre o projeto MMZAP-PRO, focando na rede e endpoints de licença. Serve para retomar o trabalho amanhã sem perder o contexto.

## Resumo da Análise

### Estrutura do Projeto
- Extensão do Chrome/WhatsApp com arquivos como `manifest.json`, `service_worker.js`, `license-manager.js`, etc.
- Gerenciamento de licenças via API remota em `https://controle.dablioweb.com/api`.

### Rede e Endpoints Principais
1. **Ativação de Licença**: `POST /activate_license`
   - Usado para ativar uma licença com código fornecido pelo usuário.
   - Implementado em `license-manager.js` (principal) e `service_worker.js`.

2. **Verificação de Licença**: `POST /verify_license`
   - Usado para verificar periodicamente se a licença armazenada é válida.
   - Envia o hash da licença (`lic_response`) para checagem.

### Requisição para Ativação (`activate_license`)
- **Método**: POST
- **Headers**:
  - `lb-ip`: IP do usuário (obtido via `api.ipify.org`)
  - `lb-url`: `http://powerzap.hwid` (fixo)
  - `lb-api-key`: `DCE5D227FFC195E5CF57` (fixo)
  - `Content-Type`: `application/json`
- **Body (JSON)**:
  ```json
  {
    "product_id": "mmzap_pro",
    "license_code": "<código_do_usuário>",
    "verify_type": "null"
  }
  ```

### Resposta Esperada do Servidor
O servidor deve retornar JSON com:
- `status`: `true` (sucesso) ou `false` (erro)
- `lic_response`: Hash único da licença (se sucesso)
- `message`: Mensagem de sucesso/erro
- `expiration_date`: Opcional, data de expiração (ISO format)
- `is_trial`: Opcional, booleano para indicar trial

#### Exemplos de Resposta
- **Sucesso**:
  ```json
  {
    "status": true,
    "lic_response": "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
    "message": "Licença ativada com sucesso!",
    "expiration_date": "2026-05-15T00:00:00Z",
    "is_trial": false
  }
  ```
- **Erro**:
  ```json
  {
    "status": false,
    "message": "Código de licença inválido ou expirado."
  }
  ```

### Lógica de Tratamento no Código
- Se `status === true` e `lic_response` existe: Salva no Chrome Storage.
- Para trials: Calcula expiração (24h se não especificada), impede reutilização.
- Verificações periódicas usam `/verify_license` com o hash salvo.

## Próximos Passos Sugeridos
- Testar a API com os exemplos fornecidos.
- Implementar ou ajustar o servidor para retornar as respostas corretas.
- Verificar se há outros endpoints ou integrações (ex.: WhatsApp via `wppconnect-wa.js`).
- Melhorar segurança ou adicionar logs.

Este histórico pode ser expandido conforme avançamos. Retome aqui amanhã!</content>
<parameter name="filePath">README.md