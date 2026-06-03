const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const now = () => Math.floor(Date.now()/1000);
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
async function sha256(s){return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)))}
async function sign(payload, secret){
  const header = b64url(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'})));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`)));
  return `${header}.${body}.${sig}`;
}
async function verify(token, secret){
  try{
    const [h,b,sig]=token.split('.'); if(!h||!b||!sig) return null;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
    const good = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`${h}.${b}`)));
    if(good!==sig) return null;
    const payload = JSON.parse(dec.decode(fromB64url(b)));
    if(payload.exp && payload.exp < now()) return null;
    return payload;
  }catch{return null}
}
function strongPassword(p){return typeof p==='string' && p.length>=8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p)}
async function body(req){try{return await req.json()}catch{return {}}}
function slugify(s){return (s||'pagina').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55) || 'pagina'}
function requireDB(env){ if(!env.DB) throw new Error('D1 binding DB não configurado. Conecte o D1 com variável DB.'); return env.DB; }
function ip(req){return req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'local'}
function ua(req){return (req.headers.get('user-agent')||'').slice(0,250)}
async function log(env, type, message, userId=null, req=null, meta=null){try{await env.DB.prepare('INSERT INTO audit_logs (user_id,type,message,ip,user_agent,meta) VALUES (?,?,?,?,?,?)').bind(userId,type,message,req?ip(req):'',req?ua(req):'',meta?JSON.stringify(meta):null).run()}catch(e){}}
async function rateLimit(env, req, bucket='global', limit=40, seconds=60){
  try{
    const key=`${bucket}:${ip(req)}`; const current=await env.DB.prepare('SELECT * FROM rate_limits WHERE key=?').bind(key).first();
    if(!current || current.reset_at < now()) { await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key,count,reset_at) VALUES (?,?,?)').bind(key,1,now()+seconds).run(); return true; }
    if(current.count>=limit) return false;
    await env.DB.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').bind(key).run(); return true;
  }catch{return true}
}
async function verifyTurnstile(env, req, token){
  if(!env.TURNSTILE_SECRET_KEY) return true;
  if(!token) return false;
  try{
    const form=new FormData(); form.append('secret',env.TURNSTILE_SECRET_KEY); form.append('response',token); form.append('remoteip',ip(req));
    const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form}); const j=await r.json(); return !!j.success;
  }catch{return false}
}
async function currentUser(req, env){
  const auth=req.headers.get('authorization')||''; const token=auth.replace(/^Bearer\s+/i,'');
  if(!token) return null; const payload=await verify(token, env.JWT_SECRET||'dev-secret-change'); if(!payload) return null;
  const row=await env.DB.prepare('SELECT id,name,email,phone,role,plan,status,email_verified FROM users WHERE id=?').bind(payload.sub).first();
  return row||null;
}
async function ensureAdmin(env){
  const email=(env.ADMIN_EMAIL||'Varejaoeverton@gmail.com').toLowerCase();
  const pass=env.ADMIN_PASSWORD||'Enzo777.@';
  let u=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first();
  if(!u){
    const hash=await sha256(pass);
    await env.DB.prepare('INSERT INTO users (name,email,phone,password_hash,role,plan,status,email_verified) VALUES (?,?,?,?,?,?,?,1)').bind('Administrador',email,'81985745430',hash,'admin','business','active').run();
  }
}
async function sendEmail(env, to, subject, html, userId=null, type='system'){
  if(!env.RESEND_API_KEY){ await env.DB.prepare('INSERT INTO email_logs (user_id,type,to_email,status,provider_response) VALUES (?,?,?,?,?)').bind(userId,type,to,'not_configured','RESEND_API_KEY ausente').run().catch(()=>{}); return {ok:false,reason:'RESEND_API_KEY ausente'}; }
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM||'LumaPage <onboarding@resend.dev>',to,subject,html})});
  const text=await r.text(); await env.DB.prepare('INSERT INTO email_logs (user_id,type,to_email,status,provider_response) VALUES (?,?,?,?,?)').bind(userId,type,to,r.ok?'sent':'failed',text.slice(0,500)).run().catch(()=>{});
  return {ok:r.ok,response:text};
}
async function register(req, env){
  const db=requireDB(env); const data=await body(req);
  if(!await rateLimit(env,req,'register',8,300)) return json({ok:false,error:'Muitas tentativas. Aguarde alguns minutos.'},429);
  if(!await verifyTurnstile(env,req,data.turnstileToken)) return json({ok:false,error:'Validação anti-bot falhou'},403);
  const name=(data.name||'').trim(), email=(data.email||'').trim().toLowerCase(), phone=(data.phone||'').trim(), password=data.password||'', plan=data.plan||'starter';
  if(!name || !email || !password) return json({ok:false,error:'Preencha todos os campos'},400);
  if(!strongPassword(password)) return json({ok:false,error:'Senha precisa ter 8+ caracteres, maiúscula, minúscula, número e símbolo'},400);
  const exists=await db.prepare('SELECT id FROM users WHERE lower(email)=?').bind(email).first();
  if(exists) return json({ok:false,error:'E-mail já cadastrado'},409);
  const hash=await sha256(password); const verifyToken=await sha256(crypto.randomUUID()+email);
  const res=await db.prepare('INSERT INTO users (name,email,phone,password_hash,plan,status,email_verified,email_verify_token) VALUES (?,?,?,?,?,?,0,?)').bind(name,email,phone,hash,plan,'active',verifyToken).run();
  const base=env.PUBLIC_BASE_URL || new URL(req.url).origin; const link=`${base}/api/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
  await sendEmail(env,email,'Confirme seu e-mail — LumaPage AI',`<h2>Bem-vindo ao LumaPage AI</h2><p>Confirme seu e-mail clicando no link:</p><p><a href="${link}">${link}</a></p>`,res.meta.last_row_id,'verify_email');
  await log(env,'auth','Cliente cadastrado',res.meta.last_row_id,req);
  const token=await sign({sub:res.meta.last_row_id,role:'client',exp:now()+86400*7}, env.JWT_SECRET||'dev-secret-change');
  return json({ok:true,token,user:{id:res.meta.last_row_id,name,email,phone,role:'client',plan,status:'active',email_verified:0},message:'Conta criada. Confirme o e-mail para máxima segurança.'});
}
async function verifyEmail(req, env){
  const token=new URL(req.url).searchParams.get('token')||'';
  const u=await env.DB.prepare('SELECT id FROM users WHERE email_verify_token=?').bind(token).first();
  if(!u) return new Response('<h2>Link inválido.</h2>',{headers:{'content-type':'text/html;charset=utf-8'}});
  await env.DB.prepare('UPDATE users SET email_verified=1,email_verify_token=NULL,updated_at=? WHERE id=?').bind(now(),u.id).run();
  return new Response('<h2>E-mail confirmado com sucesso.</h2><p>Você já pode voltar para o LumaPage AI.</p>',{headers:{'content-type':'text/html;charset=utf-8'}});
}
async function login(req, env){
  await ensureAdmin(env); const db=requireDB(env); const data=await body(req);
  if(!await rateLimit(env,req,'login',12,300)) return json({ok:false,error:'Muitas tentativas de login. Aguarde alguns minutos.'},429);
  const email=(data.email||'').trim().toLowerCase(), password=data.password||'';
  const u=await db.prepare('SELECT id,name,email,phone,password_hash,role,plan,status,email_verified FROM users WHERE lower(email)=?').bind(email).first();
  if(!u || u.password_hash !== await sha256(password)){ await log(env,'security','Falha de login',null,req,{email}); return json({ok:false,error:'Login ou senha inválidos'},401); }
  if(u.status==='blocked') return json({ok:false,error:'Conta bloqueada'},403);
  const token=await sign({sub:u.id,role:u.role,exp:now()+86400*7}, env.JWT_SECRET||'dev-secret-change');
  await env.DB.prepare('INSERT INTO sessions (user_id,token_hash,ip,user_agent,expires_at) VALUES (?,?,?,?,?)').bind(u.id,await sha256(token),ip(req),ua(req),now()+86400*7).run().catch(()=>{});
  await log(env,'auth','Login realizado',u.id,req);
  delete u.password_hash; return json({ok:true,token,user:u});
}
async function forgot(req, env){
  const data=await body(req); if(!await rateLimit(env,req,'forgot',6,300)) return json({ok:false,error:'Aguarde alguns minutos para tentar novamente.'},429);
  const email=(data.email||'').trim().toLowerCase();
  const u=await env.DB.prepare('SELECT id,email,name FROM users WHERE lower(email)=?').bind(email).first();
  if(!u) return json({ok:true,message:'Se existir cadastro, enviaremos instruções.'});
  const token=await sha256(crypto.randomUUID()+Date.now()); const exp=now()+3600;
  await env.DB.prepare('INSERT INTO password_resets (user_id,token,expires_at,used) VALUES (?,?,?,0)').bind(u.id,token,exp).run();
  const base=env.PUBLIC_BASE_URL || new URL(req.url).origin; const link=`${base}/#reset/${token}`;
  await sendEmail(env,u.email,'Redefinir senha — LumaPage AI',`<h2>Redefinir senha</h2><p>Clique no link para criar uma nova senha:</p><p><a href="${link}">${link}</a></p><p>O link expira em 1 hora.</p>`,u.id,'password_reset');
  await log(env,'security','Reset de senha solicitado',u.id,req);
  return json({ok:true,message:'Se existir cadastro, enviaremos instruções.',dev_link: env.RESEND_API_KEY ? undefined : link});
}
async function resetPassword(req, env){
  const data=await body(req); const token=data.token||'', password=data.password||'';
  if(!strongPassword(password)) return json({ok:false,error:'Senha fraca'},400);
  const row=await env.DB.prepare('SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at>?').bind(token,now()).first();
  if(!row) return json({ok:false,error:'Link inválido ou expirado'},400);
  await env.DB.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(await sha256(password), now(), row.user_id).run();
  await env.DB.prepare('UPDATE password_resets SET used=1 WHERE id=?').bind(row.id).run();
  await log(env,'security','Senha redefinida',row.user_id,req);
  return json({ok:true});
}
async function me(req, env){ const u=await currentUser(req,env); if(!u)return json({ok:false},401); return json({ok:true,user:u}) }
async function clientDashboard(req, env){
  const u=await currentUser(req,env); if(!u)return json({ok:false,error:'Não autenticado'},401);
  const projects=await env.DB.prepare('SELECT * FROM projects WHERE user_id=? ORDER BY id DESC').bind(u.id).all();
  const payments=await env.DB.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 10').bind(u.id).all();
  const plans=await env.DB.prepare('SELECT * FROM plans WHERE active=1').all();
  return json({ok:true,user:u,projects:projects.results||[],payments:payments.results||[],plans:plans.results||[]});
}
async function createProject(req, env){
  const u=await currentUser(req,env); if(!u)return json({ok:false,error:'Não autenticado'},401);
  const data=await body(req); const business=(data.business||'Meu Negócio').trim(); const segment=data.segment||'Serviços'; const whats=(data.whats||u.phone||'').replace(/\D/g,'');
  const plan=await env.DB.prepare('SELECT * FROM plans WHERE id=?').bind(u.plan||'starter').first(); const limit=plan?.page_limit||1;
  const current=await env.DB.prepare('SELECT COUNT(*) c FROM projects WHERE user_id=?').bind(u.id).first(); if(current.c>=limit) return json({ok:false,error:'Limite de páginas do plano atingido. Faça upgrade.'},402);
  let slug=slugify(business); let count=0;
  while(await env.DB.prepare('SELECT id FROM projects WHERE slug=?').bind(slug).first()){ count++; slug=slugify(business)+'-'+count; }
  let headline=`${business}: atendimento profissional para você vender mais`;
  let copy=`Página criada para ${segment}, com apresentação premium, chamada para ação e contato direto pelo WhatsApp.`;
  if(env.GEMINI_API_KEY){
    try{
      const prompt=`Crie uma headline curta e uma copy persuasiva em português para landing page. Negócio: ${business}. Segmento: ${segment}. Objetivo: ${data.goal||'atrair clientes pelo WhatsApp'}. Responda JSON {"headline":"","copy":""}`;
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
      const j=await r.json(); const text=j?.candidates?.[0]?.content?.parts?.[0]?.text||''; const m=text.match(/\{[\s\S]*\}/); if(m){const o=JSON.parse(m[0]); headline=o.headline||headline; copy=o.copy||copy;}
    }catch(e){}
  }
  const res=await env.DB.prepare('INSERT INTO projects (user_id,title,slug,segment,headline,copy,whats,status) VALUES (?,?,?,?,?,?,?,?)').bind(u.id,business,slug,segment,headline,copy,whats,'published').run();
  await log(env,'project','Página criada: '+slug,u.id,req);
  return json({ok:true,project:{id:res.meta.last_row_id,title:business,slug,headline,copy,whats,status:'published'}});
}
async function publicProject(slug, env, req){
  const p=await env.DB.prepare('SELECT * FROM projects WHERE slug=? AND status="published"').bind(slug).first();
  if(!p) return json({ok:false,error:'Página não encontrada'},404);
  await env.DB.prepare('UPDATE projects SET visits=visits+1 WHERE id=?').bind(p.id).run();
  await env.DB.prepare('INSERT INTO analytics_events (project_id,user_id,event,path,ip,user_agent) VALUES (?,?,?,?,?,?)').bind(p.id,p.user_id,'visit','/p/'+slug,ip(req),ua(req)).run().catch(()=>{});
  return json({ok:true,project:p});
}
async function lead(slug, env, req){ const p=await env.DB.prepare('SELECT id,user_id FROM projects WHERE slug=?').bind(slug).first(); if(p){ await env.DB.prepare('UPDATE projects SET leads=leads+1 WHERE id=?').bind(p.id).run(); await env.DB.prepare('INSERT INTO analytics_events (project_id,user_id,event,path,ip,user_agent) VALUES (?,?,?,?,?,?)').bind(p.id,p.user_id,'lead','/p/'+slug,ip(req),ua(req)).run().catch(()=>{});} return json({ok:true}) }
async function createPix(req, env){
  const u=await currentUser(req,env); if(!u)return json({ok:false,error:'Não autenticado'},401);
  const data=await body(req); const planId=data.plan||u.plan||'starter'; const plan=await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1').bind(planId).first(); if(!plan) return json({ok:false,error:'Plano inválido'},400);
  let qr_code='', pix_code='', payment_id='demo-'+Date.now(), raw='';
  if(env.MERCADO_PAGO_ACCESS_TOKEN){
    const payload={transaction_amount:Number(plan.price),description:`LumaPage AI - ${plan.name}`,payment_method_id:'pix',payer:{email:u.email,first_name:u.name}};
    const r=await fetch('https://api.mercadopago.com/v1/payments',{method:'POST',headers:{authorization:`Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`,'content-type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});
    const j=await r.json(); raw=JSON.stringify(j).slice(0,3000); if(!r.ok) return json({ok:false,error:j.message||'Erro Mercado Pago',details:j},400);
    payment_id=String(j.id); qr_code=j.point_of_interaction?.transaction_data?.qr_code_base64||''; pix_code=j.point_of_interaction?.transaction_data?.qr_code||'';
  } else {
    pix_code='PIX_DEMONSTRACAO_CONFIGURE_MERCADO_PAGO_ACCESS_TOKEN';
  }
  const res=await env.DB.prepare('INSERT INTO payments (user_id,plan,amount,status,payment_id,qr_code,pix_code,raw_json) VALUES (?,?,?,?,?,?,?,?)').bind(u.id,plan.id,plan.price,'pending',payment_id,qr_code,pix_code,raw).run();
  return json({ok:true,payment:{id:res.meta.last_row_id,plan:plan.id,amount:plan.price,status:'pending',payment_id,qr_code,pix_code}});
}
async function webhook(req, env){
  const data=await body(req); const id=data?.data?.id || data?.id || new URL(req.url).searchParams.get('id');
  if(!id) return json({ok:true});
  let status='approved', raw='';
  if(env.MERCADO_PAGO_ACCESS_TOKEN){
    const r=await fetch(`https://api.mercadopago.com/v1/payments/${id}`,{headers:{authorization:`Bearer ${env.MERCADO_PAGO_ACCESS_TOKEN}`}}); const j=await r.json(); status=j.status||status; raw=JSON.stringify(j).slice(0,3000);
  }
  const pay=await env.DB.prepare('SELECT * FROM payments WHERE payment_id=?').bind(String(id)).first();
  if(pay){ await env.DB.prepare('UPDATE payments SET status=?,updated_at=?,raw_json=? WHERE id=?').bind(status,now(),raw,pay.id).run(); if(status==='approved'){await env.DB.prepare('UPDATE users SET plan=?,updated_at=? WHERE id=?').bind(pay.plan,now(),pay.user_id).run(); await log(env,'payment','Plano liberado via Mercado Pago',pay.user_id,req,{plan:pay.plan,payment_id:id});}}
  return json({ok:true});
}
async function supportTicket(req, env){
  const u=await currentUser(req,env); if(!u)return json({ok:false,error:'Não autenticado'},401); const data=await body(req);
  const subject=(data.subject||'Suporte').slice(0,120); const message=(data.message||'').slice(0,2000); if(!message) return json({ok:false,error:'Mensagem obrigatória'},400);
  const res=await env.DB.prepare('INSERT INTO support_tickets (user_id,subject,message,status) VALUES (?,?,?,?)').bind(u.id,subject,message,'open').run();
  await log(env,'support','Ticket aberto: '+subject,u.id,req); return json({ok:true,ticket_id:res.meta.last_row_id});
}
async function admin(req, env, path){
  const u=await currentUser(req,env); if(!u||u.role!=='admin') return json({ok:false,error:'Admin necessário'},403);
  if(path==='admin/stats'){
    const users=await env.DB.prepare('SELECT COUNT(*) c FROM users').first(); const projects=await env.DB.prepare('SELECT COUNT(*) c FROM projects').first(); const payments=await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM payments WHERE status="approved"').first(); const leads=await env.DB.prepare('SELECT COALESCE(SUM(leads),0) c FROM projects').first();
    return json({ok:true,stats:{users:users.c,projects:projects.c,payments:payments.c,revenue:payments.total,leads:leads.c}});
  }
  if(path==='admin/users' && req.method==='GET'){const r=await env.DB.prepare('SELECT id,name,email,phone,role,plan,status,email_verified,created_at FROM users ORDER BY id DESC LIMIT 200').all(); return json({ok:true,users:r.results||[]})}
  if(path==='admin/users/update' && req.method==='POST'){const d=await body(req); await env.DB.prepare('UPDATE users SET status=COALESCE(?,status), plan=COALESCE(?,plan), role=COALESCE(?,role), updated_at=? WHERE id=?').bind(d.status||null,d.plan||null,d.role||null,now(),d.id).run(); await log(env,'admin','Usuário atualizado',u.id,req,d); return json({ok:true})}
  if(path==='admin/plans' && req.method==='GET'){const r=await env.DB.prepare('SELECT * FROM plans ORDER BY price ASC').all(); return json({ok:true,plans:r.results||[]})}
  if(path==='admin/plans/save' && req.method==='POST'){const d=await body(req); await env.DB.prepare('INSERT OR REPLACE INTO plans (id,name,price,page_limit,features,active,updated_at) VALUES (?,?,?,?,?,?,?)').bind(d.id,d.name,Number(d.price),Number(d.page_limit||1),d.features||'',d.active?1:0,now()).run(); await log(env,'admin','Plano salvo',u.id,req,d); return json({ok:true})}
  if(path==='admin/payments'){const r=await env.DB.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 200').all(); return json({ok:true,payments:r.results||[]})}
  if(path==='admin/logs'){const r=await env.DB.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all(); return json({ok:true,logs:r.results||[]})}
  if(path==='admin/analytics'){const r=await env.DB.prepare('SELECT event, COUNT(*) total FROM analytics_events GROUP BY event').all(); return json({ok:true,events:r.results||[]})}
  if(path==='admin/settings' && req.method==='GET'){const r=await env.DB.prepare('SELECT * FROM settings').all(); return json({ok:true,settings:r.results||[]})}
  if(path==='admin/settings' && req.method==='POST'){const d=await body(req); for(const [k,v] of Object.entries(d||{})){ await env.DB.prepare('INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(k,typeof v==='string'?v:JSON.stringify(v),now()).run(); } await log(env,'admin','Configurações salvas',u.id,req); return json({ok:true})}
  if(path==='admin/backup'){
    const users=await env.DB.prepare('SELECT id,name,email,phone,role,plan,status,email_verified,created_at FROM users').all(); const projects=await env.DB.prepare('SELECT * FROM projects').all(); const plans=await env.DB.prepare('SELECT * FROM plans').all(); const payments=await env.DB.prepare('SELECT * FROM payments').all();
    return json({ok:true,generated_at:now(),backup:{users:users.results,projects:projects.results,plans:plans.results,payments:payments.results}});
  }
  return json({ok:false,error:'Rota admin não encontrada'},404);
}
export async function onRequest(context){
  const {request, env, params}=context; const path=(params.path||[]).join('/');
  if(request.method==='OPTIONS') return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'}});
  try{
    requireDB(env);
    if(request.method==='GET' && path==='auth/verify-email') return verifyEmail(request,env);
    if(request.method==='POST' && path==='auth/register') return register(request,env);
    if(request.method==='POST' && path==='auth/login') return login(request,env);
    if(request.method==='POST' && path==='auth/forgot') return forgot(request,env);
    if(request.method==='POST' && path==='auth/reset') return resetPassword(request,env);
    if(request.method==='GET' && path==='auth/me') return me(request,env);
    if(request.method==='GET' && path==='client/dashboard') return clientDashboard(request,env);
    if(request.method==='POST' && path==='projects') return createProject(request,env);
    if(request.method==='GET' && path.startsWith('public/project/')) return publicProject(path.split('/').pop(),env,request);
    if(request.method==='POST' && path.startsWith('public/lead/')) return lead(path.split('/').pop(),env,request);
    if(request.method==='POST' && path==='payments/pix') return createPix(request,env);
    if(request.method==='POST' && path==='payments/webhook') return webhook(request,env);
    if(request.method==='POST' && path==='support/ticket') return supportTicket(request,env);
    if(path.startsWith('admin/')) return admin(request,env,path);
    return json({ok:false,error:'API não encontrada',path},404);
  }catch(e){return json({ok:false,error:e.message||'Erro interno'},500)}
}
