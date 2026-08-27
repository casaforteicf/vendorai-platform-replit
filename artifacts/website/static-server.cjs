const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const port = process.env.PORT || 19161;
const SITE_ORIGIN = 'https://appvendorai.com';

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

const ROUTE_SEO = {
  '/': {
    title: 'Vendor.ai — CRM com IA para WhatsApp e Instagram | PMEs Brasileiras',
    description: 'Sistema Operacional Empresarial com IA para PMEs. Prospecção, atendimento, orçamento e fechamento direto no WhatsApp e Instagram, com agentes de IA trabalhando 24/7.',
    index: true,
  },
  '/funcionalidades': {
    title: 'Funcionalidades Vendor.ai — CRM e Agentes de IA para Vendas',
    description: 'Conheça os recursos da Vendor.ai para atendimento, vendas, automação comercial, WhatsApp, Instagram e operação empresarial com IA.',
    index: true,
  },
  '/precos': {
    title: 'Preços e Planos Vendor.ai — CRM com IA para Empresas',
    description: 'Conheça os planos da Vendor.ai e escolha a estrutura de CRM, automação e agentes de IA adequada à sua operação.',
    index: true,
  },
  '/sobre': {
    title: 'Sobre a Vendor.ai — Inteligência Artificial para Operações Comerciais',
    description: 'Conheça a Vendor.ai e a proposta de unir CRM, automação e agentes de IA em uma plataforma para operações comerciais.',
    index: true,
  },
  '/contato': {
    title: 'Contato Vendor.ai — Fale com Nossa Equipe',
    description: 'Fale com a equipe Vendor.ai para conhecer a plataforma, tirar dúvidas e avaliar a aplicação no seu negócio.',
    index: true,
  },
  '/blog': {
    title: 'Blog Vendor.ai — Vendas, CRM, WhatsApp e Inteligência Artificial',
    description: 'Conteúdos da Vendor.ai sobre vendas, CRM, automação, WhatsApp, atendimento e inteligência artificial aplicada a negócios.',
    index: true,
  },
  '/cadastro-praca': {
    title: 'Cadastro PraçaAI — Vendor.ai',
    description: 'Página de cadastro operacional do PraçaAI.',
    index: false,
  },
  '/privacy': {
    title: 'Política de Privacidade — Vendor.ai',
    description: 'Política de Privacidade da Vendor.ai.',
    index: false,
  },
  '/terms': {
    title: 'Termos de Uso — Vendor.ai',
    description: 'Termos de Uso da Vendor.ai.',
    index: false,
  },
};

