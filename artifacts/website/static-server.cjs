const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 19161;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url;

  // Remove /website/ prefix if present
  if (urlPath.startsWith('/website/')) {
    urlPath = urlPath.replace('/website/', '/');
  }

  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  if (urlPath === '/demo') {
    urlPath = '/demo.html';
  }
  // Vertical pages: /verticais/:slug → serve verticais.html
  if (urlPath.match(/^\/verticais\/[^/]+\/?$/)) {
    urlPath = '/verticais.html';
  }
  // Parceiros page
  if (urlPath === '/parceiros' || urlPath === '/parceiros/') {
    urlPath = '/parceiros.html';
  }

  const filePath = path.join(__dirname, urlPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback: serve index.html for unknown routes
        const indexPath = path.join(__dirname, 'index.html');
        fs.readFile(indexPath, (indexErr, indexData) => {
          if (indexErr) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexData);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Static server running on http://0.0.0.0:${port}`);
});
