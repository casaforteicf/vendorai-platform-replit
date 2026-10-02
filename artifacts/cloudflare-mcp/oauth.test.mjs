import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

test('private OAuth: discovery, redirect restrictions, consent, PKCE, replay, refresh and revocation', { timeout: 20000 }, async () => {
  process.env.MCP_ACCESS_TOKEN = randomBytes(32).toString('hex');
  const { handleOAuth, authorized, challenge } = await import('./dist/oauth.js');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, process.env.MCP_PUBLIC_URL);
    if (await handleOAuth(req, res, url)) return;
    res.writeHead(authorized(req) ? 200 : 401, { 'WWW-Authenticate': challenge() });
    res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.MCP_PUBLIC_URL = base;
  const resource = base + '/mcp';
  const redirect = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const post = (path, values, headers = {}) => fetch(base + path, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(values), redirect: 'manual',
  });
  const register = values => fetch(base + '/oauth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
  });
  try {
    assert.equal((await fetch(resource)).status, 401);
    assert.match((await fetch(resource)).headers.get('www-authenticate'), /resource_metadata=/);
    const metadata = await (await fetch(base + '/.well-known/oauth-authorization-server')).json();
    assert.deepEqual(metadata.code_challenge_methods_supported, ['S256']);
    assert.equal(metadata.client_id_metadata_document_supported, true);
    assert.equal((await (await fetch(base + '/.well-known/oauth-protected-resource/mcp')).json()).resource, resource);
    assert.equal((await register({ redirect_uris: ['https://attacker.example/callback'] })).status, 400);
    assert.equal((await register({ redirect_uris: ['https://chatgpt.com@attacker.example/callback'] })).status, 400);
    const client = (await (await register({ redirect_uris: [redirect], token_endpoint_auth_method: 'none' })).json()).client_id;
    const verifier = randomBytes(32).toString('base64url');
    const params = { client_id: client, redirect_uri: redirect, resource, scope: 'vendorai:admin', response_type: 'code', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: 'test-state' };
    const form = async changes => {
      const response = await fetch(base + '/oauth/authorize?' + new URLSearchParams({ ...params, ...changes }));
      const html = await response.text();
      assert.ok(!html.includes(process.env.MCP_ACCESS_TOKEN));
      return { response, csrf: html.match(/name="csrf" value="([^"]+)"/)?.[1] };
    };
    assert.equal((await form({ resource: 'https://attacker.example' })).response.status, 400);
    assert.equal((await form({ code_challenge_method: 'plain' })).response.status, 400);
    assert.equal((await form({ resource: '' })).response.status, 200);
    const cimdClient = 'https://chatgpt.com/oauth/client.json';
    const cimdAuthorize = await form({ client_id: cimdClient });
    assert.equal(cimdAuthorize.response.status, 200);
    const cimdSpecificWrong = await form({ client_id: 'https://chatgpt.com/oauth/abc123/client.json' });
    assert.equal(cimdSpecificWrong.response.status, 400);

    const legacyClient = 'legacy-public-client-1234567890';
    const legacyAuthorize = await form({ client_id: legacyClient });
    assert.equal(legacyAuthorize.response.status, 200);
    let f = await form();
    assert.equal(f.response.headers.get("referrer-policy"), "same-origin");
    assert.match(f.response.headers.get("content-security-policy"), /form-action 'self' https:\/\/chatgpt\.com;/);
    const nullOrigin = await post("/oauth/approve", { csrf: f.csrf, decision: "deny" }, { Origin: "null" });
    assert.equal(nullOrigin.status, 400);
    assert.equal((await nullOrigin.json()).reason, "invalid_origin");
    assert.equal((await post('/oauth/approve', { csrf: f.csrf, credential: process.env.MCP_ACCESS_TOKEN, decision: 'approve' })).status, 400);
    f = await form();
    assert.equal((await post('/oauth/approve', { csrf: f.csrf, credential: 'wrong', decision: 'approve' }, { Origin: base })).status, 403);
    f = await form();
    let approval = await post('/oauth/approve', { csrf: f.csrf, decision: 'deny' }, { Origin: base });
    assert.equal(new URL(approval.headers.get('location')).searchParams.get('error'), 'access_denied');
    const grant = async () => {
      const f = await form();
      const response = await post('/oauth/approve', { csrf: f.csrf, credential: process.env.MCP_ACCESS_TOKEN, decision: 'approve' }, { Origin: base });
      assert.equal(response.status, 303);
      const url = new URL(response.headers.get('location'));
      assert.equal(url.searchParams.get('state'), 'test-state');
      assert.equal(url.searchParams.get('iss'), base);
      return url.searchParams.get('code');
    };
    const code = await grant();
    const exchange = { client_id: client, redirect_uri: redirect, resource, code, grant_type: 'authorization_code', code_verifier: verifier };
    assert.equal((await post('/oauth/token', { ...exchange, code_verifier: 'x'.repeat(43) })).status, 400);
    assert.equal((await post('/oauth/token', { ...exchange, resource: 'https://attacker.example' })).status, 400);
    const tokens = await (await post('/oauth/token', exchange)).json();
    assert.ok(tokens.access_token); assert.ok(tokens.refresh_token);
    const noResourceCode = await grant();
    const noResourceTokens = await (await post('/oauth/token', { client_id: client, redirect_uri: redirect, code: noResourceCode, grant_type: 'authorization_code', code_verifier: verifier })).json();
    assert.ok(noResourceTokens.access_token);

    const cimdAuth = await form({ client_id: cimdClient });
    const cimdHtml = await cimdAuth.response.text();
    const cimdCsrf = cimdHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
    assert.ok(cimdCsrf);
    const cimdApprove = await post('/oauth/approve', { csrf: cimdCsrf, credential: process.env.MCP_ACCESS_TOKEN, decision: 'approve' }, { Origin: base });
    const cimdCode = new URL(cimdApprove.headers.get('location')).searchParams.get('code');
    assert.ok(cimdCode);
    const cimdTokens = await (await post('/oauth/token', { client_id: cimdClient, redirect_uri: redirect, code: cimdCode, grant_type: 'authorization_code', code_verifier: verifier })).json();
    assert.ok(cimdTokens.access_token);

    const legacyAuth = await form({ client_id: legacyClient });
    const legacyHtml = await legacyAuth.response.text();
    const legacyCsrf = legacyHtml.match(/name="csrf" value="([^"]+)"/)?.[1];
    assert.ok(legacyCsrf);
    const legacyApprove = await fetch(resource + '/oauth/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: resource },
      body: new URLSearchParams({ csrf: legacyCsrf, credential: process.env.MCP_ACCESS_TOKEN, decision: 'approve' }),
      redirect: 'manual',
    });
    const legacyCode = new URL(legacyApprove.headers.get('location')).searchParams.get('code');
    assert.ok(legacyCode);
    const legacyTokens = await (await post('/oauth/token', { client_id: legacyClient, redirect_uri: redirect, code: legacyCode, grant_type: 'authorization_code', code_verifier: verifier })).json();
    assert.ok(legacyTokens.access_token);
    assert.equal((await post('/oauth/token', exchange)).status, 400);
    assert.equal((await fetch(resource, { headers: { Authorization: 'Bearer ' + tokens.access_token } })).status, 200);
    assert.equal((await fetch(resource, { headers: { Authorization: 'Bearer ' + tokens.access_token + 'x' } })).status, 401);
    const renewal = { client_id: client, resource, grant_type: 'refresh_token', refresh_token: tokens.refresh_token };
    const rotated = await (await post('/oauth/token', renewal)).json();
    assert.notEqual(rotated.refresh_token, tokens.refresh_token);
    assert.equal((await post('/oauth/token', renewal)).status, 400);
    assert.equal((await fetch(resource, { headers: { Authorization: 'Bearer ' + rotated.access_token } })).status, 401);
    assert.equal((await post('/oauth/token', { ...renewal, refresh_token: rotated.refresh_token })).status, 400);
    const other = await (await post('/oauth/token', { ...exchange, code: await grant() })).json();
    await post('/oauth/revoke', { client_id: client, token: other.refresh_token });
    assert.equal((await fetch(resource, { headers: { Authorization: 'Bearer ' + other.access_token } })).status, 401);
    assert.equal((await fetch(resource, { headers: { Authorization: 'Bearer ' + process.env.MCP_ACCESS_TOKEN } })).status, 200);
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
});

test('real MCP server still initializes and lists tools behind authentication', { timeout: 20000 }, async () => {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const secret = randomBytes(32).toString('hex');
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, PORT: String(port), MCP_PUBLIC_URL: base, MCP_ACCESS_TOKEN: secret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('startup timeout')), 5000);
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`server exited ${code}`)); });
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/mcp')).status, 401);
    const call = async (method, params, id) => {
      const response = await fetch(base + '/mcp', { method: 'POST', headers: {
        Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
      assert.equal(response.status, 200);
      const text = await response.text();
      return response.headers.get('content-type')?.includes('text/event-stream') ? JSON.parse(text.split('\n').find(x => x.startsWith('data:')).slice(5)) : JSON.parse(text);
    };
    const init = await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'oauth-regression', version: '1' } }, 1);
    assert.ok(init.result.serverInfo);
    const tools = await call('tools/list', {}, 2);
    assert.equal(tools.result.tools.length, 10);
    assert.ok(tools.result.tools.some(x => x.name === 'browser_agent_run'));
  } finally {
    if (!child.killed) child.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
});
