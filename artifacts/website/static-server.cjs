const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const port = process.env.PORT || 19161;

const mimeTypes = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript',
  '.css':   'text/css',
  '.json':  'application/json',
  '.xml':   'application/xml; charset=utf-8',
  '.txt':   'text/plain; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.gif':   'image/gif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff2': 'font/woff2',
  '.webp':  'image/webp',
};

// ── Vertical SEO (SSR injection per slug) ───────────────────────────────────
const VERTICAL_SEO = {
  varejo: {
    title:       'Vendor.ai para Varejo e Atacado — CRM com IA no WhatsApp',
    description: 'Catálogo integrado, orçamento automático e reativação de carrinho abandonado direto no WhatsApp. +40% de conversão para lojas e atacados.',
  },
  b2b: {
    title:       'Vendor.ai para B2B e Serviços — Pipeline de Vendas Consultivas',
    description: 'Qualificação por CNPJ, proposta com assinatura digital e agendamento automático. Ciclo de vendas 30% mais curto para consultorias e serviços B2B.',
  },
  saude: {
    title:       'Vendor.ai para Clínicas e Consultórios — Agenda e Prontuário com IA',
    description: 'Agendamento automático, lembrete de consulta e prontuário eletrônico com CID-10. 60% menos no-show para clínicas e consultórios.',
  },
  beauty: {
    title:       'Vendor.ai para Salões e Estúdios de Beleza — Agenda Inteligente',
    description: 'Agenda por profissional, lembretes automáticos e Revenue Scout para recompra. Sistema completo para salões e estúdios de estética.',
  },
  imoveis: {
    title:       'Vendor.ai para Imobiliárias e Construtoras — Qualificação de Leads',
    description: 'Qualifique cada lead antes de alocar um corretor. 3x mais aproveitamento do tráfego pago para imobiliárias e construtoras.',
  },
  arch: {
    title:       'Vendor.ai Arch — Orçamento e Render 3D com IA para Arquitetos',
    description: 'Orçamento automático, render fotorrealista com IA generativa e marketplace de materiais. Para arquitetos, designers e construtoras.',
  },
};

function injectVerticalSEO(html, slug) {
  const seo = VERTICAL_SEO[slug] || {
    title:       'Vendor.ai — Vertical',
    description: 'Conheça como a Vendor.ai atende o seu segmento com IA nativa.',
  };
  const url  = `https://appvendorai.com/verticais/${slug}`;
  const name = seo.title.split(' — ')[0];
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vendor.ai', item: 'https://appvendorai.com/' },
      { '@type': 'ListItem', position: 2, name: 'Verticais', item: 'https://appvendorai.com/#verticais' },
      { '@type': 'ListItem', position: 3, name: name, item: url },
    ],
  });

  return html
    .replace(
      '<title>Vendor.ai — Vertical</title>',
      `<title>${seo.title}</title>`
    )
    .replace(
      '<meta name="description" content="Conheça como a Vendor.ai atende o seu segmento com IA nativa.">',
      `<meta name="description" content="${seo.description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${seo.title}">
<meta property="og:description" content="${seo.description}">
<meta property="og:image" content="https://appvendorai.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Vendor.ai">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="${url}">
<meta name="twitter:title" content="${seo.title}">
<meta name="twitter:description" content="${seo.description}">
<meta name="twitter:image" content="https://appvendorai.com/og-image.png">
<script type="application/ld+json">${breadcrumb}</script>`
    );
}

// ── Gzip helper ─────────────────────────────────────────────────────────────
const COMPRESSIBLE = new Set(['text/html', 'application/javascript', 'text/css',
  'application/json', 'application/xml', 'text/plain']);

function sendResponse(req, res, contentType, data, status) {
  const baseType = contentType.split(';')[0].trim();
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (/\bgzip\b/.test(acceptEncoding) && COMPRESSIBLE.has(baseType)) {
    zlib.gzip(data, (err, compressed) => {
      if (err) {
        res.writeHead(status || 200, { 'Content-Type': contentType });
        res.end(data);
      } else {
        res.writeHead(status || 200, {
          'Content-Type': contentType,
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding',
        });
        res.end(compressed);
      }
    });
  } else {
    res.writeHead(status || 200, { 'Content-Type': contentType });
    res.end(data);
  }
}

// ── Request handler ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];

  // Remove /website/ prefix (Replit proxy)
  if (urlPath.startsWith('/website/')) {
    urlPath = urlPath.slice('/website'.length);
  }

  if (urlPath === '/' || urlPath === '')     urlPath = '/index.html';
  if (urlPath === '/demo')                   urlPath = '/demo.html';
  if (urlPath === '/parceiros' || urlPath === '/parceiros/') urlPath = '/parceiros.html';

  // Vertical pages: SSR SEO injection by slug
  const vertMatch = urlPath.match(/^\/verticais\/([^/]+)\/?$/);
  if (vertMatch) {
    const slug = vertMatch[1];
    const htmlPath = path.join(__dirname, 'verticais.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end('Server Error'); return; }
      const injected = injectVerticalSEO(html, slug);
      sendResponse(req, res, 'text/html; charset=utf-8', Buffer.from(injected, 'utf8'));
    });
    return;
  }

  const filePath = path.join(__dirname, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        const indexPath = path.join(__dirname, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
          } else {
            sendResponse(req, res, 'text/html; charset=utf-8', indexData);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }
    sendResponse(req, res, contentType, data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static server running on http://0.0.0.0:${port}`);
});
