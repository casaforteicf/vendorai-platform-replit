function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Injects first-party Site Intelligence into generated tenant sites at response
 * time, so already-published HTML benefits without regeneration.
 *
 * It records anonymous navigation and conversion-intent events only. Form field
 * values, e-mail, phone and IP are never copied into the telemetry payload.
 */
export function injectGeneratedSiteTouchpointTracking(
  html: string,
  siteIdentifier: string,
): string {
  if (!html || html.includes("data-vai-generated-touchpoints=\"v2\"")) return html;

  // Remove the v1 collector when an old generated document happened to persist
  // it. Normally tracking is response-time only, but this keeps the upgrade
  // idempotent for every historical site.
  const withoutV1 = html.replace(
    /<script\s+data-vai-generated-touchpoints=["']v1["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );

  const script = `<script data-vai-generated-touchpoints="v2">(()=>{try{const K='vai_generated_site_session',A='vai_generated_site_attribution';let s=sessionStorage.getItem(K);if(!s){s=(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));sessionStorage.setItem(K,s)}let a={};try{a=JSON.parse(sessionStorage.getItem(A)||'{}')}catch{}const q=new URLSearchParams(location.search);if(!Object.keys(a).length){a={utmSource:q.get('utm_source'),utmMedium:q.get('utm_medium'),utmCampaign:q.get('utm_campaign'),utmContent:q.get('utm_content'),utmTerm:q.get('utm_term'),gclid:q.get('gclid'),fbclid:q.get('fbclid'),landingPageSlug:${jsString(siteIdentifier)},firstPageUrl:location.href,firstReferrer:document.referrer||null};sessionStorage.setItem(A,JSON.stringify(a))}const base=(eventType,extra={})=>Object.assign({anonymousSessionId:s,eventType,pageUrl:location.href,path:location.pathname,referrer:document.referrer||null,siteIdentifier:${jsString(siteIdentifier)},utmSource:a.utmSource||null,utmMedium:a.utmMedium||null,utmCampaign:a.utmCampaign||null,utmContent:a.utmContent||null,utmTerm:a.utmTerm||null,gclid:a.gclid||null,fbclid:a.fbclid||null},extra);const send=(eventType,extra={})=>{const p=base(eventType,extra);const j=JSON.stringify(p);try{const b=new Blob([j],{type:'application/json'});if(navigator.sendBeacon('/api/generated-site/touchpoint',b))return}catch{}fetch('/api/generated-site/touchpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:j,keepalive:true}).catch(()=>{})};const channel=u=>{const h=u.hostname.toLowerCase();if(h==='wa.me'||h==='api.whatsapp.com'||h==='web.whatsapp.com')return'whatsapp';if(h==='instagram.com'||h.endsWith('.instagram.com'))return'instagram';if(h==='m.me'||h==='messenger.com'||h.endsWith('.messenger.com'))return'messenger';return null};send('page_view');document.addEventListener('submit',e=>{const f=e.target instanceof HTMLFormElement?e.target:null;send('form_submit',{targetHost:f&&f.action?(()=>{try{return new URL(f.action,location.href).hostname}catch{return location.hostname}})():location.hostname})},true);document.addEventListener('click',e=>{const el=e.target instanceof Element?e.target.closest('a[href]'):null;if(!el)return;let u;try{u=new URL(el.href,location.href)}catch{return}const c=channel(u);if(!c)return;send('cta_click',{channel:c,targetHost:u.hostname})},true)}catch{}})()</script>`;

  if (/<\/body\s*>/i.test(withoutV1)) {
    return withoutV1.replace(/<\/body\s*>/i, `${script}</body>`);
  }
  return `${withoutV1}${script}`;
}
