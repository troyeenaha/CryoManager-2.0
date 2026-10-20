# Architecture and maintenance notes

```
Browser (React app on Vercel)
   │  HTTPS, anon key + user's login token
   ▼
Supabase
   ├─ Auth            — email/password logins, confirmation, password reset
   ├─ PostgREST API   — auto-generated from the tables
   ├─ Realtime        — pushes changes so open grids refresh
   └─ PostgreSQL      — tables, constraints, triggers, Row Level Security
```

The website is a static bundle and holds no secrets. **Every rule lives in the database**
(`supabase/migrations/0001_cryomanager_schema.sql`), so it applies no matter how someone connects.

## Data model

| Table | Key rules |
|---|---|
| `profiles` | One per login. New sign-ups are `pending` viewers. Only admins change roles or status, and the last active admin cannot be demoted. |
| `tanks` | Unique name (ignoring case). Rack capacity cannot drop below the number of racks. |
| `racks` | Belongs to a tank; unique name within the tank; the tank's rack capacity is enforced. |
| `boxes` | Belongs to a rack; unique name within the rack; `rows` × `cols` stored separately (up to 26 × 30). |
| `samples` | **At most one active sample per (box, row, col)**, enforced by a unique index. The position must be inside the grid. `sample_code` (S-000001) never changes. `vial_count` records several vials in one slot. |
| `audit_log` | Written only by triggers: create / update / move / archive / remove / restore / delete, with before and after values. App users cannot edit it. |
| `app_settings` | Single row of lab defaults. |

Deleting is restrictive by design. Foreign keys use `ON DELETE RESTRICT`, so nothing that holds
inventory can be deleted. Samples are archived or marked removed rather than deleted, which keeps their history.

**Concurrency.** Every row has a `version` that increases on each update. The app saves with
`WHERE id = … AND version = <the version it loaded>`; if someone else saved first, nothing is updated
and the user sees "changed by someone else". Moves go through the `move_sample()` function, a single
transaction that also checks the version. Two people taking the same empty slot at the same moment are
stopped by the unique index, and capacity checks lock the parent row.

**Permissions (Row Level Security).**

| | Admin | Lab Member | Read-Only | Pending / disabled |
|---|---|---|---|---|
| View inventory and reports | ✓ | ✓ | ✓ | ✗ |
| Add / edit / move / archive samples | ✓ | ✓ | ✗ | ✗ |
| Manage tanks, racks, boxes | ✓ | ✗ | ✗ | ✗ |
| Approve users, change roles, settings | ✓ | ✗ | ✗ | ✗ |
| Read sample history | ✓ | ✓ | ✓ | ✗ |
| Read full audit log | ✓ | ✗ | ✗ | ✗ |

**Utilization** = active samples ÷ (rows × cols of all non-archived boxes). It counts physical slots,
not sample names or vials.

## Where to change things

| To change… | Edit |
|---|---|
| Colours / palette | `src/index.css` (`@theme`) and `src/lib/grid.js` (`BOX_COLORS`) |
| Sidebar items | `src/components/Layout.jsx` (`NAV`) |
| Sample form fields | `src/components/SampleForm.jsx`, plus a new migration adding the column |
| Reports | `src/api/reports.js` (`REPORTS`) |
| Any database access | `src/api/data.js`, the only file that queries tables |

**Changing the database.** Never edit `0001_…sql` after it has been run. Add a new file such as
`supabase/migrations/0002_add_freezer_type.sql`, run it in the SQL Editor, commit it, and run
`npm run test:db` locally if you have PostgreSQL installed.

**Updating libraries.** Once or twice a year, run `npm outdated`, then `npm update`, then `npm run build`.
Test the main flows on a Vercel preview deployment before merging.

**Moving away from Supabase or Vercel.** The database is standard PostgreSQL: `pg_dump` it into any
Postgres host. Only `src/lib/supabase.js`, `src/api/data.js` and `src/auth/` would need rewriting if a
different API layer were ever used. The frontend is a static site that any host (Netlify, Cloudflare
Pages, a university server) can serve.
