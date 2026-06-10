'use strict';

require('dotenv').config({ override: true });
const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      connectSrc:    ["'self'", "https://generativelanguage.googleapis.com"],
      imgSrc:        ["'self'", "data:"],
    },
  },
}));
app.use(cors());
app.use(express.json());

// ── Static Files ───────────────────────────────────────────────────────────────
// Serve frontend static files from /public as the web root
app.use(express.static(path.join(__dirname, 'public')));

// ── /api/config  (safe config delivery — no secrets exposed beyond what's needed) ──
app.get('/api/config', (req, res) => {
  // Only expose what the frontend actually needs.
  // Passwords are compared server-side via /api/auth.
  res.json({
    geminiModel:  'gemini-3.0-flash',
    appName:      process.env.APP_NAME           || 'BimaFast',
    appVersion:   process.env.APP_VERSION        || '2.0.0',
    defaultPremium:      parseInt(process.env.DEFAULT_PREMIUM_KES)          || 25,
    defaultPayoutNight:  parseInt(process.env.DEFAULT_PAYOUT_PER_NIGHT_KES) || 5000,
    riderDefaultPhone:   process.env.RIDER_DEFAULT_PHONE || '+254712345678',
  });
});

// ── /api/auth  (credential verification runs server-side — keys never leave) ──
app.post('/api/auth', (req, res) => {
  const { role, credentials } = req.body;

  if (!role || !credentials) {
    return res.status(400).json({ success: false, error: 'Missing role or credentials' });
  }

  let valid = false;
  let userData = {};

  switch (role) {
    case 'rider': {
      const phoneOk = (credentials.phone  || '').replace(/\s+/g, '') ===
                      (process.env.RIDER_DEFAULT_PHONE || '+254712345678').replace(/\s+/g, '');
      const pinOk   = String(credentials.pin || '') === String(process.env.RIDER_PIN || '1234');
      valid = phoneOk && pinOk;
      if (valid) userData = { name: 'John Kamau', phone: process.env.RIDER_DEFAULT_PHONE, role: 'rider' };
      break;
    }
    case 'hospital': {
      const codeOk = (credentials.code || '') === (process.env.HOSPITAL_CODE || 'HOSP-2024');
      const pinOk  = String(credentials.pin || '') === String(process.env.HOSPITAL_PIN || '9999');
      valid = codeOk && pinOk;
      if (valid) userData = { name: 'Nairobi General Hospital', code: process.env.HOSPITAL_CODE, role: 'hospital' };
      break;
    }
    case 'admin': {
      const userOk = (credentials.username || '') === (process.env.ADMIN_USERNAME || 'admin');
      const passOk = (credentials.password || '') === (process.env.ADMIN_PASSWORD || 'bimafast@admin2024');
      valid = userOk && passOk;
      if (valid) userData = { name: 'BimaFast Admin', username: process.env.ADMIN_USERNAME, role: 'admin' };
      break;
    }
    default:
      return res.status(400).json({ success: false, error: 'Unknown role' });
  }

  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  // Return session token (simple JWT-like approach — in production use real JWT)
  const sessionToken = Buffer.from(JSON.stringify({
    ...userData,
    iat: Date.now(),
    exp: Date.now() + 8 * 60 * 60 * 1000, // 8 hours
  })).toString('base64');

  res.json({ success: true, token: sessionToken, user: userData });
});

// ── /api/gemini-key  (delivers API key only to authenticated requests) ──────
app.post('/api/gemini-key', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const session = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (Date.now() > session.exp) return res.status(401).json({ error: 'Session expired' });

    const key = process.env.GEMINI_API_KEY || '';
    if (!key || key.includes('REPLACE_WITH')) {
      return res.status(503).json({ error: 'Gemini API key not configured in .env file', available: false });
    }

    // Do NOT return the raw key to the client. Only indicate availability.
    res.json({ available: true });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── /api/generate  (server-side proxy to Google Gemini)
app.post('/api/generate', async (req, res) => {
  // Server-side retries with exponential backoff for live Gemini
  const key = process.env.GEMINI_API_KEY || '';
  if (!key || key.includes('REPLACE_WITH')) {
    return res.status(503).json({ error: 'Gemini API key not configured on server' });
  }

  const { prompt, systemInstruction, responseSchema, modelName } = req.body;
  const modelToUse = modelName || 'gemini-3.0-flash';
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${key}`;

  const requestBody = {
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: Array.isArray(prompt) ? prompt : [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: responseSchema ? {
      response_mime_type: 'application/json',
      response_schema: responseSchema,
      temperature: 0.2,
    } : { temperature: 0.8 },
  };

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchWithRetries(url, opts, attempts = 3, baseDelay = 500) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try {
        const r = await fetch(url, opts);
        // If rate-limited or server error, retry
        if (r.status === 429 || r.status >= 500) {
          lastErr = r;
          const wait = baseDelay * Math.pow(2, i);
          await sleep(wait);
          continue;
        }
        return r;
      } catch (err) {
        lastErr = err;
        const wait = baseDelay * Math.pow(2, i);
        await sleep(wait);
      }
    }
    throw lastErr;
  }

  try {
    const r = await fetchWithRetries(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, 3, 500);

    const body = await r.text();
    return res.status(r.status).send(body);
  } catch (err) {
    console.error('Error proxying to Gemini after retries:', err);
    return res.status(502).json({ error: 'Failed to contact Gemini after retries', details: String(err && err.message ? err.message : err) });
  }
});

// ── Catch-all → serve index.html (SPA fallback) ───────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║     BimaFast Server  v2.0.0           ║');
  console.log(`  ║     http://localhost:${PORT}             ║`);
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('\n  Ready. Open http://localhost:' + PORT + ' in your browser.\n');

  const geminiKey = process.env.GEMINI_API_KEY || '';
  if (!geminiKey || geminiKey.includes('REPLACE_WITH')) {
    console.warn('  ⚠  WARNING: GEMINI_API_KEY not set in .env — AI features will not work!');
    console.warn('  ➜  Get a free key at https://aistudio.google.com/ and add it to .env\n');
  } else {
    console.log('  ✓  Gemini AI key loaded (model: gemini-3.0-flash)');
  }
});
