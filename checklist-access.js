'use strict';

const { createHash, createHmac, randomBytes, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const COOKIE = 'simon_checklist';
const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_KEY = randomBytes(32);
const CHECKLIST = readFileSync(join(__dirname, 'checklist-view.txt'), 'utf8');
const digest = (value) => createHash('sha256').update(value).digest();
const passwordDigest = process.env.CHECKLIST_PASSWORD
  ? digest(process.env.CHECKLIST_PASSWORD)
  : Buffer.from('6fdf3ee298d970b9bf5d831107356956b68ad42536f5e73d4cb32fe4029fad49', 'hex');

function loginPage(message = '') {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Acceso al checklist · Simón Central</title>
  <style>
    body{font:1rem system-ui,sans-serif;background:#faf8f7;color:#36383e;margin:0;padding:24px}
    main{background:white;max-width:430px;margin:10vh auto;padding:24px;border:1px solid #e8cdd6;border-radius:18px}
    label,input{display:block} input{box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;font:inherit}
    button{background:#a74369;color:white;padding:12px 18px;border:0;border-radius:9px;font:inherit;cursor:pointer}
    a{color:#87314f} [role=alert]{color:#922446}
  </style>
</head>
<body>
  <main>
    <h1>Checklist de Pochoclos</h1>
    <p>Ingresá la clave del equipo para preparar el control del turno.</p>
    <form action="/checklist" method="post">
      <label for="password">Clave de acceso</label>
      <input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required autofocus>
      <button type="submit">Ingresar</button>
    </form>
    ${message ? `<p role="alert">${message}</p>` : ''}
    <p><a href="https://simon-central.onrender.com/">Volver al catálogo</a></p>
  </main>
</body>
</html>`;
}

function sendPage(res, status, html, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'",
    ...extra
  });
  res.end(html);
}

function sessionSignature(expires) {
  return createHmac('sha256', SESSION_KEY).update(expires).digest('hex');
}

function hasSession(req) {
  const cookie = (req.headers.cookie || '').split(/;\s*/).find((entry) => entry.startsWith(COOKIE + '='));
  if (!cookie) return false;
  const match = /^(\d+)\.([a-f0-9]{64})$/.exec(cookie.slice(COOKIE.length + 1));
  if (!match || Number(match[1]) <= Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(sessionSignature(match[1]), 'hex'));
}

function redirect(res, value, maxAge) {
  return sendPage(res, 303, '', {
    Location: '/checklist',
    'Set-Cookie': `${COOKIE}=${value}; Path=/checklist; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`
  });
}

async function handleChecklist(req, res, path) {
  if (req.method === 'GET' && path === '/checklist') {
    return sendPage(res, 200, hasSession(req) ? CHECKLIST : loginPage());
  }
  if (req.method !== 'POST') return sendPage(res, 405, 'Método no permitido.');
  if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers['sec-fetch-site'] === 'same-site') {
    return sendPage(res, 403, loginPage('Volvé a abrir el acceso e intentá de nuevo.'));
  }
  if (path === '/checklist/logout') return redirect(res, '', 0);

  let body = '';
  try {
    for await (const chunk of req.setEncoding('utf8')) {
      body += chunk;
      if (body.length > 2048) return sendPage(res, 413, loginPage('La clave ingresada es demasiado larga.'));
    }
  } catch {
    return sendPage(res, 400, loginPage('No se pudo leer la clave. Intentá de nuevo.'));
  }
  const password = new URLSearchParams(body).get('password') || '';
  if (!timingSafeEqual(digest(password), passwordDigest)) {
    return sendPage(res, 401, loginPage('La clave es incorrecta.'));
  }
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return redirect(res, `${expires}.${sessionSignature(expires)}`, SESSION_SECONDS);
}

module.exports = { handleChecklist };
