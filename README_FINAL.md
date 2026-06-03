# LumaPage AI — Final Fullstack

## Como atualizar no GitHub
Extraia este ZIP e envie para o repositório:
- index.html
- _redirects
- functions/api/[[path]].js
- database/schema.sql
- README_FINAL.md

Depois clique em Commit changes. A Cloudflare Pages fará deploy automático.

## Cloudflare
Em Pages > Settings > Functions:
- Vincule o banco D1 com o nome `DB`.
- Rode o SQL de `database/schema.sql` no D1.

## Variáveis/secrets necessárias
- ADMIN_EMAIL = Varejaoeverton@gmail.com
- ADMIN_PASSWORD = Enzo777.@
- JWT_SECRET = coloque uma frase grande e secreta
- GEMINI_API_KEY = sua chave Gemini
- MERCADO_PAGO_ACCESS_TOKEN = token Mercado Pago
- RESEND_API_KEY = chave Resend para recuperação de senha por e-mail
- EMAIL_FROM = Seu Nome <email@seudominio.com>
- APP_URL = https://seu-dominio.pages.dev

## Recursos incluídos
- Login/cadastro real com D1
- Senha forte no frontend e backend
- Olhinho em senhas
- Esqueci senha com link por e-mail via Resend
- Admin enterprise
- Planos/serviços
- PIX Mercado Pago com QR Code e copia e cola
- Webhook Mercado Pago para liberar plano
- Gemini preparado
- Página pública /p/slug
- Analytics de visita e clique WhatsApp
- Logs e rate limit básico

## Observação
O sistema só fica 100% real depois de vincular DB e preencher as secrets acima.
