LumaPage AI — Versão pronta para venda (cards comerciais + SaaS real)

MANTIDO:
- Frontend premium atual
- Cloudflare Pages + Functions
- D1 com binding DB
- Login/cadastro com senha forte
- Recuperação por e-mail via Resend
- PIX Mercado Pago sem recorrência
- Webhook para liberar plano
- Gemini API para gerar conteúdo
- Admin enterprise
- Dashboard cliente
- Projetos /p/slug
- Analytics, logs, tickets, rate limit e Turnstile opcional

ACRESCENTADO:
- Cards de venda profissionais na home
- Showcases de modelos por nicho
- Área de planos mais comercial
- Dashboard cliente mais robusto com prévia visual
- Planos carregados do D1 no dashboard
- Formulário de ticket de suporte
- Admin com clientes, planos, pagamentos, segurança, logs e analytics
- Headers básicos de segurança

PARA SUBIR:
1. Extraia o ZIP.
2. Suba todos os arquivos no GitHub.
3. Commit changes.
4. Cloudflare Pages atualiza automaticamente.
5. Confirme o D1 binding com nome DB.
6. Rode database/schema.sql ou migration_upgrade.sql no D1.
7. Configure as secrets: JWT_SECRET, ADMIN_PASSWORD, GEMINI_API_KEY, MERCADO_PAGO_ACCESS_TOKEN, RESEND_API_KEY, PUBLIC_BASE_URL.
