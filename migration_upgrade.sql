-- Rode este arquivo APENAS se você já criou as tabelas manualmente antes.
-- Se for banco novo, rode somente database/schema.sql.

-- Tabelas novas
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  page_limit INTEGER DEFAULT 1,
  features TEXT,
  active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER DEFAULT (strftime('%s','now')));

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT NOT NULL,
  to_email TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_response TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  user_id INTEGER,
  event TEXT NOT NULL,
  path TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

INSERT OR IGNORE INTO plans (id,name,price,page_limit,features,active) VALUES
('starter','Starter',9.90,1,'1 página;PIX integrado;Suporte básico',1),
('pro','Pro',19.90,5,'5 páginas;IA premium;Analytics;Sem marca',1),
('business','Business',39.90,50,'50 páginas;Domínio próprio;Suporte prioritário',1);

-- ATENÇÃO: se alguma linha abaixo der erro dizendo "duplicate column", ignore essa linha e continue com as próximas.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client';
ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'starter';
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN email_verify_token TEXT;
ALTER TABLE users ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s','now'));

ALTER TABLE password_resets ADD COLUMN used INTEGER DEFAULT 0;
ALTER TABLE password_resets ADD COLUMN created_at INTEGER DEFAULT (strftime('%s','now'));

ALTER TABLE payments ADD COLUMN provider TEXT DEFAULT 'mercadopago';
ALTER TABLE payments ADD COLUMN raw_json TEXT;
ALTER TABLE payments ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s','now'));

ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN segment TEXT;
ALTER TABLE projects ADD COLUMN headline TEXT;
ALTER TABLE projects ADD COLUMN copy TEXT;
ALTER TABLE projects ADD COLUMN whats TEXT;
ALTER TABLE projects ADD COLUMN theme TEXT DEFAULT 'premium';
ALTER TABLE projects ADD COLUMN visits INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN leads INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s','now'));
