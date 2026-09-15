import { Router, type IRouter } from "express";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function toolbarHtml(tenantId: string, siteId: string): string {
  const safeTenant = JSON.stringify(tenantId);
  const safeSite = JSON.stringify(siteId);
  return `
<style id="vendorai-site2-toolbar-style">
#vendorai-site2-toolbar{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483646;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111827}
#vendorai-site2-toolbar .v2bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(15,23,42,.12);border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 18px 60px rgba(15,23,42,.18);backdrop-filter:blur(14px)}
#vendorai-site2-toolbar .v2title{font-weight:800;font-size:12px;margin-right:4px;white-space:nowrap}
#vendorai-site2-toolbar .v2score{display:flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap}
#vendorai-site2-toolbar .v2pill{padding:4px 7px;border-radius:999px;background:#f3f4f6;font-weight:700}
#vendorai-site2-toolbar select,#vendorai-site2-toolbar button{height:32px;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:0 9px;font-size:11px;font-weight:700;color:#111827}
#vendorai-site2-toolbar button{cursor:pointer}
#vendorai-site2-toolbar button:hover{background:#f9fafb}
#vendorai-site2-toolbar .v2ok{color:#047857}.v2bad{color:#b91c1c}.v2muted{color:#6b7280}
#vendorai-site2-toolbar .v2status{font-size:11px;min-width:120px}
#vendorai-site2-versions{display:none;margin-top:8px;max-height:220px;overflow:auto;padding:8px;border:1px solid rgba(15,23,42,.12);border-radius:12px;background:rgba(255,255,255,.98);box-shadow:0 14px 40px rgba(15,23,42,.16)}
#vendorai-site2-versions.open{display:block}
#vendorai-site2-versions .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px;border-bottom:1px solid #eee;font-size:11px}
#vendorai-site2-versions .row:last-child{border-bottom:0}
@media(max-width:640px){#vendorai-site2-toolbar{left:8px;right:8px;bottom:8px}#vendorai-site2-toolbar .v2bar{gap:7px;padding:8px}#vendorai-site2-toolbar .v2score{width:100%;overflow-x:auto}}
</style>
<div id="vendorai-site2-toolbar" aria-label="Controles do Site Generator 2.0">
  <div class="v2bar">
    <span class="v2title">Site Generator 2.0</span>
    <span id="v2scores" class="v2score v2muted">Analisando qualidade…</span>
    <select id="v2motion" aria-label="Movimento do site">
      <option value="auto">Automático IA</option>
      <option value="subtle">Sutil</option>
      <option value="dynamic">Dinâmico</option>
      <option value="cinematic">Cinematográfico</option>
      <option value="none">Sem animação</option>
    </select>
    <button type="button" id="v2versionsBtn">Versões</button>
    <button type="button" id="v2refreshBtn">Reanalisar</button>
    <span id="v2status" class="v2status v2muted"></span>
  </div>
  <div id="vendorai-site2-versions"></div>
</div>
<script id="vendorai-site2-toolbar-runtime">(function(){
  var tenantId=${safeTenant},siteId=${safeSite};
  var token='';try{token=parent.localStorage.getItem('vendorai_token')||localStorage.getItem('vendorai_token')||''}catch(e){}
  var headers={'Content-Type':'application/json'};if(token)headers.Authorization='Bearer '+token;
  var statusEl=document.getElementById('v2status'),scoresEl=document.getElementById('v2scores'),motion=document.getElementById('v2motion'),versionsBox=document.getElementById('vendorai-site2-versions');
  function setStatus(t,ok){statusEl.textContent=t||'';statusEl.className='v2status '+(ok===true?'v2ok':ok===false?'v2bad':'v2muted')}
  function pill(label,value){return '<span class="v2pill">'+label+' '+value+'</span>'}
  async function loadQa(){setStatus('Analisando…');try{var r=await fetch('/api/tenants/'+tenantId+'/site-generator/'+siteId+'/qa',{headers:headers,cache:'no-store'});if(!r.ok)throw new Error('QA '+r.status);var d=await r.json(),q=d.qaScorecard||{};scoresEl.innerHTML=pill('Design',q.design??'-')+pill('SEO',q.seo??'-')+pill('Mobile',q.mobile??'-')+pill('Perf.',q.performance??'-')+pill('A11y',q.accessibility??'-');setStatus(q.approved?'Aprovado para publicar':'Ajustes recomendados',!!q.approved);if(d.director&&d.director.motionLevel&&motion.value==='auto')motion.setAttribute('data-resolved',d.director.motionLevel)}catch(e){setStatus('Não foi possível analisar',false)}}
  async function loadVersions(){versionsBox.classList.toggle('open');if(!versionsBox.classList.contains('open'))return;versionsBox.innerHTML='<div class="row">Carregando versões…</div>';try{var r=await fetch('/api/tenants/'+tenantId+'/site-generator/'+siteId+'/versions',{headers:headers,cache:'no-store'});if(!r.ok)throw new Error('Versions '+r.status);var d=await r.json(),list=d.versions||[];if(!list.length){versionsBox.innerHTML='<div class="row">Ainda não há versões anteriores.</div>';return}versionsBox.innerHTML=list.map(function(v){return '<div class="row"><span><strong>'+new Date(v.createdAt).toLocaleString('pt-BR')+'</strong><br><span class="v2muted">'+(v.note||v.reason||'versão')+'</span></span><button data-v2restore="'+v.id+'">Restaurar</button></div>'}).join('');versionsBox.querySelectorAll('[data-v2restore]').forEach(function(btn){btn.addEventListener('click',async function(){if(!confirm('Restaurar esta versão? A versão atual será preservada no histórico.'))return;setStatus('Restaurando…');var rr=await fetch('/api/tenants/'+tenantId+'/site-generator/'+siteId+'/versions/'+btn.getAttribute('data-v2restore')+'/restore',{method:'POST',headers:headers});if(!rr.ok){setStatus('Falha ao restaurar',false);return}setStatus('Versão restaurada',true);location.reload()})})}catch(e){versionsBox.innerHTML='<div class="row v2bad">Não foi possível carregar versões.</div>'}}
  motion.addEventListener('change',async function(){setStatus('Aplicando movimento…');try{var r=await fetch('/api/tenants/'+tenantId+'/site-generator/'+siteId+'/motion',{method:'PATCH',headers:headers,body:JSON.stringify({level:motion.value})});if(!r.ok)throw new Error('Motion '+r.status);setStatus('Movimento salvo. Use o chat para refinar se quiser.',true)}catch(e){setStatus('Falha ao salvar movimento',false)}});
  document.getElementById('v2versionsBtn').addEventListener('click',loadVersions);
  document.getElementById('v2refreshBtn').addEventListener('click',loadQa);
  loadQa();
})();</script>`;
}

router.use((req, res, next) => {
  const match = req.method === "GET"
    ? req.path.match(/^\/tenants\/([^/]+)\/site-generator\/([^/]+)\/preview$/)
    : null;
  if (!match) return next();
  const tenantId = match[1]!;
  const siteId = match[2]!;
  if (!canAccess(req, tenantId)) return next();

  const originalSend = res.send.bind(res);
  let injected = false;
  (res as any).send = (body: any) => {
    if (injected || typeof body !== "string" || !/<html|<body|<!doctype/i.test(body)) return originalSend(body);
    injected = true;
    const toolbar = toolbarHtml(tenantId, siteId);
    const nextBody = /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${toolbar}</body>`) : `${body}${toolbar}`;
    return originalSend(nextBody);
  };
  next();
});

export default router;
