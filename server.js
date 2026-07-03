// DawaiRead Gemini Proxy
// Holds GEMINI_API_KEY server-side. The Android app calls this endpoint
// instead of calling Gemini directly, so the key never ships in the APK.

const express = require('express');
const app = express();

app.use(express.json({ limit: '15mb' })); // images as base64 can be large

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash'; // pin to a GA model, not preview
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Simple shared-secret check so randos who find your Cloud Run URL can't
// spend your Gemini quota. Set PROXY_AUTH_TOKEN as a second env var and
// put the same value in the app's Settings > Auth token field.
const PROXY_AUTH_TOKEN = process.env.PROXY_AUTH_TOKEN;

app.post('/scan', async (req, res) => {
  try {
    // auth check
    const incomingToken = req.headers['authorization']?.replace('Bearer ', '');
    if (!PROXY_AUTH_TOKEN || incomingToken !== PROXY_AUTH_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY not set' });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const prompt = `You are reading an Indian medicine strip or handwritten prescription.
Extract ONLY what is printed or written — do not infer or add anything.
Return strict JSON with this exact shape, nothing else, no markdown fences:
{
  "drug_name": string,
  "strength": string,
  "dosage_qty": string,
  "raw_timing_text": string,
  "printed_warnings": string,
  "confidence": number
}
confidence is 0-100, your certainty in the overall extraction.
If a field isn't visible or legible, use an empty string for that field.`;

    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: 'Gemini API call failed', detail: errText });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'No content returned from Gemini' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse Gemini JSON output:', text);
      return res.status(502).json({ error: 'Malformed extraction output', raw: text });
    }

    return res.json(parsed);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error' });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`DawaiRead proxy listening on ${PORT}`));
