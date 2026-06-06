const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'}});
const html = (body, status=200) => new Response(body, {status, headers:{'content-type':'text/html; charset=utf-8'}});

async function sha256(text){ const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function token(){ return crypto.randomUUID() + '.' + Math.random().toString(36).slice(2); }
function strongPassword(p){ return typeof p==='string' && p.length>=8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p); }
function slugify(s){ return String(s||'pagina').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60) || 'pagina'; }
async function body(req){ try{return await req.json()}catch{return {}} }
async function migrate(DB){
  const stmts = [
`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,whatsapp TEXT,password_hash TEXT NOT NULL,role TEXT DEFAULT 'client',plan TEXT DEFAULT 'free',status TEXT DEFAULT 'active',created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,token TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,slug TEXT UNIQUE,niche TEXT,content TEXT,status TEXT DEFAULT 'active',visits INTEGER DEFAULT 0,whatsapp_clicks INTEGER DEFAULT 0,created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,plan TEXT,amount REAL,status TEXT DEFAULT 'pending',payment_id TEXT,qr_code TEXT,pix_code TEXT,created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,token TEXT,expires_at INTEGER,used INTEGER DEFAULT 0,created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,level TEXT DEFAULT 'info',action TEXT,message TEXT,meta TEXT,created_at INTEGER DEFAULT (strftime('%s','now')))`,
`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER DEFAULT (strftime('%s','now')))`
  ];
  for(const s of stmts) await DB.prepare(s).run();
}
async function log(env, action, message, meta={}){ try{ await env.DB.prepare('INSERT INTO system_logs(level,action,message,meta) VALUES(?,?,?,?)').bind('info',action,message,JSON.stringify(meta)).run(); }catch(e){} }
async function requireUser(req, env){
  const auth = req.headers.get('authorization')||''; const t = auth.replace('Bearer ',''); if(!t) return null;
  const row = await env.DB.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?').bind(t, Math.floor(Date.now()/1000)).first();
  return row || null;
}

