# PrepPAL

**Your personal meal helper for busy students and gym-goers alike.**

PrepPAL removes the mental load of figuring out what to cook. It suggests meals from ingredients you already have, tracks your daily calorie and macro intake, generates grocery lists automatically, and alerts you before food expires.

---

## The Core-loop

```
Pantry input → AI meal suggestion → Log meal → Repeat
```

Everything in this codebase serves that loop. If a feature doesn't serve that loop in MVP, it's Post-MVP.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Edge Functions](#edge-functions)
- [Build Phases](#build-phases)
- [Security Rules](#security-rules)
- [Contributing](#contributing)

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Mobile App | React Native + Expo | iOS + Android from one codebase |
| Web App | React + Vite | Management and analytics (Post-MVP) |
| Admin Dashboard | React (separate app) | Internal only |
| Database | Supabase Postgres | Relational data + auth + realtime + edge functions |
| Auth | Supabase Auth | Email + Google OAuth |
| Server Logic | Supabase Edge Functions | All Claude calls are server-side only |
| AI / Meals | Claude API (Sonnet) | Meal suggestions, macro estimation, dietary filtering |
| Nutrition Data | Open Food Facts API | Barcode scan → name and category only |
| Push Notifications | Expo Push API | Expiry alerts, restock reminders, meal prompts |

---

## Monorepo Structure

```
preppal/
├── apps/
│   ├── mobile/          # Expo React Native app — primary MVP interface
│   ├── web/             # React + Vite — management and analytics (Post-MVP)
│   └── admin/           # Internal admin dashboard
│
├── packages/
│   ├── types/           # Shared TypeScript types — single source of truth
│   ├── api/             # Shared Supabase query helpers and API clients
│   ├── ui/              # Shared UI components
│   ├── utils/           # Date formatting, unit conversion, nutrition helpers
│   └── validation/      # Shared Zod schemas for all forms and API payloads
│
├── supabase/
│   ├── migrations/      # All DB migrations in chronological order
│   ├── functions/       # Edge Functions (Claude calls, cron jobs)
│   └── seeds/           # Seed data for local development
│
└── services/
    └── fastapi/         # Optional — add only when Edge Functions are insufficient
```

> **Rule:** Never duplicate type definitions across apps. `packages/types` is the single source of truth.

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9 (recommended: use the npm bundled with Node)
- Supabase CLI (`npm install -g supabase`)
- Expo CLI (`npm install -g expo-cli`) — for mobile only

### 1. Clone and install

```bash
git clone https://github.com/your-org/preppal.git
cd preppal
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project credentials (see [Environment Variables](#environment-variables) below).

> **⚠️ Never commit `.env` to git.** It is in `.gitignore`. The Claude API key goes in Supabase Edge Function environment settings only — never in `.env`.

### 3. Start Supabase locally

```bash
npm run supabase:start
# This runs Postgres + Auth + Edge Functions locally via Docker
```

### 4. Run migrations

```bash
npm run supabase:migrate
```

### 5. Seed development data

```bash
npm run supabase:seed   # (once seed files are added in supabase/seeds/)
```

### 6. Start the app

Run **mobile** and **web** in separate terminals (both talk to the same Supabase project).

```bash
# Website (Vite) — http://localhost:3000 by default
npm run dev

# Mobile (Expo)
npm run mobile
```

Other entry points:

```bash
npm run web          # same as npm run dev (main PrepPAL web app)
npm run dev:web      # alias
npm run admin        # internal admin UI (port 5174)
```

---

## Environment Variables

Create a `.env` file at the root. **Never commit this file.**

```env
# Supabase — get these from your Supabase project dashboard
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Do NOT put the Claude API key here.
# It belongs exclusively in Supabase Edge Function environment settings.
# Dashboard → Project → Edge Functions → Secrets → Add CLAUDE_API_KEY
```

### Setting the Claude API key (correct way)

```bash
supabase secrets set CLAUDE_API_KEY=sk-ant-...
```

This stores the key in Supabase's encrypted secrets store. It is accessible inside Edge Functions as `Deno.env.get('CLAUDE_API_KEY')` and never exposed to any client.

---

## Database

All tables live in Supabase Postgres. Key rules:

- **RLS is enabled on every table from day one.** Users can only access rows where `user_id = auth.uid()`.
- **`created_at` and `updated_at`** are on every table. `updated_at` auto-updates via trigger.
- **`audit_logs` is immutable.** Nobody can `UPDATE` or `DELETE` from it, including admins.
- **Never delete from `meal_logs`.**

### Tables

| Domain | Tables |
|---|---|
| Identity | `users` |
| Pantry | `pantry_items` |
| Meals | `meal_logs`, `meal_suggestion_cache` |
| Nutrition | `nutrition_estimate_cache` |
| Grocery | `grocery_list_items` |
| Notifications | `notification_tokens`, `notifications` |
| Admin / Ops | `audit_logs`, `system_events` |

### Running migrations locally

```bash
supabase db reset        # Drop and recreate from migrations
supabase db push         # Apply pending migrations
supabase migration new   # Create a new migration file
```

---

## Edge Functions

All Edge Functions are in `supabase/functions/`. All Claude API calls route through these functions. The API key never touches client code.

| Function | Trigger | Description |
|---|---|---|
| `health` | Manual / Phase 0 test | Returns `{status: 'ok'}`. Confirms connectivity. |
| `generate-meal-suggestions` | User taps "Suggest a Meal" | Cache check → Claude → fallback chain. Returns 3 meal objects. |
| `estimate-nutrition` | Adding a whole food ingredient | Cache check → Claude → returns macros. |
| `expiry-restock-check` | pg_cron 8:00 AM UTC daily | Sends expiry warnings and restock alerts via Expo Push. |
| `morning-meal-prompt` | pg_cron 9:00 AM UTC daily | Sends meal suggestion prompt if user hasn't logged today. |
| `low-calorie-reminder` | pg_cron 7:00 PM UTC daily | Alerts users who are >400 kcal under their daily goal. |

### Deploying Edge Functions

```bash
supabase functions deploy generate-meal-suggestions
supabase functions deploy estimate-nutrition
supabase functions deploy expiry-restock-check
supabase functions deploy health
```

### Testing locally

```bash
supabase functions serve generate-meal-suggestions --env-file .env.local
```

---

## Meal Suggestion Cache

Every call to `generate-meal-suggestions` checks the cache before calling Claude.

**Cache key:** SHA-256 hash of sorted pantry contents + user preferences  
**TTL:** 24 hours

```
Cache hit  → Return immediately (<200ms)
Cache miss → Call Claude, store result, return (<8 seconds)
Claude failure → Fallback chain:
  1. Stale cache (any age) + UI notice
  2. Rule-based 3 suggestions (protein + carb + produce)
  3. Empty state if pantry < 3 items
```

> **Rule:** Never call Claude without checking the cache first. Never ship suggestions without the full fallback chain implemented.

---

## Build Phases

Build strictly in this order. Do not begin the next phase until the previous phase's exit criteria are fully met and tested on a real device.

| Phase | Name | Timeline | Status |
|---|---|---|---|
| 0 | Project Setup | Days 1–2 | 🔲 Not started |
| 1 | Pantry Core | Days 3–7 | 🔲 Not started |
| 2 | Meal Suggestions + Logging | Days 8–14 | 🔲 Not started |
| 3 | Calorie & Macro Tracking | Days 14–18 | 🔲 Not started |
| 4 | Grocery List + Expiry Alerts + Engagement | Days 19–25 | 🔲 Not started |
| 5 | Onboarding + Polish + Minimal Admin | Days 26–35 | 🔲 Not started |
| 6 | Web App *(Post-MVP)* | Post-MVP | 🔲 Not started |
| 7 | Admin Expansion + DoorDash *(Future)* | Future | 🔲 Not started |

**MVP = Phases 0–5.** The core loop (pantry → suggestion → log) must work perfectly before anything else is touched.

### Phase 0 Exit Criteria
Fresh install on a real phone. User can sign up, log in, see 4 empty tab screens, sign out. Edge Function health check returns 200.

### Phase 1 Exit Criteria
User can add 10+ pantry items, edit them, delete them, scan a barcode. Data persists on app close. Changes appear instantly via Realtime.

### Phase 2 Exit Criteria
Full core loop works end to end on a real device. Pantry items → suggest → 3 cards (<8s) → log → pantry quantities decrease → calorie ring updates → cache works on second request (<500ms).

---

## Security Rules

These are non-negotiable. Every one must be followed before shipping.

1. **Never call the Claude API from client code.** Always route through a Supabase Edge Function.
2. **RLS on every table from day one.** Policy: `user_id = auth.uid()`.
3. **Implement `meal_suggestion_cache` before the suggestions feature ships.** Every Claude call checks cache first.
4. **Implement the full Claude fallback chain** (stale cache → rule-based → empty state) before shipping suggestions.
5. **Expo Push requires a development build.** Expo Go will not work for notifications.
6. **Open Food Facts is for product name and category only.** Never use it for nutrition values.
7. **Pantry quantities must always be >= 0.** Validate before every deduction.
8. **Serialize pantry consistently:** sort alphabetically, format as `name: quantity unit`, one per line.
9. **Cache nutrition estimates.** Never call Claude for the same ingredient + unit twice.
10. **`packages/` is the single source of truth.** Never duplicate types or schemas in apps.
11. **FastAPI only if Edge Functions genuinely can't do the job.**
12. **Don't start web app or DoorDash until all MVP phases ship on real devices.**
13. **All MVP nutrition values:** `nutrition_is_estimate = true`. Never present as clinically accurate.
14. **All admin writes:** insert to `audit_logs` first. This table can never be updated or deleted.

---

## User Roles

| Role | Can Do |
|---|---|
| `standard_user` | Manage own pantry, get suggestions, log meals, view own nutrition, manage grocery list |
| `admin` | View user list, disable accounts, view error logs, all post-MVP admin tools |
| `support_admin` | View accounts and logs for support cases |
| `coach` *(future)* | View linked client nutrition data |

Roles are set by the system only. A user can never set their own role.

---

## Notifications

All notifications are sent via Expo Push API. The pg_cron jobs run in UTC.

| Trigger | Time | Message |
|---|---|---|
| Morning meal prompt | 9:00 AM local | "What are you eating today? Tap to get meal suggestions." |
| Expiry warning | 8:00 AM local | "[item] expires soon — use it in today's meal." |
| Restock alert | On quantity = 0 | "[item] is out. Add it to your grocery list." |
| Low calorie reminder | 7:00 PM local | "You have [X] kcal left today. Tap to see what you can make." |

---

## Contributing

1. Check the current phase in [Build Phases](#build-phases)
2. Do not work on a phase until the previous one's exit criteria are met
3. All types go in `packages/types` — never in an app directly
4. All Supabase queries go through `packages/api` helpers where possible
5. Test on a real device, not just the simulator

---

## License

Private — all rights reserved.

---

*PrepPAL Product & Technical Specification v2.0 — Pre-development*
