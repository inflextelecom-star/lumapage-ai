const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const now = () => Math.floor(Date.now()/1000);
const enc = new TextEncoder();
function b64url(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sha256(t){return b64url(await crypto.subtle.digest('SHA-256', enc.encode(t)))}
async function sign(payload, secret){const head=b64url(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))); const body=b64url(enc.encode(JSON.stringify(payload))); const key=await crypto.subtle.importKey('raw',enc.encode(secret),'HMAC',false,['sign']); const sig=b64url(await crypto.subtle.sign('HMAC',key,enc.encode(head+'.'+body))); return `${head}.${body}.${sig}`}
async function verify(token, secret){try{const [h,b,s]=token.split('.'); if(!h||!b||!s)return null; const key=await crypto.subtle.importKey('raw',enc.encode(secret),'HMAC',false,['sign']); const sig=b64url(await crypto.subtle.sign('HMAC',key,enc.encode(h+'.'+b))); if(sig!==s)return null; const p=JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/'))); if(p.exp && p.exp<now())return null; return p}catch{return null}}
function strong(p){return typeof p==='string'&&p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p)&&/[^A-Za-z0-9]/.test(p)}
async function body(req){try{return await req.json()}catch{return {}}}
async function migrate(DB){
 await DB.prepare(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,whatsapp TEXT,password_hash TEXT NOT NULL,role TEXT DEFAULT 'client',plan TEXT DEFAULT 'free',email_verified INTEGER DEFAULT 0,status TEXT DEFAULT 'active',created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,token TEXT UNIQUE,expires_at INTEGER,used INTEGER DEFAULT 0,created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,slug TEXT UNIQUE,segment TEXT,whatsapp TEXT,content TEXT,status TEXT DEFAULT 'draft',visits INTEGER DEFAULT 0,clicks INTEGER DEFAULT 0,created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,plan TEXT,amount REAL,status TEXT DEFAULT 'pending',mp_payment_id TEXT,qr_code TEXT,qr_code_base64 TEXT,pix_code TEXT,created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,name TEXT,price REAL,page_limit INTEGER,features TEXT,active INTEGER DEFAULT 1);`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT);`).run();
 await DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,details TEXT,ip TEXT,created_at INTEGER DEFAULT (strftime('%s','now')));`).run();
 await DB.prepare(`INSERT OR IGNORE INTO plans (code,name,price,page_limit,features) VALUES ('start','Start',9.90,1,'1 página, PIX, WhatsApp, suporte básico'),('pro','Pro',19.90,5,'5 páginas, analytics, IA, suporte prioritário'),('business','Business',39.90,20,'20 páginas, domínio próprio, templates premium');`).run();
}
async function auth(req, env){const a=req.headers.get('authorization')||''; const t=a.startsWith('Bearer ')?a.slice(7):''; if(!t)return null; return await verify(t, env.JWT_SECRET||'dev-secret-change-me')}
async function ensureAdmin(env){if(!env.ADMIN_PASSWORD)return; const email='Varejaoeverton@gmail.com'.toLowerCase(); const exist=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(!exist){await env.DB.prepare('INSERT INTO users (name,email,whatsapp,password_hash,role,plan,email_verified) VALUES (?,?,?,?,?,?,1)').bind('Administrador',email,'81985745430',await sha256(env.ADMIN_PASSWORD),'admin','business').run();}}
export async function onRequest({request, env}){
 try{
  if(request.method==='OPTIONS') return json({ok:true},200,{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'});
  if(!env.DB) return json({ok:false,error:'D1 binding DB não encontrado. Configure Settings > Bindings > DB.'},500);
  await migrate(env.DB); await ensureAdmin(env);
  const url=new URL(request.url); const path=url.pathname.replace(/^\/api/,'')||'/';
  if(path==='/health') return json({ok:true,time:new Date().toISOString(),db:true});
  if(path==='/register' && request.method==='POST'){
   const d=await body(request); const name=(d.name||'').trim(), email=(d.email||'').toLowerCase().trim(), whatsapp=(d.whatsapp||'').trim(), pass=d.password||'';
   if(!name||!email||!pass) return json({ok:false,error:'Preencha nome, e-mail e senha.'},400);
   if(!strong(pass)) return json({ok:false,error:'Senha fraca. Use 8+ caracteres, maiúscula, minúscula, número e símbolo.'},400);
   const ex=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(ex) return json({ok:false,error:'E-mail já cadastrado.'},409);
   const hash=await sha256(pass); const r=await env.DB.prepare('INSERT INTO users (name,email,whatsapp,password_hash,role,plan) VALUES (?,?,?,?,?,?)').bind(name,email,whatsapp,hash,'client','free').run();
   const user={id:r.meta.last_row_id,name,email,role:'client',plan:'free'}; const token=await sign({uid:user.id,email,role:'client',exp:now()+86400*7}, env.JWT_SECRET||'dev-secret-change-me');
   return json({ok:true,user,token});
  }
  if(path==='/login' && request.method==='POST'){
   const d=await body(request); const email=(d.email||'').toLowerCase().trim(), pass=d.password||''; const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
   if(!u || u.password_hash!==await sha256(pass)) return json({ok:false,error:'E-mail ou senha inválidos.'},401);
   const token=await sign({uid:u.id,email:u.email,role:u.role,exp:now()+86400*7}, env.JWT_SECRET||'dev-secret-change-me'); return json({ok:true,token,user:{id:u.id,name:u.name,email:u.email,role:u.role,plan:u.plan}});
  }
  if(path==='/me') { const p=await auth(request,env); if(!p)return json({ok:false,error:'Não autenticado'},401); const u=await env.DB.prepare('SELECT id,name,email,whatsapp,role,plan,status FROM users WHERE id=?').bind(p.uid).first(); return json({ok:true,user:u}); }
  if(path==='/forgot-password' && request.method==='POST'){
   const d=await body(request); const email=(d.email||'').toLowerCase().trim(); const u=await env.DB.prepare('SELECT id,email FROM users WHERE email=?').bind(email).first();
   if(u){const token=crypto.randomUUID(); await env.DB.prepare('INSERT INTO password_resets (user_id,token,expires_at) VALUES (?,?,?)').bind(u.id,token,now()+3600).run(); /* Configure RESEND_API_KEY futuramente para envio real */}
   return json({ok:true,message:'Se o e-mail existir, enviaremos um link de recuperação.'});
  }
  if(path==='/reset-password' && request.method==='POST'){
   const d=await body(request); if(!strong(d.password||'')) return json({ok:false,error:'Senha fraca.'},400); const r=await env.DB.prepare('SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at>?').bind(d.token,now()).first(); if(!r)return json({ok:false,error:'Token inválido ou expirado.'},400);
   await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await sha256(d.password),r.user_id).run(); await env.DB.prepare('UPDATE password_resets SET used=1 WHERE id=?').bind(r.id).run(); return json({ok:true});
  }
  if(path==='/projects' && request.method==='GET'){
   const p=await auth(request,env); if(!p)return json({ok:false,error:'Não autenticado'},401); const rows=await env.DB.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY id DESC').bind(p.uid).all(); return json({ok:true,projects:rows.results||[]});
  }
  if(path==='/projects' && request.method==='POST'){
   const p=await auth(request,env); if(!p)return json({ok:false,error:'Não autenticado'},401); const d=await body(request); const title=d.title||'Minha Landing Page'; const slug=(d.slug||title).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'-'+Date.now().toString(36);
   const content=JSON.stringify({headline:d.headline||'Página profissional criada com IA',segment:d.segment||'negócio local',whatsapp:d.whatsapp||''}); await env.DB.prepare('INSERT INTO projects (user_id,title,slug,segment,whatsapp,content,status) VALUES (?,?,?,?,?,?,?)').bind(p.uid,title,slug,d.segment||'',d.whatsapp||'',content,'active').run(); return json({ok:true,slug,url:`/p/${slug}`});
  }
  if(path.startsWith('/public-page/') && request.method==='GET'){
   const slug=path.split('/').pop(); const pr=await env.DB.prepare('SELECT * FROM projects WHERE slug=?').bind(slug).first(); if(!pr)return json({ok:false,error:'Página não encontrada'},404); await env.DB.prepare('UPDATE projects SET visits=visits+1 WHERE id=?').bind(pr.id).run(); return json({ok:true,project:pr,content:JSON.parse(pr.content||'{}')});
  }
  if(path==='/plans') { const rows=await env.DB.prepare('SELECT * FROM plans WHERE active=1').all(); return json({ok:true,plans:rows.results||[]}); }
  if(path==='/payments/pix' && request.method==='POST'){
   const p=await auth(request,env); if(!p)return json({ok:false,error:'Não autenticado'},401); const d=await body(request); const amount=Number(d.amount||9.9); const plan=d.plan||'start';
   // Mercado Pago real: configure MERCADO_PAGO_ACCESS_TOKEN. Sem token, retorna PIX de teste controlado.
   if(env.MERCADO_PAGO_ACCESS_TOKEN){
    const mp=await fetch('https://api.mercadopago.com/v1/payments',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({transaction_amount:amount,description:`LumaPage AI - ${plan}`,payment_method_id:'pix',payer:{email:p.email}})});
    const data=await mp.json(); const qr=data.point_of_interaction?.transaction_data?.qr_code||''; const b64=data.point_of_interaction?.transaction_data?.qr_code_base64||''; await env.DB.prepare('INSERT INTO payments (user_id,plan,amount,status,mp_payment_id,qr_code_base64,pix_code) VALUES (?,?,?,?,?,?,?)').bind(p.uid,plan,amount,data.status||'pending',String(data.id||''),b64,qr).run(); return json({ok:true,real:true,status:data.status,qr_code_base64:b64,pix_code:qr});
   }
   const fake='00020126580014BR.GOV.BCB.PIX0136CHAVE-PIX-CONFIGURAR-MERCADO-PAGO520400005303986540'+amount.toFixed(2).replace('.','')+'5802BR5920LUMAPAGE AI6009SAO PAULO62070503***6304ABCD'; await env.DB.prepare('INSERT INTO payments (user_id,plan,amount,status,pix_code) VALUES (?,?,?,?,?)').bind(p.uid,plan,amount,'pending',fake).run(); return json({ok:true,real:false,pix_code:fake,message:'Configure MERCADO_PAGO_ACCESS_TOKEN para PIX real.'});
  }
  if(path==='/admin/summary') { const p=await auth(request,env); if(!p||p.role!=='admin') return json({ok:false,error:'Admin necessário'},403); const users=await env.DB.prepare('SELECT COUNT(*) c FROM users').first(); const projects=await env.DB.prepare('SELECT COUNT(*) c FROM projects').first(); const payments=await env.DB.prepare('SELECT COUNT(*) c FROM payments').first(); return json({ok:true,summary:{users:users.c,projects:projects.c,payments:payments.c}}); }
  return json({ok:false,error:'Rota não encontrada',path},404);
 }catch(e){ return json({ok:false,error:'Erro interno do servidor',detail:String(e&&e.message||e)},500); }
}
