# CV ATS Reviewer

Upload a PDF CV, choose how to check it, and get a score with the exact lines to change. The app runs in
English and Indonesian.

> **The score is an estimate.** Most of the scores and suggestions come from an AI model working from a
> rule-based rubric; the formatting check and the notes on hidden text and typography come from rules
> alone. None of it has been tested against the applicant tracking systems that employers use, so treat
> the result as a guide for revising your CV, not as a promise that it will pass a screening.

## What it does

- *General review + suggested roles* needs only the PDF and also lists the 5 roles that fit it best.
  *Match a job posting* compares the CV with a pasted job description and points out missing keywords and
  skills.
- The report gives an overall score from 0 to 100, six weighted checks, the main weaknesses, and suggestions
  ordered from "must change" to "optional", quoting the CV line they refer to when there is one.
- The server renders each page as an image and sends it with the result, so your pages sit next to the
  report.
- Every analysis is saved in IndexedDB in your browser. Reopen it without the network, delete it, or run a
  new analysis of a stored CV without choosing the file again.
- In Settings you can enter your own key and a model ID from any provider. The app recognizes OpenRouter,
  OpenAI, Anthropic, Google Gemini, Groq, Mistral, DeepSeek, xAI, Perplexity, Fireworks, Cerebras, Hugging
  Face, and NVIDIA from the key (or the model) and knows where to send it. For any other OpenAI-compatible
  provider, or a model server of your own, add its endpoint address. The free quota itself always runs on
  the app's OpenRouter key, and only it has a daily limit.

## Where your data goes

| Data | Where it lives |
| --- | --- |
| The PDF | Sent to `POST /api/analyze`, read in memory with pdf.js, and discarded after the response. |
| Hidden text in the PDF | Detected on the server (low contrast, invisible or transparent, tiny, or off the page), left out of the analysis, and reported so you can delete it. It never reaches the AI. |
| What the AI receives | The visible CV text and, when matching a posting, the job title and description, sent with the prompt to OpenRouter (free quota) or to the provider of your own key. |
| Results, page images, the PDF for later runs | IndexedDB in your browser. Private browsing that blocks IndexedDB keeps the result on screen until you leave the page, without saving it. |
| Your API key | `localStorage` in your browser, with its model and endpoint address. It is sent only with your analyses, which the server forwards to the provider recognized from the key (a key the app cannot place is refused), and to that provider's own key check, which runs from your browser. |
| An endpoint address | Called by the server only on the checked address, without following redirects. By default it must be HTTPS to a public host; plain HTTP and local or private-network hosts need `ALLOW_PRIVATE_ENDPOINTS=true`, and cloud metadata addresses are always refused. |
| Usage counters | Upstash Redis on the server: a daily count for the free quota and an hourly request count, keyed by a hashed IP address. No CV data. |

## Languages

The app lives at `/en` (the default) and `/id`. The switcher at the top left changes the interface, the
server's messages, and the language the AI writes in, and the choice is remembered in a cookie. Quoted CV
text stays exactly as it is in the CV. A stored result keeps the language it was written in.

## Getting started

Requirements: Node.js 22.22.2 or later on the 22 line, 24.15 or later on the 24 line, or 26 and up (the
range the jsdom test environment supports), and npm. Developed on Node.js 24.18.

```bash
git clone https://github.com/Qidil/cv-ats-reviewer-byQidil.git
cd cv-ats-reviewer-byQidil
npm install
cp .env.example .env.local   # then fill in OPENROUTER_API_KEY at least
npm run dev
```

Open <http://localhost:3000>; it redirects to `/en` or to the language you picked last. Without Upstash
credentials, development counts the quota in memory, so the counters reset when the dev server restarts.

## Environment variables