// ── Vertical SEO (SSR injection per slug) ───────────────────────────────────
const VERTICAL_SEO = {
  varejo: {
    title:       'Vendor.ai para Varejo e Atacado — CRM com IA no WhatsApp',
    description: 'Catálogo integrado, orçamento automático e reativação de carrinho abandonado direto no WhatsApp. Plataforma para lojas e atacados.',
  },
  b2b: {
    title:       'Vendor.ai para B2B e Serviços — Pipeline de Vendas Consultivas',
    description: 'Qualificação, propostas e automação comercial para consultorias, serviços e operações B2B.',
  },
  saude: {
    title:       'Vendor.ai para Clínicas e Consultórios — Atendimento e Agenda com IA',
    description: 'Atendimento, agendamento e automações para clínicas e consultórios com recursos de inteligência artificial.',
  },
  beauty: {
    title:       'Vendor.ai para Salões e Estúdios de Beleza — Agenda Inteligente',
    description: 'Agenda, atendimento e automações comerciais para salões, estúdios e negócios de beleza.',
  },
  imoveis: {
    title:       'Vendor.ai para Imobiliárias e Construtoras — Qualificação de Leads',
    description: 'Qualificação e acompanhamento de leads, automação de atendimento e CRM para imobiliárias e construtoras.',
  },
  arch: {
    title:       'Vendor.ai Arch — Projetos, Orçamento e Render com IA',
    description: 'Recursos de projeto, orçamento e render com IA para arquitetos, designers e operações de arquitetura.',
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function replaceOrInsert(html, pattern, replacement) {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace('</head>', `  ${replacement}\n  </head>`);
}

function injectRouteSEO(html, pathname, seo) {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  const url = `${SITE_ORIGIN}${normalizedPath === '/' ? '/' : normalizedPath}`;
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description || 'Vendor.ai');
  const robots = seo.index ? 'index, follow' : 'noindex, nofollow';

  let output = html;
  output = replaceOrInsert(output, /<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  output = replaceOrInsert(output, /<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}">`);
  output = replaceOrInsert(output, /<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${robots}">`);
  output = replaceOrInsert(output, /<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${url}">`);
  output = replaceOrInsert(output, /<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${url}">`);
  output = replaceOrInsert(output, /<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${title}">`);
  output = replaceOrInsert(output, /<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${description}">`);
  output = replaceOrInsert(output, /<meta\s+name=["']twitter:url["'][^>]*>/i, `<meta name="twitter:url" content="${url}">`);
  output = replaceOrInsert(output, /<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${title}">`);
  output = replaceOrInsert(output, /<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${description}">`);
  return output;
}

function injectVerticalSEO(html, slug) {
  const seo = VERTICAL_SEO[slug];
  if (!seo) {
    return injectRouteSEO(html, `/verticais/${slug}`, {
      title: 'Vertical não encontrada — Vendor.ai',
      description: 'A vertical informada não está disponível.',
      index: false,
    });
  }

  const url = `${SITE_ORIGIN}/verticais/${slug}`;
  const name = seo.title.split(' — ')[0];
  const breadcrumb = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Vendor.ai', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Verticais', item: `${SITE_ORIGIN}/#verticais` },
      { '@type': 'ListItem', position: 3, name, item: url },
    ],
  });

  let output = injectRouteSEO(html, `/verticais/${slug}`, { ...seo, index: true });
  output = output.replace('</head>', `<script type="application/ld+json">${breadcrumb}</script>\n</head>`);
  return output;
}

// ── Gzip helper ─────────────────────────────────────────────────────────────
const COMPRESSIBLE = new Set(['text/html', 'application/javascript', 'text/css',
  'application/json', 'application/xml', 'text/plain']);

function sendResponse(req, res, contentType, data, status, extraHeaders = {}) {
  const baseType = contentType.split(';')[0].trim();
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const headers = { 'Content-Type': contentType, ...extraHeaders };
  if (/\bgzip\b/.test(acceptEncoding) && COMPRESSIBLE.has(baseType)) {
    zlib.gzip(data, (err, compressed) => {
      if (err) {
        res.writeHead(status || 200, headers);
        res.end(data);
      } else {
        res.writeHead(status || 200, {
          ...headers,
          'Content-Encoding': 'gzip',
          'Vary': 'Accept-Encoding',
        });
        res.end(compressed);
      }
    });
  } else {
    res.writeHead(status || 200, headers);
    res.end(data);
  }
}

function serveSpaPage(req, res, pathname, seo, status = 200) {
  const indexPath = path.join(__dirname, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('Server Error');
      return;
    }
    const injected = injectRouteSEO(html, pathname, seo);
    const headers = seo.index ? {} : { 'X-Robots-Tag': 'noindex, nofollow' };
    sendResponse(req, res, 'text/html; charset=utf-8', Buffer.from(injected, 'utf8'), status, headers);
  });
}

// ── Request handler ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];

  // Remove /website/ prefix (Replit proxy)
  if (urlPath.startsWith('/website/')) {
    urlPath = urlPath.slice('/website'.length) || '/';
  }

  const pathname = urlPath === '/' ? '/' : urlPath.replace(/\/$/, '');

  if (pathname === '/demo') {
    urlPath = '/demo.html';
  } else if (pathname === '/parceiros') {
    urlPath = '/parceiros.html';
  } else if (pathname === '/') {
    urlPath = '/index.html';
  }

  // Vertical pages: server-side SEO metadata by allowlisted public slug.
  const vertMatch = pathname.match(/^\/verticais\/([^/]+)$/);
  if (vertMatch) {
    const slug = vertMatch[1];
    const htmlPath = path.join(__dirname, 'verticais.html');
    fs.readFile(htmlPath, 'utf8', (err, html) => {
      if (err) { res.writeHead(500); res.end('Server Error'); return; }
      const known = Boolean(VERTICAL_SEO[slug]);
      const injected = injectVerticalSEO(html, slug);
      sendResponse(
        req,
        res,
        'text/html; charset=utf-8',
        Buffer.from(injected, 'utf8'),
        known ? 200 : 404,
        known ? {} : { 'X-Robots-Tag': 'noindex, nofollow' },
      );
    });
    return;
  }

  // Known SPA marketing routes receive their own canonical + robots metadata.
  if (ROUTE_SEO[pathname] && pathname !== '/') {
    serveSpaPage(req, res, pathname, ROUTE_SEO[pathname]);
    return;
  }

  // Blog posts are public, while generated LPs stay noindex unless explicitly promoted.
  if (/^\/blog\/[^/]+$/.test(pathname)) {
    serveSpaPage(req, res, pathname, {
      title: 'Conteúdo Vendor.ai — Blog',
      description: 'Conteúdo da Vendor.ai sobre vendas, CRM, automação e inteligência artificial aplicada a negócios.',
      index: true,
    });
    return;
  }
  if (/^\/lp\/[^/]+$/.test(pathname)) {
    serveSpaPage(req, res, pathname, {
      title: 'Vendor.ai',
      description: 'Página de campanha Vendor.ai.',
      index: false,
    });
    return;
  }

  const filePath = path.join(__dirname, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Unknown routes must not become indexable duplicates of the homepage.
        serveSpaPage(req, res, pathname, {
          title: 'Página não encontrada — Vendor.ai',
          description: 'A página solicitada não foi encontrada.',
          index: false,
        }, 404);
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }

    const headers = pathname === '/demo'
      ? { 'X-Robots-Tag': 'noindex, nofollow' }
      : {};
    sendResponse(req, res, contentType, data, 200, headers);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static server running on http://0.0.0.0:${port}`);
});
