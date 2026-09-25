# Competitor Market Intelligence

Mobile-first React + Supabase field app for competitor sightings. Agents can capture GPS coordinates, take/upload a poster photo, optionally run Cloudflare Workers AI OCR/extraction, review the result, and submit it to Supabase.

## Included

- React + TypeScript + Vite
- Supabase Auth
- Private Supabase Storage bucket (`competitor-posters`)
- RLS: agents can only access their own competitor reports/photos
- GPS capture with accuracy indicator
- Camera/upload input
- Manual competitor, package, speed, price, promo, contact and notes fields
- Optional Cloudflare Workers AI OCR + structured extraction
- Home + New Report + My Reports screens
- Cloudflare Pages SPA redirect
- Reproducible SQL migration

## Supabase

This package is already configured for the connected project:

`https://gsnrsprnbgeejmkghrkn.supabase.co`

The live project already has the new tables, RLS policies, seeded competitors, and private Storage bucket applied.

The browser uses a Supabase publishable key. Never add a Supabase `service_role` or secret key to Vite environment variables.

## Run locally

```bash
npm install
npm run dev
```

A `.env.local` is included for your current Supabase project but is ignored by Git.

## Existing users

The frontend uses Supabase email + password authentication. Use an existing Supabase Auth user, or create users in Supabase Dashboard > Authentication > Users.

## Enable AI / OCR

The app works without AI. To enable it:

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

Cloudflare Workers AI must be available on the Cloudflare account. The worker uses the Workers AI binding and `@cf/google/gemma-4-26b-a4b-it` for multilingual vision/OCR and structured extraction.

After deployment, copy the Worker URL into the frontend environment:

```env
VITE_AI_API_URL=https://competitor-market-ai.<your-subdomain>.workers.dev
```

Then rebuild/deploy the frontend.

The Worker validates the caller's Supabase access token before running AI, so anonymous callers cannot use the AI endpoint.

## Deploy frontend to Cloudflare Pages

Build command:

```bash
npm run build
```

Output directory:

```text
dist
```

Set these environment variables in Cloudflare Pages:

```env
VITE_SUPABASE_URL=https://gsnrsprnbgeejmkghrkn.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_kMb0WtlTtODQJNgQTiWDEQ_TWxAtjqs
VITE_AI_API_URL=<your worker URL, optional>
```

## GitHub

```bash
git init
git add .
git commit -m "feat: competitor market field reporting MVP"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

## Data model

- `competitors`: reference list of competitor brands
- `competitor_reports`: one field sighting/report
- `competitor-posters`: private Supabase Storage bucket

The report stores raw OCR text, final reviewed values, AI extraction JSON, confidence JSON, latitude/longitude and GPS accuracy so future analytics can compare AI output vs. agent corrections.
