# DawaiRead Proxy — Deploy Steps

This is a tiny server that holds your Gemini API key. Your Android app calls
this instead of calling Gemini directly, so the key never ships inside the APK.

## Prereqs
- A Google Cloud project (free to create, Cloud Run has a generous free tier)
- `gcloud` CLI installed, or just use the Cloud Console UI (no CLI needed)

## Fastest path: deploy from Cloud Console (no CLI)

1. Go to https://console.cloud.google.com/run
2. Click "Create Service" → "Continuously deploy from a repository" is optional;
   simplest is "Deploy one revision from an existing container image" → skip that,
   instead choose "Write, edit, and deploy source code" if offered, OR zip this
   folder and upload it directly when prompted for source.
3. Set these environment variables in the Cloud Run service config:
   - `GEMINI_API_KEY` = your fresh (non-leaked) Gemini API key
   - `PROXY_AUTH_TOKEN` = any random string you make up (e.g. a UUID) — this is
     the shared secret your Android app will send to prove it's allowed to use
     your proxy. Generate one with: `openssl rand -hex 16`
4. Deploy. Cloud Run gives you a URL like:
   `https://dawairead-proxy-xxxxx-uc.a.run.app`
5. Test it's alive: visit `https://your-url/health` in a browser — should
   return `{"status":"ok"}`

## Fastest path: deploy via gcloud CLI (if installed)

```bash
cd dawairead-proxy
gcloud run deploy dawairead-proxy \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key_here,PROXY_AUTH_TOKEN=your_random_token_here
```

`asia-south1` is Mumbai — pick this or `asia-south2` (Delhi) for lowest latency
from India.

## Connect the Android app

In the app's Settings screen:
- Extraction mode: "Secure Backend Proxy"
- Proxy URL: `https://your-cloud-run-url/scan`
- Auth token: the same `PROXY_AUTH_TOKEN` value you set above

## What this protects you from

- Your Gemini key is never in the APK — nothing to decompile
- The `PROXY_AUTH_TOKEN` check stops randoms from finding your Cloud Run URL
  and burning your Gemini quota
- If the token ever leaks, you rotate it by redeploying with a new
  `PROXY_AUTH_TOKEN` env var — no need to touch the Gemini key itself

## Cost

Cloud Run's free tier covers this comfortably for personal testing — you pay
only for actual request time, and idle instances scale to zero.
