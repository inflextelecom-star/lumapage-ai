LUMAPAGE AI - VERSÃO CORRIGIDA PARA O UPLOAD QUE APARECE NO SEU PRINT

Essa versão é diferente: ela tem APENAS UM ARQUIVO worker.js + este README.
Não tem functions/, não tem _routes.json, não tem wrangler.toml.
Assim ela é compatível com a tela de upload de Worker que mostra "Worker name".

COMO SUBIR:
1. Entre na Cloudflare.
2. Workers & Pages.
3. Create Worker / Upload Worker.
4. Envie SOMENTE o arquivo worker.js.
5. Depois do deploy, vá nas configurações do Worker.
6. Vincule um banco D1 com binding exatamente: DB.
7. Adicione as variáveis/secrets:
   ADMIN_EMAIL = Varejaoeverton@gmail.com
   ADMIN_PASSWORD = sua senha admin
   GEMINI_API_KEY = sua chave Gemini
   MERCADO_PAGO_ACCESS_TOKEN = seu token Mercado Pago
   SUPPORT_WHATSAPP = 81985745430

ROTAS:
/              = site público
/dashboard     = painel do cliente
/admin         = painel admin
/p/slug        = página publicada
/api/...       = backend

IMPORTANTE:
- Sem vincular D1 como DB, o sistema abre, mas login/cadastro não salvam.
- Mercado Pago e Gemini só funcionam quando as chaves forem inseridas nas secrets.