Every variable is optional in development. `.env.example` lists them with comments.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none | The key behind the free quota. Without it, only personal keys can analyze. |
| `OPENROUTER_MODEL` | `openrouter/free` | First model of the chain. |
| `OPENROUTER_FREE_MODELS` | list in `lib/api/config.ts` | Comma-separated fallback models, tried in order. |
| `OPENROUTER_TIMEOUT_MS` | `120000` | Time budget for one analysis across the whole chain. |
| `DAILY_ANALYSIS_LIMIT` | `10` | Free-quota analyses per client per day, reset at 00:00 GMT+8. Personal keys are not counted. |
| `HOURLY_REQUEST_LIMIT` | `20` | Requests per client per clock hour, with any key. |
| `QUOTA_HASH_SECRET` | development value | Secret for hashing client IPs in the counters. Required in production. |
| `ALLOW_PRIVATE_ENDPOINTS` | `false` | `true` lets endpoint addresses in Settings use plain HTTP and local or private-network hosts, for a model server of your own. Only on a server you control. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | none | The counters' store. `KV_REST_API_URL` and `KV_REST_API_TOKEN` are read too. Required in production for the free quota and for endpoint addresses in Settings. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server at <http://localhost:3000>. |
| `npm run build` | Production build. |
| `npm start` | Serves the production build. |
| `npm test` | Unit and component tests (Vitest, jsdom, fake-indexeddb). |
| `npm run typecheck` | Generates route types and runs `tsc --noEmit`. |
| `npm run lint` | ESLint with the Next.js rules. |

## Deploying

The app targets Vercel; any Node.js host that runs Next.js 16 should work. Before a public deployment:

- Leave `DAILY_ANALYSIS_LIMIT` and `HOURLY_REQUEST_LIMIT` unset, or set them to 10 and 20. Raised values
  are for local testing only.
- Set `QUOTA_HASH_SECRET` and the Upstash credentials. Without them, production turns the free quota off,
  only personal keys from recognized providers work, and endpoint addresses in Settings are refused, since
  an endpoint without the hourly limit would let anyone use the host to relay requests.
- Leave `ALLOW_PRIVATE_ENDPOINTS` off. A visitor's local model server is out of the host's reach anyway,
  and turning it on would let anyone use the host to reach its own private network.
- Put the function region next to the Upstash database, so each counter call stays short.
- The route runs for up to 180 seconds (`maxDuration`), which on Vercel Hobby needs Fluid compute.
- Requests and responses must stay under Vercel's 4.5 MB limit; the 4 MB PDF cap and the page image budget
  keep them there.
- After `npm run build`, check that `.next/server/app/api/analyze/route.js.nft.json` lists the pdf.js
  standard fonts and the `@napi-rs/canvas` binary for the target platform.
- Consider the host's own rate limiting (for example the Vercel Firewall) for `/api/analyze`.

## Project layout

| Path | Contents |
| --- | --- |
| `app/[lang]/` | The page and root layout, built for `/en` and `/id`. |
| `app/api/analyze/` | The analysis route. |
| `proxy.ts` | Sends paths without a language to the saved one, or to `/en`. |
| `components/` | The dashboard and its parts: upload, results, page images, settings, history. |
| `lib/pdf/` | PDF text extraction and page rendering (pdf.js on the server). |
| `lib/ats/` | Hidden-text rules, the scoring rubric, and report assembly. |
| `lib/ai/` | Prompts, the model chain with failover, provider requests, the custom endpoint guard, answer parsing, and the counters. |
| `lib/api/` | Request handling, configuration, and the error catalog in both languages. |
| `lib/client/` | Browser code: the analysis request, the personal key, and history. |
| `lib/db/` | The IndexedDB schema (Dexie). |
| `lib/i18n/` | Interface dictionaries, language negotiation, and date and size formatting. |
| `types/` | Shared types for the API, the report, and storage. |

The `.agents/`, `.codex/`, `.opencode/`, and `anti-slop/` folders hold the AI-assisted workflow used to
build the project; the app does not use them.
