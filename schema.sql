CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  whatsapp TEXT,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'client',
  plan TEXT DEFAULT 'free',
  email_verified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  token TEXT UNIQUE,
  expires_at INTEGER,
  used INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  slug TEXT UNIQUE,
  segment TEXT,
  whatsapp TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft',
  visits INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  plan TEXT,
  amount REAL,
  status TEXT DEFAULT 'pending',
  mp_payment_id TEXT,
  qr_code TEXT,
  qr_code_base64 TEXT,
  pix_code TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE,
  name TEXT,
  price REAL,
  page_limit INTEGER,
  features TEXT,
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  details TEXT,
  ip TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
INSERT OR IGNORE INTO plans (code,name,price,page_limit,features) VALUES
('start','Start',9.90,1,'1 página, PIX, WhatsApp, suporte básico'),
('pro','Pro',19.90,5,'5 páginas, analytics, IA, suporte prioritário'),
('business','Business',39.90,20,'20 páginas, domínio próprio, templates premium');
