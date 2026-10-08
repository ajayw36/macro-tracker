# Macros

A personal macro tracker. Photograph a meal (or just describe it), and Claude
returns an itemized calorie / protein / carb / fat estimate that you review and
correct before it's saved. The home page shows the day's totals against your
daily targets, a 30-day intake chart, and a one-tap "log again" list of meals
you've eaten before.

Built with Next.js (App Router), TypeScript, Tailwind, Recharts, and Prisma 6 on
MongoDB. Meal estimation runs through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
(or the Anthropic API directly). Deploys to Vercel.

Photos are never stored — they're sent for analysis and discarded. Only the
numbers you confirm are written to the database.

Extracted from the nutrition feature of the
[Stride fitness dashboard](https://github.com/ajayw36/fitness-dashboard).

## What it does

- **Log a meal** — upload or snap a photo, add any detail you already know
  ("6oz chicken", numbers off the label), or skip the photo and describe it in
  words. The image is downscaled in the browser before upload.
- **Review & edit** — the estimate comes back itemized with a confidence level
  and a list of assumptions. Edit any number, add or remove items, set when it
  was eaten, then save.
- **Day view** — calories and macros for the day against your targets, with
  previous / next day navigation for backdating.
- **30-day chart** — daily calories with your target as a reference line.
- **Log again** — your most recent distinct meals, re-loggable with one tap.
- **Password gate** — one password protects the whole app.

## Setup

### 1. Database (MongoDB Atlas — free)
Create a free **M0** cluster at <https://www.mongodb.com/atlas>, add a database
user, allow network access (`0.0.0.0/0` for simplicity), and copy the connection
string (`mongodb+srv://...`). Atlas is a replica set, which Prisma needs for
MongoDB.

### 2. Environment
Copy `.env.example` to `.env` and fill in:

| Var | Where to get it |
| --- | --- |
| `DATABASE_URL` | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `AI_GATEWAY_API_KEY` *or* `ANTHROPIC_API_KEY` | Either one powers meal estimation. `AI_GATEWAY_API_KEY` ([Vercel AI Gateway](https://vercel.com/docs/ai-gateway)) bills to your Vercel team's AI Gateway Credits, which include a monthly free allowance; `ANTHROPIC_API_KEY` (<https://console.anthropic.com/>) bills Anthropic directly. The gateway wins if both are set |
| `NUTRITION_MODEL` | Optional model override. **Required on the AI Gateway free tier** — Anthropic models aren't free-tier eligible, so set `openai/gpt-4.1-nano` (see `.env.example` for the measured comparison) |
| `DASHBOARD_PASSWORD` | Any password. Gates the whole app. Leave empty to disable auth locally — **set it before deploying**, it's what stops a visitor spending your AI credits |
| `APP_TZ` | Optional IANA timezone used until you pick one in Settings (default `America/New_York`) |

### 3. Push the schema + run
```bash
npm install
npm run db:push           # creates collections/indexes in MongoDB
npm run dev               # http://localhost:3000
```
Open the app, set your daily targets and timezone under **Settings**, then log
a meal.

## Deploy to Vercel
1. Push to GitHub and import the repo in Vercel.
2. Add the env vars from `.env` to the Vercel project (`DATABASE_URL`,
   `AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY`, `NUTRITION_MODEL` if on the
   free tier, `DASHBOARD_PASSWORD`).
3. Deploy. Push the schema to the DB once (`npm run db:push` with the prod
   `DATABASE_URL`) — if local and prod share the Atlas cluster this is already
   done.

## How the AI call works
`src/lib/nutrition.ts` builds one Messages API request (image first, then
text) with a structured-output schema, and sends it through the Anthropic SDK.
With `AI_GATEWAY_API_KEY` set, the SDK's base URL is pointed at
`https://ai-gateway.vercel.sh` and the model id is provider-prefixed
(`anthropic/claude-opus-5`, or whatever `NUTRITION_MODEL` says); with
`ANTHROPIC_API_KEY` it talks to Anthropic directly. The model returns per-item
numbers only — the app sums them, never the model.

## Timezones
A meal's day is decided when it's saved, using the timezone in Settings, and
stored as a `YYYY-MM-DD` key. Changing the timezone later never re-buckets
existing meals.

## Scripts
- `npm run dev` / `build` / `start`
- `npm run lint`
- `npm run db:push` — push schema (collections + indexes) to MongoDB
- `npm run db:generate` — regenerate the Prisma client
