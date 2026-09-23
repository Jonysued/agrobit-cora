# AGENTS.md

## Project Context

Lucient is a user-owned agricultural monitoring application. Keep changes
focused, preserve existing UI conventions, and do not commit secrets.

## Architecture

- Frontend: React 18 + Vite.
- Backend: Supabase Auth, Postgres, Storage, Realtime, and Edge Functions.
- Hosting: Vercel.
- Client adapter: `src/api/backendClient.js`.
- Database migrations: `supabase/migrations/`.
- Server integrations: `supabase/functions/`.

## Required checks

Run `npm run typecheck`, `npm run lint`, and `npm run build` before
publishing changes.

## Security

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.
- Browser code may use only the publishable/anon key.
- Keep RLS enabled on every table in the public schema.
- External provider credentials belong in Supabase Edge Function secrets.
