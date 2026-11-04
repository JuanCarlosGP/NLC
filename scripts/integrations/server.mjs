import http from 'node:http';
import https from 'node:https';
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntegrationError, WHOOP_SCOPES, requestJson, collectWhoop, collectMercury, normalizeWhoop, normalizeMercury } from './providers.mjs';
import { demoSnapshot } from './demo.mjs';
import { validateSnapshot, parseSnapshot } from '../../src/lib/integrations/model.ts';

export async function createIntegrationService({ directory = path.join(homedir(), '.local/share/nlc/integrations'), env = process.env, fetchImpl = fetch, port = Number(env.NLC_INTEGRATIONS_PORT || 8087) } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory,0o700);
  const origin = env.NLC_APP_ORIGIN || 'http://127.0.0.1:8084';
  const appUrl = new URL(origin); if (!['127.0.0.1','localhost','[::1]'].includes(appUrl.hostname) || appUrl.origin !== origin) throw new Error('NLC_APP_ORIGIN must be an exact loopback origin');
  const tls = !!env.NLC_TLS_CERT;
  const base = `${tls ? 'https' : 'http'}://127.0.0.1:${port}`;
  const redirect = env.WHOOP_REDIRECT_URI || `${base}/whoop/callback`;
  // Only a callback through this local service is supported. No public listener.
  const callback = new URL(redirect);
  if (!['127.0.0.1','localhost','[::1]'].includes(callback.hostname) || callback.pathname !== '/whoop/callback' || callback.search || callback.hash || callback.username || callback.password || callback.protocol !== (tls ? 'https:' : 'http:') || Number(callback.port || (tls ? 443 : 80)) !== port) throw new Error('WHOOP_REDIRECT_URI must point to this loopback service at /whoop/callback');
  const read = async name => { try { return await readFile(path.join(directory,name),'utf8'); } catch(error) { if(error.code === 'ENOENT') return null; throw error; } };
  async function atomic(name, text) { const target = path.join(directory,name); const temp = `${target}.${randomBytes(8).toString('hex')}.tmp`; try { await writeFile(temp,text,{mode:0o600,flag:'wx'}); await rename(temp,target); } finally { await unlink(temp).catch(()=>{}); } }
  let key; const savedKey = await read('token-key');
  if (savedKey) key = Buffer.from(savedKey,'base64'); else { key = randomBytes(32); await writeFile(path.join(directory,'token-key'),key.toString('base64'),{mode:0o600,flag:'wx'}); }
  if (key.length !== 32) throw new Error('Invalid integration token key');
  function encrypt(value) { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]); return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),bytes:bytes.toString('base64')}); }
  function decrypt(text) { const data=JSON.parse(text); const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'base64')); decipher.setAuthTag(Buffer.from(data.tag,'base64')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.bytes,'base64')),decipher.final()]).toString('utf8')); }
  let tokens; const tokenText = await read('whoop-tokens.enc'); if(tokenText) tokens=decrypt(tokenText);
  const cache = {}; for (const provider of ['whoop','mercury']) { const text=await read(`${provider}.json`); cache[provider]=text ? parseSnapshot(text,provider) : null; }
  const busy = new Set(); const errors = {}; const states = new Map();
  function missing(provider) { return (provider === 'whoop' ? ['WHOOP_CLIENT_ID','WHOOP_CLIENT_SECRET'] : ['MERCURY_API_TOKEN']).filter(name=>!env[name]?.trim()); }
  const status = provider => ({ configured: missing(provider).length===0, connected: provider==='whoop' ? !!tokens : missing(provider).length===0, missing:missing(provider), busy:busy.has(provider), lastSync:cache[provider]?.syncedAt || null, error:errors[provider] || null, automaticMinutes: Number(env.NLC_SYNC_MINUTES || 0) });
  async function exclusive(provider,task) { if(busy.has(provider)) throw new IntegrationError('busy',409); busy.add(provider); try{return await task();}finally{busy.delete(provider);} }
  async function tokenRequest(params) {
    const result=await requestJson('https://api.prod.whoop.com/oauth/oauth2/token',{ fetchImpl,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({...params,client_id:env.WHOOP_CLIENT_ID,client_secret:env.WHOOP_CLIENT_SECRET}) });
    if(typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' || !Number.isFinite(result.expires_in) || result.expires_in<=0) throw new IntegrationError('invalid');
    const next={access:result.access_token,refresh:result.refresh_token,expires:Date.now()+result.expires_in*1000};
    await atomic('whoop-tokens.enc',encrypt(next)); tokens=next; return next;
  }
  async function sync(provider) { return exclusive(provider,async()=>{
    try {
      if(missing(provider).length) throw new IntegrationError('configure',400);
      let snapshot;
      if(provider==='whoop') {
        if(!tokens) throw new IntegrationError('connect',400);
        if(tokens.expires<Date.now()+60000) await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh});
        let raw;
        try {raw=await collectWhoop(tokens.access,fetchImpl);}catch(error){ if(error.code!=='auth')throw error; await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh}); raw=await collectWhoop(tokens.access,fetchImpl); }
        snapshot=normalizeWhoop(raw,new Date().toISOString());
      } else snapshot=normalizeMercury(await collectMercury(env.MERCURY_API_TOKEN.trim(),fetchImpl),new Date().toISOString());
      validateSnapshot(snapshot,provider); if(Buffer.byteLength(JSON.stringify(snapshot))>16*1024*1024) throw new IntegrationError('size');
      // All endpoints and every page must succeed before replacing the last good copy.
      await atomic(`${provider}.json`,JSON.stringify(snapshot)); cache[provider]=snapshot; errors[provider]=null; return snapshot;
    }catch(error){const safe=error instanceof IntegrationError?error:new IntegrationError('storage',500);errors[provider]=safe.code;throw safe;}
  }); }
  function reply(res,status,body,headers={}) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(body));}
  async function handler(req,res) {
    const allowedHosts = new Set([`127.0.0.1:${port}`,`localhost:${port}`,`[::1]:${port}`]);
    if(!allowedHosts.has(req.headers.host)) return reply(res,403,{error:'origin'});
    const url = new URL(req.url,base);
    if(url.pathname === '/whoop/callback' && req.method==='GET') {
      let success=false;
      try {
        const cookie=/(?:^|;\s*)nlc_whoop=([a-zA-Z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
        const pending=cookie?states.get(cookie):null; if(cookie)states.delete(cookie);
        const state=url.searchParams.get('state') || '';
        if(!pending || pending.expires<Date.now() || state.length!==pending.state.length || !timingSafeEqual(Buffer.from(state),Buffer.from(pending.state))) throw new IntegrationError('state',400);
        if(url.searchParams.has('error') || !url.searchParams.get('code')) throw new IntegrationError('consent',400);
        await exclusive('whoop',()=>tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:redirect})); errors.whoop=null; success=true;
      }catch(error){ errors.whoop=error instanceof IntegrationError?error.code:'auth'; }
      const target=`${origin}/health/whoop`;
      res.writeHead(success?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'Set-Cookie':`nlc_whoop=; HttpOnly; SameSite=Lax; Path=/whoop/callback; Max-Age=0${tls?'; Secure':''}`});
      return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>NLC · WHOOP</title><body style="background:#000;color:#fff;font:16px monospace;padding:32px"><h1>${success?'WHOOP conectado':'No se pudo conectar'}</h1><p>${success?'Vuelve a NLC para sincronizar.':'Vuelve a NLC e inténtalo de nuevo.'}</p><a style="color:#fff" href="${target}">Volver a NLC</a></body>`);
    }
    if(req.headers.origin!==origin) return reply(res,403,{error:'origin'});
    const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true',Vary:'Origin'};
    if(req.method==='OPTIONS') {res.writeHead(204,{...cors,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'X-NLC-Client, Content-Type','Access-Control-Max-Age':'600'});return res.end();}
    if(req.headers['x-nlc-client']!=='1') return reply(res,403,{error:'origin'},cors);
    if(req.method==='GET' && url.pathname==='/status') return reply(res,200,{whoop:status('whoop'),mercury:status('mercury')},cors);
    const match=/^\/(whoop|mercury)\/(snapshot|sync|example|connect|disconnect)$/.exec(url.pathname);
    if(!match) return reply(res,404,{error:'notFound'},cors);
    const [,provider,action]=match;
    try {
      if(action==='snapshot' && req.method==='GET') return reply(res,200,cache[provider],cors);
      if(req.method!=='POST') return reply(res,405,{error:'method'},cors);
      if(action==='example') return reply(res,200,demoSnapshot(provider),cors);
      if(action==='sync') return reply(res,200,await sync(provider),cors);
      if(action==='connect' && provider==='whoop') {
        if(missing(provider).length)throw new IntegrationError('configure',400);
        for(const [cookie,pending] of states)if(pending.expires<Date.now())states.delete(cookie);
        if(states.size>=50)throw new IntegrationError('busy',429);
        const cookie=randomBytes(32).toString('base64url'); const state=randomBytes(32).toString('base64url'); states.set(cookie,{state,expires:Date.now()+10*60000});
        const auth=new URL('https://api.prod.whoop.com/oauth/oauth2/auth'); Object.entries({response_type:'code',client_id:env.WHOOP_CLIENT_ID,redirect_uri:redirect,scope:WHOOP_SCOPES,state}).forEach(([k,v])=>auth.searchParams.set(k,v));
        return reply(res,200,{url:auth.href},{...cors,'Set-Cookie':`nlc_whoop=${cookie}; HttpOnly; SameSite=Lax; Path=/whoop/callback; Max-Age=600${tls?'; Secure':''}`});
      }
      if(action==='disconnect' && provider==='whoop') {await exclusive(provider,async()=>{await unlink(path.join(directory,'whoop-tokens.enc')).catch(error=>{if(error.code!=='ENOENT')throw error;});tokens=null;errors.whoop=null;});return reply(res,200,{ok:true},cors);}
      return reply(res,404,{error:'notFound'},cors);
    }catch(error){return reply(res,error instanceof IntegrationError?error.status:500,{error:error instanceof IntegrationError?error.code:'storage'},cors);}
  }
  const listener=(req,res)=>{void handler(req,res).catch(()=>{if(!res.headersSent)reply(res,500,{error:'storage'});else res.end();});};
  const server=tls?https.createServer({cert:await readFile(env.NLC_TLS_CERT),key:await readFile(env.NLC_TLS_KEY)},listener):http.createServer(listener);
  server.requestTimeout=600000; server.headersTimeout=30000;
  const minutes=Number(env.NLC_SYNC_MINUTES || 0); if(!Number.isFinite(minutes) || (minutes!==0 && minutes<15))throw new Error('NLC_SYNC_MINUTES must be 0 or at least 15');
  const timer=minutes?setInterval(()=>{for(const provider of ['whoop','mercury'])if(status(provider).connected&&!busy.has(provider))void sync(provider).catch(()=>{});},minutes*60000):null; timer?.unref();
  server.on('close',()=>{if(timer)clearInterval(timer);});
  return { server, sync, status, directory };
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const lockDirectory=process.env.NLC_INTEGRATIONS_DIR || path.join(homedir(),'.local/share/nlc/integrations');
  await mkdir(lockDirectory,{recursive:true,mode:0o700});
  const lockFile=path.join(lockDirectory,'service.lock');
  async function acquire() { try {await writeFile(lockFile,String(process.pid),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;const pid=Number(await readFile(lockFile,'utf8'));if(!Number.isSafeInteger(pid)||pid<1)throw new Error('Invalid integration lock');try{process.kill(pid,0);}catch(check){if(check.code==='ESRCH'){await unlink(lockFile);return acquire();}throw check;}throw new Error('An integration service is already using this directory');} }
  await acquire();
  let released=false;async function release(){if(released)return;released=true;await unlink(lockFile).catch(()=>{});}
  try {
    const service=await createIntegrationService({directory:lockDirectory});
    service.server.listen(Number(process.env.NLC_INTEGRATIONS_PORT || 8087),'127.0.0.1',()=>console.log('NLC integrations ready on loopback. Credentials stay in this service.'));
    service.server.on('error',()=>{console.error('NLC integrations could not start. Check the local port and configuration.');void release();process.exitCode=1;});
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{service.server.close();void release().then(()=>process.exit(0));});
  }catch(error){await release();throw error;}
}
