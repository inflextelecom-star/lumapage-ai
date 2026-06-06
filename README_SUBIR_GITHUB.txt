LumaPage AI - Estrutura correta para Cloudflare Pages

ARQUIVOS QUE DEVEM FICAR NA RAIZ DO GITHUB:
- index.html
- _worker.js
- _redirects
- _headers
- database/schema.sql

IMPORTANTE:
- NÃO use worker.js. O arquivo correto é _worker.js.
- NÃO deixe [[path]].js solto na raiz.
- Para testar API: https://lumapage-ai.pages.dev/api/health

Cloudflare:
1. D1 binding em Production: DB -> lumapage-db
2. Variables/Secrets:
   ADMIN_PASSWORD = sua senha admin
   JWT_SECRET = qualquer texto grande e secreto
   PUBLIC_BASE_URL = https://lumapage-ai.pages.dev
   GEMINI_API_KEY = sua chave Gemini (opcional)
   MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago (opcional)
   RESEND_API_KEY = chave e-mail (opcional)

Depois do commit no GitHub, aguarde deploy automático.
