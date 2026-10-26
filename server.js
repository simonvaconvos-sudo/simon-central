'use strict';
const http = require('node:http');
const UPSTREAM = 'https://vertex.lambdaclass.com/api/v1/public/venues/simonvaconvos/menu';
const PORT = Number(process.env.PORT || 10000);
const ALLOWED_ORIGINS = new Set(['https://simon-central.onrender.com', 'https://www.simonvaconvos.com.ar', 'https://simonvaconvos.com.ar']);
let cache = null;
let lastUpdate = 0;
const TTL = 5 * 60 * 1000;
const send = (req, res, code, body, extra = {}) => {
  const origin = req.headers.origin;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Vary': 'Origin', ...extra });
  res.end(JSON.stringify(body));
};
http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health') return send(req, res, 200, { ok: true, cached: !!cache });
  if (path !== '/api/menu') return send(req, res, 404, { error: 'Not found' });
  if (req.method !== 'GET') return send(req, res, 405, { error: 'Method not allowed' });
  if (cache && Date.now() - lastUpdate < TTL) return send(req, res, 200, cache);
  try {
    const response = await fetch(UPSTREAM, { headers: { Accept: 'application/json', 'User-Agent': 'SimonCentral/1.0' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Restolia HTTP ' + response.status);
    const data = await response.json();
    const body = data.data ?? data;
    if (!Array.isArray(body.products)) throw new Error('Formato de productos inesperado');
    cache = data;
    lastUpdate = Date.now();
    return send(req, res, 200, data);
  } catch (error) {
    console.error('Error consultando Restolia:', error.message);
    if (cache) return send(req, res, 200, cache, { 'X-Simon-Stale': 'true' });
    return send(req, res, 502, { error: 'No se pudo consultar Restolia', detail: error.message });
  }
}).listen(PORT, '0.0.0.0', () => console.log('Simón Central API escuchando en ' + PORT));
