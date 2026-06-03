LUMAPAGE AI — MASTER FINAL CONSOLIDADO

Esta versão consolida tudo que foi construído na conversa:
- Vitrine pública premium
- Botões Cliente entrar / Criar conta / Acesso interno
- Login e cadastro com senha forte
- Olhinho em todos os campos de senha
- Recuperação de senha por e-mail via Resend
- Dashboard cliente profissional
- Criação de página pública /p/slug
- Planos e PIX Mercado Pago
- Webhook Mercado Pago para liberar plano
- Painel admin enterprise
- Clientes, logs, métricas, configurações e integrações
- Backend Cloudflare Pages Functions
- Banco Cloudflare D1
- Rate limit básico e logs de segurança

ARQUIVOS QUE DEVEM IR AO GITHUB:
- index.html
- _redirects
- _headers
- functions/api/[[path]].js
- database/schema.sql
- README_MASTER_FINAL.txt

CLOUDFLARE — OBRIGATÓRIO:
1. Pages conectado ao GitHub.
2. D1 criado e vinculado no Pages como DB.
3. database/schema.sql executado no console do D1.
4. Variáveis/Secrets:
   ADMIN_PASSWORD = sua senha admin
   JWT_SECRET = texto grande aleatório
   GEMINI_API_KEY = chave Gemini
   MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago
   PUBLIC_BASE_URL = https://seudominio.pages.dev
   RESEND_API_KEY = chave Resend para e-mail de senha (opcional, mas recomendado)
   MAIL_FROM = LumaPage <noreply@seudominio.com> (opcional)

ADMIN:
E-mail fixo inicial: Varejaoeverton@gmail.com
Senha: a que você definir em ADMIN_PASSWORD no Cloudflare.
No primeiro login, o backend cria o admin automaticamente se ele ainda não existir.

TESTES OBRIGATÓRIOS ANTES DE VENDER:
- Abrir homepage.
- Criar conta cliente com senha forte.
- Fazer login cliente.
- Criar página e abrir /p/slug.
- Gerar PIX com Mercado Pago.
- Testar webhook Mercado Pago com pagamento real pequeno.
- Login admin com Varejaoeverton@gmail.com + ADMIN_PASSWORD.
- Abrir clientes e logs no admin.
- Testar esqueci senha com RESEND_API_KEY configurada.

OBSERVAÇÃO HONESTA:
O código está preparado para produção serverless. Nenhum sistema com Mercado Pago/Gemini/e-mail pode ser garantido 100% real sem inserir as chaves e testar dentro da Cloudflare. O pacote já está estruturado para isso.
