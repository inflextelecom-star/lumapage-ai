LumaPage AI - Sistema completo consolidado

Arquivos obrigatórios para subir no GitHub:
- index.html
- _redirects
- functions/api/[[path]].js
- database/schema.sql

Cloudflare:
1. Pages conectado ao GitHub.
2. D1 binding configurado com Variable name: DB.
3. Rode database/schema.sql no Console D1 se ainda não criou tabelas.
4. Configure Variables/Secrets:
   - ADMIN_PASSWORD = sua senha admin
   - JWT_SECRET = uma chave grande aleatória
   - GEMINI_API_KEY = chave Gemini
   - MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago
   - RESEND_API_KEY = opcional para envio real de e-mail
   - PUBLIC_BASE_URL = https://lumapage-ai.pages.dev

Teste:
- /api/health deve retornar JSON ok:true
- cadastro deve salvar no D1
- login deve entrar
- admin: Varejaoeverton@gmail.com + ADMIN_PASSWORD
