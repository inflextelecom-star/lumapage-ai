LumaPage AI — Atualização Enterprise sem recorrência

O que foi acrescentado sem remover a estrutura:
- confirmação de e-mail
- recuperação de senha por e-mail via Resend
- Turnstile/CAPTCHA opcional
- rate limit anti abuso
- logs de auditoria
- sessões registradas
- analytics de visitas/leads
- tickets de suporte
- painel admin com usuários, planos, pagamentos, logs, analytics, settings e backup JSON
- Mercado Pago PIX oficial sem assinatura recorrente
- limite de páginas por plano
- página pública /p/slug usando dados do banco

Arquivos principais:
- index.html
- _redirects
- functions/api/[[path]].js
- database/schema.sql
- database/migration_upgrade.sql

Para banco novo:
1. Cloudflare > D1 > Console
2. cole database/schema.sql inteiro
3. Execute

Para banco que você já criou manualmente:
1. Rode database/migration_upgrade.sql
2. Se aparecer erro "duplicate column", ignore essa linha e continue com as próximas partes necessárias.
3. O ideal profissional é criar um banco D1 novo e rodar schema.sql limpo para evitar coluna faltando.

Bindings obrigatórios no Cloudflare Pages:
- DB -> lumapage-db

Variables/Secrets recomendadas:
- JWT_SECRET = qualquer segredo longo, exemplo: gere uma frase grande e única
- ADMIN_PASSWORD = sua senha admin
- ADMIN_EMAIL = Varejaoeverton@gmail.com
- PUBLIC_BASE_URL = https://seu-dominio.pages.dev
- GEMINI_API_KEY = chave Gemini
- MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago
- RESEND_API_KEY = chave Resend para envio de e-mail
- EMAIL_FROM = LumaPage <seu@emailverificado.com>
- TURNSTILE_SECRET_KEY = opcional, anti-bot Cloudflare Turnstile

Não foi adicionada assinatura recorrente, conforme solicitado.
