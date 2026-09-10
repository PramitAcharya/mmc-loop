# MMCLoop

An independent student community platform for Makawanpur Multiple Campus,
Hetauda, Nepal. It is unofficial and is not affiliated with, operated by, or
endorsed by Makawanpur Multiple Campus.

## Features

- Public and anonymous community posts
- Persistent voting, comments, replies, and reporting
- Search, categories, and feed filters
- "Who's Free?" activities
- Direct messaging with realtime updates and unread indicators
- Protected moderator workflows
- Supabase Auth, PostgreSQL, Storage, and Row Level Security

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19) + Nitro SSR
- [Supabase](https://supabase.com/) (Auth, Postgres, Storage, Realtime)
- Bun (runtime) + Vite; Tailwind CSS v4; shadcn-style UI

## Local development

Requirements:

- Bun 1.2.15 or newer
- Node.js 24.x (see `.nvmrc`)

```sh
bun install --frozen-lockfile
bun run dev
```

Available commands:

```sh
bun run lint        # ESLint + Prettier
bun run typecheck   # tsc --noEmit
bun run build       # production SSR build (Nitro)
bun run format      # Prettier write
```

## Environment

Copy `.env.example` to `.env` and fill in values from your Supabase project:

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_PROJECT_ID` | yes | the `<project-ref>` from the URL |
| `SUPABASE_PUBLISHABLE_KEY` | yes | `sb_publishable_…` key |
| `SUPABASE_SERVICE_ROLE_KEY` | no | **never** put in the client bundle; the app does not require it |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | same values, injected into the browser bundle at build time |

Never commit `.env` or any Supabase access token, service-role key, or database
password.

## Database

Apply the migrations in `supabase/migrations` to a Supabase project before use.
They create the full schema: RLS, realtime, chat, voting (atomic with score
reconciliation), comments, reports, activities, feed views, and demo content.

The migration workflow (`.github/workflows/supabase-migrations.yml`) applies new
migrations from `main` when the `production` environment has
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_ID` secrets.

### Getting a moderator account

Moderation runs on the `public.user_roles` table (roles `admin` or
`moderator`). To grant it, find the target user's id in `auth.users`, then in
the Supabase SQL editor:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<auth user id>', 'moderator');
```

Only signed-in users holding a moderator/admin role can open the moderation
queue at `/admin`.

## Deployment

### Vercel (production)

The live site runs on Vercel. `vercel.json` pins the Nitro Vercel preset:

```
framework   nitro
build       NITRO_PRESET=vercel bun run build
output      .vercel/output
```

Configure the same environment variables as local development (including the
`VITE_` prefix). See `docs/audit/02-auth-config.md` for the Supabase and Google
OAuth settings that must be enabled for auth to work in production (email
confirmation, redirect allowlist, Google OAuth client).

### Netlify (alternative)

`netlify.toml` builds with `NITRO_PRESET=netlify` into `dist`. Only one
platform should own a deployment of the same migrations/project.

## Architecture notes

- Scroll and written decisions about the codebase live in
  [`docs/audit/01-audit.md`](docs/audit/01-audit.md) (security posture,
  defect register, phase mapping).
- Chat is a private 1:1 thread protected by RLS; it is **not** end-to-end
  encrypted — see [`docs/audit/03-e2ee-evaluation.md`](docs/audit/03-e2ee-evaluation.md)
  for the honest assessment.