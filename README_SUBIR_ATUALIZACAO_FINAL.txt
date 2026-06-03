LumaPage AI — Atualização final backend + D1

SUBIR NO GITHUB:
1. Extraia este ZIP.
2. Envie TODOS os arquivos e pastas para o repositório lumapage-ai.
3. Clique em Commit changes.
4. A Cloudflare Pages atualiza sozinha.

IMPORTANTE:
- A pasta functions/api/[[path]].js precisa subir exatamente assim.
- O binding D1 precisa estar com nome DB.
- Rode database/schema.sql no D1 Console se ainda não rodou completo.

SECRETS/VARIÁVEIS NA CLOUDFLARE:
JWT_SECRET = uma senha longa aleatória
ADMIN_EMAIL = Varejaoeverton@gmail.com
ADMIN_PASSWORD = Enzo777.@ ou outra senha forte
MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago
RESEND_API_KEY = chave Resend para e-mail de redefinição
PUBLIC_BASE_URL = https://lumapage-ai.pages.dev
GEMINI_API_KEY = chave Gemini

ROTAS:
/                 site público
/#login           login cliente
/#signup          cadastro cliente
/#forgot          esqueci senha
/#admin           login admin
/p/slug           página pública do cliente
/api/...          backend Pages Functions
