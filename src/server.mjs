import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { formatSseEvent, normalizeConversationName } from './bridge.mjs';

export const SERVICE = 'muse-bridge';
export const VERSION = '1.0.0';

export function ensureToken(tokenFile) {
  try {
    const existing = fs.readFileSync(tokenFile, 'utf8').trim();
    if (existing) return existing;
  } catch { /* first start */ }
  fs.mkdirSync(path.dirname(tokenFile), { recursive: true, mode: 0o700 });
  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  return token;
}

function sameToken(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function createServer({ bridge, token }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;

    if (p === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: SERVICE,
        version: VERSION,
        port: bridge.port,
        model: bridge.defaultModel,
        provider: bridge.defaultProvider,
        stubMode: bridge.stubMode,
      }));
      return;
    }

    const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!sameToken(auth, token)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
      return;
    }

    if (p === '/api/vitals' || p === '/vitals') {
      const v = await bridge.getVitals();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(v));
      return;
    }

    if (p === '/api/metrics') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        service: SERVICE,
        metrics: bridge.metrics,
        running: bridge.runningProcesses.size,
      }));
      return;
    }

    if (p === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(formatSseEvent({ type: 'connected' }));
      bridge.clients.set(res, normalizeConversationName(url.searchParams.get('conversation')) || null);
      req.on('close', () => bridge.clients.delete(res));
      return;
    }

    if (p === '/api/inject' && req.method === 'POST') {
      try {
        const body = await readJson(req);
        const conv = normalizeConversationName(body.conversation);
        const message = String(body.message || '').trim();
        if (!message && !body.context_file) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'message or context_file required' }));
          return;
        }
        const result = bridge.runAgent(conv, message, {
          contextFile: body.context_file || null,
          contextText: body.context || null,
          model: body.model || null,
          provider: body.provider || null,
          reasoningEffort: body.reasoning_effort || body.reasoningEffort || null,
          perimeter: body.perimeter || null,
        });
        bridge.metrics.injects++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, conversation: conv, ...result }));
      } catch (err) {
        bridge.metrics.errors++;
        const status = err.code === 'BRIDGE_MODEL_UNSET' ? 503 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message, code: err.code || undefined }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  });
}
