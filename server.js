 // DawaiRead Gemini Proxy
// Holds GEMINI_API_KEY server-side. The Android app calls this endpoint
// instead of calling Gemini directly, so the key never ships in the APK.

const express = require('express');
const app = express();

app.use(express.json({ limit: '15mb' })); // images as base64 can be large

// Log every incoming request so we can see what's actually arriving
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path} | auth header present: ${!!req.headers['authorization']}`);
  next();
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Simple shared-secret check so randos who find your Render URL can't
// spend your Gemini quota. Set PROXY_AUTH_TOKEN as a second env var and
// put the same value in the app's Settings > Auth token field.
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN;

// Transparent passthrough: the Android app's interceptor builds real Gemini
// REST requests (e.g. POST /v1beta/models/gemini-2.5-flash:generateContent)
// and just swaps the hostname to this proxy. So we mirror that exact path
// shape, inject the real key server-side, forward to Gemini, and return
// Gemini's response untouched. This means the key never ships in the APK,
// but the app's existing request-building code doesn't need to change.
app.post(/^\/v1beta\/models\/.+/, async (req, res) => {
  try {
    const incomingToken = req.headers['authorization']?.replace('Bearer ', '');
    if (!PROXY_AUTH_TOKEN || incomingToken !== PROXY_AUTH_TOKEN) {
      console.log(`[AUTH FAIL] expected token starting with "${PROXY_AUTH_TOKEN?.slice(0,6)}...", got "${incomingToken?.slice(0,6) || 'NONE'}..."`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY not set' });
    }

    const targetUrl = `${GEMINI_BASE}${req.path}?key=${GEMINI_API_KEY}`;
    console.log(`[FORWARDING] -> ${req.path}`);

    const geminiRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await geminiRes.text(); // pass through raw, whatever shape Gemini returns

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiRes.status, data);
    }

    res.status(geminiRes.status);
    res.set('Content-Type', 'application/json');
    return res.send(data);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`DawaiRead proxy listening on ${PORT}`));
