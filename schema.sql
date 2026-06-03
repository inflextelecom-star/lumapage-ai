PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client',
  plan_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_token TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price REAL NOT NULL,
  pages_limit INTEGER NOT NULL DEFAULT 1,
  ai_credits INTEGER NOT NULL DEFAULT 5,
  features TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  highlighted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  starts_at INTEGER,
  expires_at INTEGER,
  payment_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  niche TEXT,
  whatsapp TEXT,
  city TEXT,
  theme TEXT DEFAULT 'premium',
  content_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  visits INTEGER NOT NULL DEFAULT 0,
  whatsapp_clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER,
  mp_payment_id TEXT,
  preference_id TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_code_base64 TEXT,
  pix_code TEXT,
  raw_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  private INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  project_id INTEGER,
  type TEXT NOT NULL,
  meta_json TEXT DEFAULT '{}',
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS security_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  details TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

INSERT OR IGNORE INTO plans (name, slug, price, pages_limit, ai_credits, features, highlighted) VALUES
('Start', 'start', 9.90, 1, 10, '["1 landing page", "Botão WhatsApp", "PIX", "Analytics básico"]', 0),
('Pro', 'pro', 19.90, 5, 50, '["5 landing pages", "IA Gemini", "PIX Mercado Pago", "Analytics", "Suporte"]', 1),
('Business', 'business', 39.90, 20, 200, '["20 páginas", "Templates premium", "Domínio próprio", "Suporte prioritário", "Relatórios"]', 0);

INSERT OR IGNORE INTO settings (key, value, private) VALUES
('brand_name', 'LumaPage AI', 0),
('support_whatsapp', '81985745430', 0),
('public_base_url', '', 0),
('maintenance_mode', 'false', 0);