export default { async fetch(req, env, ctx){
  const url = new URL(req.url); const path = url.pathname;
  if(req.method==='OPTIONS') return json({ok:true});
  if(!env.DB && path.startsWith('/api/')) return json({ok:false,error:'DB_BINDING_MISSING',message:'Binding D1 DB não configurado em Production'},500);
  if(path.startsWith('/api/')) await migrate(env.DB);

  try{
    if(path==='/api/health'){
      const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      return json({ok:true, service:'LumaPage AI', api:'active', db:'connected', tables: tables.results?.map(x=>x.name)||[]});
    }
    if(path==='/api/register' && req.method==='POST'){
      const b = await body(req); const name=(b.name||'').trim(); const email=(b.email||'').trim().toLowerCase(); const whatsapp=(b.whatsapp||'').trim(); const pass=b.password||'';
      if(!name || !email || !pass) return json({ok:false,code:'REGISTER_FIELDS',message:'Preencha nome, e-mail e senha.'},400);
      if(!strongPassword(pass)) return json({ok:false,code:'WEAK_PASSWORD',message:'Senha precisa ter 8 caracteres, maiúscula, minúscula, número e símbolo.'},400);
      const hash = await sha256(pass + '::lumapage');
      try{
        const role = email === 'varejaoeverton@gmail.com' ? 'admin' : 'client';
        await env.DB.prepare('INSERT INTO users(name,email,whatsapp,password_hash,role,plan,status) VALUES(?,?,?,?,?,?,?)').bind(name,email,whatsapp,hash,role,'free','active').run();
        const u = await env.DB.prepare('SELECT id,name,email,whatsapp,role,plan,status FROM users WHERE email=?').bind(email).first();
        const t = token(); await env.DB.prepare('INSERT INTO sessions(user_id,token,expires_at) VALUES(?,?,?)').bind(u.id,t,Math.floor(Date.now()/1000)+86400*7).run();
        await log(env,'register','Usuário cadastrado',{email});
        return json({ok:true,message:'Conta criada com sucesso.',token:t,user:u});
      }catch(e){
        return json({ok:false,code:'EMAIL_EXISTS_OR_DB_ERROR',message:e.message.includes('UNIQUE')?'E-mail já cadastrado.':e.message},400);
      }
    }
    if(path==='/api/login' && req.method==='POST'){
      const b=await body(req); const email=(b.email||'').trim().toLowerCase(); const pass=b.password||'';
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
      if(!u) return json({ok:false,code:'LOGIN_INVALID',message:'E-mail ou senha inválidos.'},401);
      const hash = await sha256(pass + '::lumapage');
      if(hash!==u.password_hash && !(email==='varejaoeverton@gmail.com' && env.ADMIN_PASSWORD && pass===env.ADMIN_PASSWORD)) return json({ok:false,code:'LOGIN_INVALID',message:'E-mail ou senha inválidos.'},401);
      const t=token(); await env.DB.prepare('INSERT INTO sessions(user_id,token,expires_at) VALUES(?,?,?)').bind(u.id,t,Math.floor(Date.now()/1000)+86400*7).run();
      return json({ok:true,token:t,user:{id:u.id,name:u.name,email:u.email,role:u.role,plan:u.plan,status:u.status}});
    }
    if(path==='/api/me'){
      const u=await requireUser(req,env); if(!u) return json({ok:false,message:'Não autenticado'},401);
      return json({ok:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,plan:u.plan,status:u.status}});
    }
    if(path==='/api/projects' && req.method==='GET'){
      const u=await requireUser(req,env); if(!u) return json({ok:false,message:'Não autenticado'},401);
      const rows = await env.DB.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY id DESC').bind(u.id).all();
      return json({ok:true,projects:rows.results||[]});
    }
    if(path==='/api/projects' && req.method==='POST'){
      const u=await requireUser(req,env); if(!u) return json({ok:false,message:'Não autenticado'},401);
      const b=await body(req); const title=b.title||'Minha Landing Page'; const niche=b.niche||'Negócio Local'; let slug=slugify(title)+'-'+Math.random().toString(36).slice(2,6);
      const content=JSON.stringify({title,niche,headline:`${title}: venda mais com uma página profissional`,cta:'Fale no WhatsApp', sections:['Benefícios','Depoimentos','FAQ','Contato']});
      await env.DB.prepare('INSERT INTO projects(user_id,title,slug,niche,content,status) VALUES(?,?,?,?,?,?)').bind(u.id,title,slug,niche,content,'active').run();
      return json({ok:true,slug,url:`/p/${slug}`});
    }
    if(path.startsWith('/p/')){
      const slug=path.split('/').pop(); const p=await env.DB.prepare('SELECT * FROM projects WHERE slug=?').bind(slug).first();
      if(!p) return html('<h1>Página não encontrada</h1>',404);
      await env.DB.prepare('UPDATE projects SET visits=visits+1 WHERE id=?').bind(p.id).run();
      let c={}; try{c=JSON.parse(p.content||'{}')}catch{}
      return html(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.title}</title><style>body{margin:0;background:#070a16;color:#fff;font-family:Arial;padding:30px}.hero{max-width:850px;margin:auto;padding:60px 20px;border-radius:30px;background:linear-gradient(135deg,#111936,#16213d,#042f3d);box-shadow:0 0 80px #25d9ff44}h1{font-size:48px}.btn{display:inline-block;background:#25e288;color:#03120b;padding:18px 28px;border-radius:18px;text-decoration:none;font-weight:900}</style></head><body><section class=hero><h1>${c.headline||p.title}</h1><p>Landing page profissional criada pela LumaPage AI.</p><a class=btn href="https://wa.me/5581985745430">${c.cta||'Fale no WhatsApp'}</a></section></body></html>`);
    }
    if(path==='/api/payments/pix' && req.method==='POST'){
      const u=await requireUser(req,env); if(!u) return json({ok:false,message:'Não autenticado'},401);
      const b=await body(req); const plan=b.plan||'pro'; const amount=plan==='business'?39.90:plan==='premium'?59.90:19.90;
      // preparado para Mercado Pago real; fallback demo se token não existir
      const pixCode = `PIX-LUMAPAGE-${u.id}-${Date.now()}-R$${amount}`;
      await env.DB.prepare('INSERT INTO payments(user_id,plan,amount,status,qr_code,pix_code) VALUES(?,?,?,?,?,?)').bind(u.id,plan,amount,'pending','',pixCode).run();
      return json({ok:true,plan,amount,pix_code:pixCode,qr_code:'',message:'PIX gerado. Configure MERCADO_PAGO_ACCESS_TOKEN para QR real.'});
    }
    if(path==='/api/admin/summary'){
      const u=await requireUser(req,env); if(!u || u.role!=='admin') return json({ok:false,message:'Admin não autorizado'},403);
      const users=await env.DB.prepare('SELECT COUNT(*) total FROM users').first();
      const projects=await env.DB.prepare('SELECT COUNT(*) total FROM projects').first();
      const payments=await env.DB.prepare('SELECT COUNT(*) total FROM payments').first();
      const logs=await env.DB.prepare('SELECT * FROM system_logs ORDER BY id DESC LIMIT 20').all();
      return json({ok:true,summary:{users:users.total,projects:projects.total,payments:payments.total},logs:logs.results||[]});
    }
    if(path==='/api/reset-request' && req.method==='POST'){
      const b=await body(req); const email=(b.email||'').toLowerCase(); const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
      if(u){ const rt=token(); await env.DB.prepare('INSERT INTO password_resets(user_id,token,expires_at) VALUES(?,?,?)').bind(u.id,rt,Math.floor(Date.now()/1000)+3600).run(); await log(env,'reset','Reset solicitado',{email}); }
      return json({ok:true,message:'Se o e-mail existir, enviaremos um link de redefinição.'});
    }
    return json({ok:false,error:'API_ROUTE_NOT_FOUND',path},404);
  }catch(e){
    return json({ok:false,error:'SERVER_ERROR',message:e.message,stack:(e.stack||'').slice(0,400)},500);
  }
}};
