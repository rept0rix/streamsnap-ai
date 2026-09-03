# StreamSnap Lens Worker

Resolves a cropped video frame to **real Amazon listings** using Google Lens reverse image search.

This is the piece that removes guessing from the product layer. The extension used to ask a language model to name an object and invent an ASIN, which produced dead links. Here the crop goes to Lens, Lens returns products that actually exist, and anything without a resolvable ASIN is discarded rather than shown.

## Why a Worker

Three things force a server between the extension and Lens.

The Bright Data key cannot ship inside the extension — a browser extension is a zip file anyone can open, and an extracted key means someone else spends your quota. Google Lens also fetches the query image over HTTP, so the crop needs a public URL for a few seconds; the Worker serves it from R2 and deletes it immediately after. And caching identical crops server-side means a repeated scan costs nothing for every user, not just the one who scanned first.

## Request flow

```text
extension  ──POST /resolve { image, installId }──►  Worker
                                                      │
                                    hash → KV cache hit? ──► return (no cost)
                                                      │ miss
                                          rate limit check (KV)
                                                      │
                                       store crop in R2 (temporary)
                                                      │
                              POST api.brightdata.com/request
                                 url = lens.google.com/uploadbyurl
                                       ?url=<worker>/img/<hash>
                                       &brd_json=1&brd_lens=products
                                                      │
                                          delete crop from R2
                                                      │
                              parse → keep only Amazon + real ASIN
                                                      │
                                        cache result, return
```

## Vision engine (no Bright Data key)

When `BRIGHTDATA_API_KEY` / `BRIGHTDATA_ZONE` are not set — the mobile live-scan
deployment — `/resolve` recognises products with a vision model instead of Lens:

```text
frame ──► Gemini 2.5 Flash            (GEMINI_API_KEY, or X-Gemini-Key header)   src/vision.js
            └─ fallback: Llama 4 Scout → Llama 3.2 Vision → LLaVA  ([ai] binding)
              │  names + locates physical products only; UI / app / body-part
              │  "products" and generic single nouns are filtered out
              │  each detection is cropped by its box_2d (src/crop.js)
              ▼
        amazon.com/s?k=<title>  (per detection, cached in KV)      src/amazon_lookup.js
              │  keep the organic listing whose title overlaps the detection
              ▼
   optional: Google Lens on each crop (BRIGHTDATA_*) — upgrades weak matches
              ▼
   amazon[]  = verified listings: asin, dp url, catalog image, live price, sourceCrop
   others[]  = honest misses: search url, model's price estimate, sourceCrop, no image
```

The model is never allowed to invent ASINs, catalog images or "Amazon" prices;
those only come from the listing lookup. `priceEstimated: true` marks prices
that are still a model guess.

**Set `GEMINI_API_KEY`.** Gemini 2.5 Flash is the model the Chrome extension
runs on and is where its recognition quality comes from; the Workers AI models
are a degraded fallback that frequently misreads brands and model numbers on a
video frame. Gemini is called with `responseSchema` (guaranteed JSON), thinking
disabled, and the native `box_2d` convention it was trained on. Cost is roughly
1,000 input tokens per frame (≈ $0.0003 at the paid tier); the free tier is
enough for development. `GEMINI_MODELS` can override the model list
(default `gemini-2.5-flash,gemini-flash-latest`). A client may also send its
own key in `X-Gemini-Key`, which takes precedence over the server secret.

```bash
npm install                                # wrangler is a devDependency, not global
npx wrangler login                         # once per machine
npx wrangler secret put GEMINI_API_KEY     # from https://aistudio.google.com/apikey
npm run deploy
```

The response reports which engine produced a result: `engine` is `lens`,
`gemini` or `workers-ai`, and `visionModel` names the exact model.

## Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/resolve` | `{ image: dataUrl, installId }` → `{ ok, products, others, count, cached, engine }` |
| `GET` | `/img/:hash` | Serves the temporary crop so Google can fetch it |
| `GET` | `/health` | Liveness check |

A product in `products` always carries a real ASIN. `others` holds non-Amazon retailers, kept for the case where an item genuinely is not sold on Amazon.

## Deploy

**1. Bright Data.** Sign up at [brightdata.com](https://brightdata.com/cp/start) (free tier: 5,000 requests/month, no card). Create a **SERP API** zone, note its name, and copy your API key.

**2. Cloudflare storage.**

```bash
cd worker
npm install

npx wrangler kv namespace create CACHE      # copy the printed id
npx wrangler r2 bucket create streamsnap-crops
```

Paste the KV id into `wrangler.toml`.

**3. Secrets.** These never go in `wrangler.toml`.

```bash
npx wrangler secret put BRIGHTDATA_API_KEY
npx wrangler secret put BRIGHTDATA_ZONE
```

**4. Deploy, then fix the callback URL.**

```bash
npm run deploy
```

Deploy prints the Worker URL. Put it in `PUBLIC_BASE_URL` in `wrangler.toml` and deploy once more. This step is easy to skip and nothing works without it — Lens fetches the crop from that URL, so a stale value fails every request.

**5. Verify.**

```bash
curl https://YOUR-WORKER.workers.dev/health
# {"ok":true}

# End-to-end, using any product photo:
curl -X POST https://YOUR-WORKER.workers.dev/resolve \
  -H 'Content-Type: application/json' \
  -d "{\"installId\":\"testinstall123\",\"image\":\"$(base64 -i product.jpg | tr -d '\n' | sed 's|^|data:image/jpeg;base64,|')\"}"
```

## About the parser

The exact JSON shape Bright Data returns for Lens is not publicly documented and has shifted between their SERP endpoints. Rather than hard-code one schema, `parser.js` walks the response for anything that looks like a result and reads a set of field aliases. `npm test` covers this with 14 assertions, including a case where results arrive under a completely unexpected key.

Expect the first live call to need one round of tuning anyway. When a response yields nothing, the Worker logs its *shape* — field names only, never content — so you can see the real schema:

```bash
npm run tail
```

Tighten `TITLE_KEYS`, `LINK_KEYS` and friends in `parser.js` once you have seen it.

## Limits and cost

Per install: 60 scans/hour, 400/day. Adjust in `LIMITS` in `src/index.js`.

Bright Data gives 5,000 requests/month free, then $1.50 per 1,000. Cloudflare Workers, KV and R2 all have free tiers that comfortably cover early usage. Cache hits cost nothing, so real spend tracks *distinct* crops rather than total scans — which is why the same streamer's static setup is nearly free to scan repeatedly.

## Privacy

Crops are written to R2 only for the duration of the Lens call and deleted immediately after, in the same request. Cached entries store the parsed *product results*, never the image. The Worker receives an install ID for rate limiting and no other user identifier — no accounts, no browsing history, no IP retention beyond Cloudflare's own defaults.
