function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Injects a tiny first-party click collector into generated tenant sites at
 * response time, so already-published HTML benefits without regeneration.
 *
 * It records only anonymous navigation context. It does not store e-mail,
 * phone or IP and it never labels an outbound click as a lead/conversion.
 */
export function injectGeneratedSiteTouchpointTracking(
  html: string,
  siteIdentifier: string,
): string {
  if (!html || html.includes("data-vai-generated-touchpoints=\"v1\"")) return html;

  const script = `<script data-vai-generated-touchpoints="v1">(()=>{try{const K='vai_generated_site_session',A='vai_generated_site_attribution';let s=sessionStorage.getItem(K);if(!s){s=(globalThis.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));sessionStorage.setItem(K,s)}let a={};try{a=JSON.parse(sessionStorage.getItem(A)||'{}')}catch{}const q=new URLSearchParams(location.search);if(!Object.keys(a).length){a={utmSource:q.get('utm_source'),utmMedium:q.get('utm_medium'),utmCampaign:q.get('utm_campaign'),utmContent:q.get('utm_content'),utmTerm:q.get('utm_term'),gclid:q.get('gclid'),fbclid:q.get('fbclid'),landingPageSlug:${jsString(siteIdentifier)},firstPageUrl:location.href,firstReferrer:document.referrer||null};sessionStorage.setItem(A,JSON.stringify(a))}const channel=u=>{const h=u.hostname.toLowerCase();if(h==='wa.me'||h==='api.whatsapp.com'||h==='web.whatsapp.com')return'whatsapp';if(h==='instagram.com'||h.endsWith('.instagram.com'))return'instagram';if(h==='m.me'||h==='messenger.com'||h.endsWith('.messenger.com'))return'messenger';return null};document.addEventListener('click',e=>{const el=e.target instanceof Element?e.target.closest('a[href]'):null;if(!el)return;let u;try{u=new URL(el.href,location.href)}catch{return}const c=channel(u);if(!c)return;const p={anonymousSessionId:s,channel:c,targetHost:u.hostname,pageUrl:location.href,path:location.pathname,referrer:document.referrer||null,siteIdentifier:${jsString(siteIdentifier)},utmSource:a.utmSource||null,utmMedium:a.utmMedium||null,utmCampaign:a.utmCampaign||null,utmContent:a.utmContent||null,utmTerm:a.utmTerm||null,gclid:a.gclid||null,fbclid:a.fbclid||null};const b=new Blob([JSON.stringify(p)],{type:'application/json'});try{navigator.sendBeacon('/api/generated-site/touchpoint',b)}catch{fetch('/api/generated-site/touchpoint',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(()=>{})}},true)}catch{}})()</script>`;

  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${script}</body>`);
  }
  return `${html}${script}`;
}
