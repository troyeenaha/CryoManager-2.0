# CryoManager

Laboratory LN2 inventory system for the Thurber Lab, University of Michigan.

**Tank → Rack → Box → Grid position → Sample**, with an interactive grid view, global search,
CSV/Excel reports, role-based access, and a full audit trail.

The whole system is yours: source code on GitHub, the website on Vercel, and the database and logins
in your own Supabase project. No builder platform is involved.

| Part | Technology |
|---|---|
| Frontend | React 19 + Vite, Tailwind CSS 4, Lucide icons, TanStack Query |
| Database & logins | Supabase (PostgreSQL + Supabase Auth) |
| Security | PostgreSQL Row Level Security, enforced in the database |
| Hosting | Vercel |

## Getting started

Follow **[docs/SETUP.md](docs/SETUP.md)**. It takes about 30 minutes:
Supabase project → run one SQL file → make yourself admin → deploy on Vercel.

## Documentation

- [docs/SETUP.md](docs/SETUP.md): first-time setup and deployment
- [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md): backups, restore tests and the recovery procedure
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together, data rules, and where to change things
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md): a one-page guide for lab members
- [docs/COSTS.md](docs/COSTS.md): what this costs to run

## Local development

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev                    # http://localhost:5173
npm run build                  # production build into dist/
```

Database tests run the schema and 42 behaviour checks against a throwaway local PostgreSQL:

```bash
PGHOST=localhost PGUSER=postgres npm run test:db
```

## Project layout

```
supabase/migrations/   The database: tables, rules, permissions, audit log (run in Supabase)
supabase/tests/        Database behaviour tests
src/api/               All database access (data.js) and report definitions (reports.js)
src/auth/              Sign-in, sign-up, password reset, approval gate
src/components/        Layout, sidebar, modals, sample forms, shared UI
src/pages/             Tanks, Racks, Boxes, Grid View, Reports, Users, Settings
src/lib/               Supabase client, error messages, grid helpers, CSV/Excel export
scripts/               Backup and test scripts
.github/workflows/     Nightly off-site database backup (optional)
```
