// LumaPage AI — API real para Cloudflare Pages Functions + D1
// Vincule D1 como DB. Configure variáveis/secrets:
// ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET, GEMINI_API_KEY, MERCADO_PAGO_ACCESS_TOKEN, RESEND_API_KEY, EMAIL_FROM, APP_URL
const enc = new TextEncoder();
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const err = (message, status=400, extra={}) => json({ok:false,error:message,...extra}, status);
async function readJson(req){ try { return await req.json(); } catch { return {}; } }
function slugify(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||crypto.randomUUID().slice(0,8)}
function strongPassword(p){return typeof p==='string' && p.length>=8 && /[A-Z]/.test(p)&&/[a-z]/.test(p)&&/[0-9]/.test(p)&&/[^A-Za-z0-9]/.test(p)}
function b64url(buf){let s= typeof buf==='string'? btoa(buf): btoa(String.fromCharCode(...new Uint8Array(buf))); return s.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function b64urlDecode(s){s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return atob(s)}
async function sha256(str){return crypto.subtle.digest('SHA-256', enc.encode(str))}
async function hashPassword(password, salt=crypto.randomUUID()){const hash=await sha256(salt+':'+password);return salt+':'+b64url(hash)}
async function verifyPassword(password, stored){ if(!stored||!stored.includes(':')) return false; const salt=stored.split(':')[0]; return await hashPassword(password,salt)===stored; }
async function signJWT(payload, secret){const header=b64url(JSON.stringify({alg:'HS256',typ:'JWT'})); const body=b64url(JSON.stringify({...payload,iat:Date.now(),exp:Date.now()+1000*60*60*24*7})); const key=await crypto.subtle.importKey('raw', enc.encode(secret),'HMAC',false,['sign']); const sig=await crypto.subtle.sign('HMAC', key, enc.encode(header+'.'+body)); return header+'.'+body+'.'+b64url(sig)}
async function verifyJWT(token, secret){ try{ const [h,p,s]=token.split('.'); if(!h||!p||!s) return null; const key=await crypto.subtle.importKey('raw', enc.encode(secret),'HMAC',false,['sign']); const sig=await crypto.subtle.sign('HMAC', key, enc.encode(h+'.'+p)); if(b64url(sig)!==s) return null; const data=JSON.parse(b64urlDecode(p)); if(data.exp<Date.now()) return null; return data; }catch{return null} }
async function auth(req, env){ const h=req.headers.get('authorization')||''; const t=h.startsWith('Bearer ')?h.slice(7):''; if(!t) return null; return verifyJWT(t, env.JWT_SECRET||'troque-este-segredo'); }
function getIp(req){return req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'local'}
async function log(env, type, message, meta={}){ try{ await env.DB.prepare('INSERT INTO audit_logs(id,type,message,meta,created_at) VALUES(?,?,?,?,datetime("now"))').bind(crypto.randomUUID(),type,message,JSON.stringify(meta)).run(); }catch{} }
async function rateLimit(env, req, key, limit=25){ const ip=getIp(req); const bucket=key+':'+ip+':'+Math.floor(Date.now()/60000); try{ const r=await env.DB.prepare('SELECT count FROM rate_limits WHERE bucket=?').bind(bucket).first(); const n=(r?.count||0)+1; if(r) await env.DB.prepare('UPDATE rate_limits SET count=? WHERE bucket=?').bind(n,bucket).run(); else await env.DB.prepare('INSERT INTO rate_limits(bucket,count,created_at) VALUES(?,?,datetime("now"))').bind(bucket,n).run(); return n<=limit; }catch{return true} }
async function sendEmail(env,to,subject,html){
  if(!env.RESEND_API_KEY) return {ok:false,missing:true,message:'RESEND_API_KEY ausente'};
  const from=env.EMAIL_FROM||'LumaPage AI <onboarding@resend.dev>';
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify({from,to,subject,html})});
  return await r.json();
}
async function mpCreatePix(env,{amount,email,title,userId,planId}){
  if(!env.MERCADO_PAGO_ACCESS_TOKEN) return {ok:false,error:'MERCADO_PAGO_ACCESS_TOKEN ausente'};
  const r=await fetch('https://api.mercadopago.com/v1/payments',{method:'POST',headers:{'content-type':'application/json','Authorization':'Bearer '+env.MERCADO_PAGO_ACCESS_TOKEN,'X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({transaction_amount:Number(amount),description:title,payment_method_id:'pix',payer:{email},external_reference:JSON.stringify({userId,planId})})});
  const data=await r.json(); return data;
}
async function geminiGenerate(env, prompt){
 if(!env.GEMINI_API_KEY) return {ok:false,error:'GEMINI_API_KEY ausente'};
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+env.GEMINI_API_KEY,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.75,maxOutputTokens:1400}})});
 return await r.json();
}
async function ensureDefaults(env){
 const plans = await env.DB.prepare('SELECT COUNT(*) c FROM plans').first();
 if(!plans || plans.c===0){
  const seed=[['start','Start','9.90',1,'1 página, QR Code Pix, botão WhatsApp, link público'],['pro','Pro','19.90',5,'5 páginas, IA avançada, analytics, suporte'],['business','Business','39.90',20,'20 páginas, domínio próprio, marca removida, prioridade']];
  for(const p of seed) await env.DB.prepare('INSERT OR IGNORE INTO plans(id,name,price,limit_pages,features,active,created_at) VALUES(?,?,?,?,?,1,datetime("now"))').bind(...p).run();
 }
}
export async function onRequest(context){
 const {request, env}=context; const url=new URL(request.url); const path=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
 try{
  if(!env.DB) return err('D1 não vinculado. Vincule o banco como DB.',500);
  await ensureDefaults(env);
  if(path==='health') return json({ok:true,service:'LumaPage AI',time:new Date().toISOString()});
  if(path==='plans' && request.method==='GET'){ const {results}=await env.DB.prepare('SELECT * FROM plans WHERE active=1 ORDER BY price ASC').all(); return json({ok:true,plans:results}); }
  if(path==='auth/register' && request.method==='POST'){
   if(!(await rateLimit(env,request,'register',8))) return err('Muitas tentativas. Aguarde um minuto.',429);
   const b=await readJson(request); const email=String(b.email||'').trim().toLowerCase();
   if(!b.name||!email||!b.phone||!b.password) return err('Preencha nome, e-mail, WhatsApp e senha.');
   if(!strongPassword(b.password)) return err('Senha fraca. Use 8+ caracteres com maiúscula, minúscula, número e símbolo.');
   const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists) return err('E-mail já cadastrado.',409);
   const id=crypto.randomUUID(); await env.DB.prepare('INSERT INTO users(id,name,email,phone,password_hash,plan_id,status,created_at) VALUES(?,?,?,?,?,?,?,datetime("now"))').bind(id,b.name,email,b.phone,await hashPassword(b.password),'start','active').run();
   await log(env,'register','Novo cliente cadastrado',{email});
   return json({ok:true,token:await signJWT({role:'client',userId:id},env.JWT_SECRET||'troque-este-segredo'),user:{id,name:b.name,email,phone:b.phone,plan_id:'start',status:'active'}})
  }
  if(path==='auth/login' && request.method==='POST'){
   if(!(await rateLimit(env,request,'login',12))) return err('Muitas tentativas de login. Aguarde.',429);
   const b=await readJson(request); const email=String(b.email||'').trim().toLowerCase();
   if(email===(env.ADMIN_EMAIL||'varejaoeverton@gmail.com').toLowerCase() && env.ADMIN_PASSWORD && b.password===env.ADMIN_PASSWORD){ await log(env,'admin_login','Admin entrou'); return json({ok:true,role:'admin',token:await signJWT({role:'admin'},env.JWT_SECRET||'troque-este-segredo')}); }
   const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(); if(!u || !(await verifyPassword(b.password,u.password_hash))) return err('Login inválido.',401);
   if(u.status!=='active') return err('Conta bloqueada. Fale com o suporte.',403);
   await log(env,'client_login','Cliente entrou',{userId:u.id});
   return json({ok:true,role:'client',token:await signJWT({role:'client',userId:u.id},env.JWT_SECRET||'troque-este-segredo'),user:{id:u.id,name:u.name,email:u.email,phone:u.phone,plan_id:u.plan_id,status:u.status}});
  }
  if(path==='auth/forgot' && request.method==='POST'){
   const b=await readJson(request); const email=String(b.email||'').trim().toLowerCase(); const u=await env.DB.prepare('SELECT id,email,name FROM users WHERE email=?').bind(email).first();
   if(u){ const token=crypto.randomUUID()+crypto.randomUUID(); await env.DB.prepare('INSERT INTO password_resets(id,user_id,token,expires_at,used,created_at) VALUES(?,?,?,?,0,datetime("now"))').bind(crypto.randomUUID(),u.id,token,Date.now()+1000*60*30).run(); const app=env.APP_URL||url.origin; await sendEmail(env,u.email,'Redefinir senha — LumaPage AI',`<h2>Redefinição de senha</h2><p>Olá, ${u.name}. Clique no link abaixo para criar uma nova senha:</p><p><a href="${app}/?reset=${encodeURIComponent(token)}">Redefinir senha</a></p><p>Este link expira em 30 minutos.</p>`); }
   return json({ok:true,message:'Se o e-mail existir, enviaremos um link seguro de recuperação.'});
  }
  if(path==='auth/reset' && request.method==='POST'){
   const b=await readJson(request); if(!strongPassword(b.password)) return err('Senha fraca.'); const rec=await env.DB.prepare('SELECT * FROM password_resets WHERE token=? AND used=0').bind(b.token).first(); if(!rec||Number(rec.expires_at)<Date.now()) return err('Link inválido ou expirado.'); await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(b.password),rec.user_id).run(); await env.DB.prepare('UPDATE password_resets SET used=1 WHERE id=?').bind(rec.id).run(); await log(env,'password_reset','Senha redefinida',{userId:rec.user_id}); return json({ok:true});
  }
  const a=await auth(request,env);
  if(path==='me' && request.method==='GET'){ if(!a) return err('Não autorizado',401); if(a.role==='admin') return json({ok:true,role:'admin'}); const u=await env.DB.prepare('SELECT id,name,email,phone,plan_id,status,created_at FROM users WHERE id=?').bind(a.userId).first(); return json({ok:true,role:'client',user:u}); }
  if(path==='admin/overview' && request.method==='GET'){
   if(!a||a.role!=='admin') return err('Admin necessário',403);
   const users=await env.DB.prepare('SELECT COUNT(*) c FROM users').first(); const pages=await env.DB.prepare('SELECT COUNT(*) c FROM pages').first(); const payments=await env.DB.prepare('SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM payments WHERE status="approved"').first(); const logs=await env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20').all();
   return json({ok:true,stats:{users:users.c,pages:pages.c,payments:payments.c,revenue:payments.total},logs:logs.results});
  }
  if(path==='admin/users' && request.method==='GET'){ if(!a||a.role!=='admin') return err('Admin necessário',403); const {results}=await env.DB.prepare('SELECT id,name,email,phone,plan_id,status,created_at FROM users ORDER BY created_at DESC').all(); return json({ok:true,users:results}); }
  if(path==='admin/users/status' && request.method==='POST'){ if(!a||a.role!=='admin') return err('Admin necessário',403); const b=await readJson(request); await env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(b.status,b.userId).run(); await log(env,'user_status','Status alterado',b); return json({ok:true}); }
  if(path==='admin/plans' && request.method==='POST'){ if(!a||a.role!=='admin') return err('Admin necessário',403); const b=await readJson(request); await env.DB.prepare('INSERT INTO plans(id,name,price,limit_pages,features,active,created_at) VALUES(?,?,?,?,?,1,datetime("now")) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,limit_pages=excluded.limit_pages,features=excluded.features,active=excluded.active').bind(slugify(b.id||b.name),b.name,Number(b.price),Number(b.limit_pages||1),b.features||'').run(); return json({ok:true}); }
  if(path==='admin/settings' && request.method==='POST'){ if(!a||a.role!=='admin') return err('Admin necessário',403); const b=await readJson(request); const allowed=['support_whatsapp','brand_name','mercadopago_public_note','gemini_status','email_status']; for(const k of allowed){ if(k in b) await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,String(b[k])).run(); } return json({ok:true}); }
  if(path==='admin/test/email' && request.method==='POST'){ if(!a||a.role!=='admin') return err('Admin necessário',403); const b=await readJson(request); return json({ok:true,result:await sendEmail(env,b.to||env.ADMIN_EMAIL||'teste@email.com','Teste LumaPage AI','<p>E-mail de teste funcionando.</p>')}); }
  if(path==='admin/test/gemini' && request.method==='POST'){ if(!a||a.role!=='admin') return err('Admin necessário',403); return json({ok:true,result:await geminiGenerate(env,'Responda apenas: Gemini conectado com sucesso.')}); }
  if(path==='pages' && request.method==='GET'){ if(!a) return err('Não autorizado',401); const q=a.role==='admin'?'SELECT * FROM pages ORDER BY created_at DESC':'SELECT * FROM pages WHERE user_id=? ORDER BY created_at DESC'; const stmt=env.DB.prepare(q); const {results}= a.role==='admin' ? await stmt.all() : await stmt.bind(a.userId).all(); return json({ok:true,pages:results}); }
  if(path==='pages/create' && request.method==='POST'){
   if(!a||a.role!=='client') return err('Cliente necessário',401); const b=await readJson(request); const plan=await env.DB.prepare('SELECT limit_pages FROM plans WHERE id=(SELECT plan_id FROM users WHERE id=?)').bind(a.userId).first(); const cnt=await env.DB.prepare('SELECT COUNT(*) c FROM pages WHERE user_id=?').bind(a.userId).first(); if(plan && cnt.c>=plan.limit_pages) return err('Limite do plano atingido. Faça upgrade para criar mais páginas.',402);
   let slug=slugify(b.businessName||b.title); const exists=await env.DB.prepare('SELECT id FROM pages WHERE slug=?').bind(slug).first(); if(exists) slug+='-'+crypto.randomUUID().slice(0,5); const content={businessName:b.businessName,title:b.title||b.businessName,segment:b.segment||'Negócio local',whatsapp:b.whatsapp||'',city:b.city||'',headline:b.headline||`Página profissional para ${b.businessName}`,image:b.image||'',style:b.style||'premium'}; const id=crypto.randomUUID(); await env.DB.prepare('INSERT INTO pages(id,user_id,title,slug,segment,content,published,visits,clicks,created_at) VALUES(?,?,?,?,?,?,1,0,0,datetime("now"))').bind(id,a.userId,content.title,slug,content.segment,JSON.stringify(content)).run(); await log(env,'page_create','Página criada',{userId:a.userId,slug}); return json({ok:true,page:{id,slug,publicUrl:'/p/'+slug,...content}});
  }
  if(path==='ai/generate' && request.method==='POST'){
   if(!a||a.role!=='client') return err('Cliente necessário',401); const b=await readJson(request); const prompt=`Crie JSON válido para uma landing page em português. Campos: headline, subheadline, benefits(array 4), faq(array 4 objetos q/a), cta. Negócio: ${JSON.stringify(b)}`; const result=await geminiGenerate(env,prompt); return json({ok:true,result});
  }
  if(path==='payments/pix' && request.method==='POST'){
   if(!a||a.role!=='client') return err('Cliente necessário',401); const b=await readJson(request); const plan=await env.DB.prepare('SELECT * FROM plans WHERE id=? AND active=1').bind(b.planId||'pro').first(); if(!plan) return err('Plano inválido'); const u=await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(a.userId).first(); const mp=await mpCreatePix(env,{amount:plan.price,email:u.email,title:'Plano '+plan.name+' — LumaPage AI',userId:a.userId,planId:plan.id}); const qr=mp?.point_of_interaction?.transaction_data?.qr_code; const qr64=mp?.point_of_interaction?.transaction_data?.qr_code_base64; await env.DB.prepare('INSERT INTO payments(id,user_id,plan_id,mp_payment_id,status,amount,qr_code,qr_code_base64,created_at) VALUES(?,?,?,?,?,?,?,?,datetime("now"))').bind(crypto.randomUUID(),a.userId,plan.id,String(mp.id||''),mp.status||'pending',Number(plan.price),qr||'',qr64||'').run(); return json({ok:true,plan,mercadopago:mp,qr_code:qr,qr_code_base64:qr64,payment_id:mp.id,status:mp.status});
  }
  if(path==='payments' && request.method==='GET'){ if(!a) return err('Não autorizado',401); const {results}= a.role==='admin' ? await env.DB.prepare('SELECT * FROM payments ORDER BY created_at DESC').all() : await env.DB.prepare('SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC').bind(a.userId).all(); return json({ok:true,payments:results}); }
  if(path==='webhook/mercadopago' && request.method==='POST'){
   const b=await readJson(request); const paymentId=b?.data?.id||b?.id; if(!paymentId) return json({ok:true,ignored:true}); if(!env.MERCADO_PAGO_ACCESS_TOKEN) return err('MERCADO_PAGO_ACCESS_TOKEN ausente',500);
   const r=await fetch('https://api.mercadopago.com/v1/payments/'+paymentId,{headers:{Authorization:'Bearer '+env.MERCADO_PAGO_ACCESS_TOKEN}}); const pay=await r.json(); let ext={}; try{ext=JSON.parse(pay.external_reference||'{}')}catch{}; if(pay.status==='approved'&&ext.userId){ await env.DB.prepare('UPDATE users SET plan_id=?, status="active" WHERE id=?').bind(ext.planId||'pro',ext.userId).run(); await env.DB.prepare('UPDATE payments SET status="approved" WHERE mp_payment_id=?').bind(String(paymentId)).run(); await log(env,'payment_approved','Pagamento aprovado',{paymentId,userId:ext.userId,planId:ext.planId}); } return json({ok:true});
  }
  if(path.startsWith('public/page/') && request.method==='GET'){
   const slug=path.split('/').pop(); const p=await env.DB.prepare('SELECT * FROM pages WHERE slug=? AND published=1').bind(slug).first(); if(!p) return err('Página não encontrada',404); await env.DB.prepare('UPDATE pages SET visits=visits+1 WHERE id=?').bind(p.id).run(); return json({ok:true,page:{...p,content:JSON.parse(p.content||'{}')}});
  }
  if(path.startsWith('public/click/') && request.method==='POST'){
   const slug=path.split('/').pop(); await env.DB.prepare('UPDATE pages SET clicks=clicks+1 WHERE slug=?').bind(slug).run(); return json({ok:true});
  }
  return err('Rota não encontrada: '+path,404);
 }catch(e){ return err(e.message||'Erro interno',500); }
}
