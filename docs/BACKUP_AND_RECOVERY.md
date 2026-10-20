# Backups and recovery

The inventory lives in one PostgreSQL database. Losing it is unacceptable, so CryoManager uses
**three independent layers** of protection. A backup is not trusted until a restore from it has
succeeded (see the restore test below).

| Layer | What | Where it lives | Who controls it |
|---|---|---|---|
| 1. Supabase daily backups | Full database, kept 7 days | Supabase | Supabase (**Pro plan only**) |
| 2. Nightly off-site dump | Full database (`pg_dump`), kept 90 days | GitHub Actions artifacts and/or your own storage | You |
| 3. Manual exports | Excel / JSON of all records | Your computer / lab drive | Any admin, from **Settings → Export all data** |

CryoManager stores no uploaded files (photos and attachments are not part of version 1), so the
database is the entire backup.

---

## Layer 1: Supabase backups

On the **Pro plan** (about $25/month), Supabase takes daily backups automatically. Restore from
**Database → Backups**. The free plan has no downloadable automatic backups, and free projects
**pause after a week of inactivity**. That is why the free plan is not recommended for real lab data
(see [COSTS.md](COSTS.md)).

## Layer 2: Nightly off-site dump (recommended on any plan)

`.github/workflows/backup.yml` runs every night and saves a compressed `pg_dump` of the database as a
private GitHub Actions artifact, kept for 90 days. The connection also counts as activity, which keeps a
free-tier project from pausing.

**Set it up:**

1. In Supabase, click **Connect** (top bar) → **Session pooler** and copy the connection string.
   It looks like `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`.
   Put your database password in place of `[YOUR-PASSWORD]`.
2. In GitHub → your repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `SUPABASE_DB_URL`
   - Value: the connection string from step 1
3. Go to the **Actions** tab, open **Nightly database backup**, and click **Run workflow** once to test it.
   A `cryomanager-backup-…` artifact should appear on the run page.

The repository must stay **private**, because the artifacts contain all inventory data.

For an extra copy outside GitHub, download one artifact a month to the lab's university storage
(for example a Dropbox or Google Drive folder from U-M).

## Layer 3: Manual exports

**Settings → Export all data** downloads every tank, rack, box and sample, including archived ones, as
Excel or JSON. Administrator exports also include users and the full audit log. These files are readable
without any special software and are the "worst case" fallback. Download one at least once a month.

---

## Restore test: do this once now, then every 6 months

You need PostgreSQL client tools (`brew install postgresql@16` on a Mac, or the PostgreSQL installer on Windows).

1. Download the latest backup artifact from GitHub Actions and unzip it. You get `cryomanager-YYYY-MM-DD.dump`.
2. Create a **second, temporary** Supabase project (free) called `cryomanager-restore-test`.
3. Restore into it:
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -d "postgresql://postgres.<test-ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
     cryomanager-YYYY-MM-DD.dump
   ```
   (Messages about objects in the `auth` / `storage` schemas already existing are expected.)
4. In the test project's SQL Editor, compare counts with the live app's **Reports** page:
   ```sql
   select (select count(*) from tanks) tanks, (select count(*) from racks) racks,
          (select count(*) from boxes) boxes,
          (select count(*) from samples where status = 'active') samples,
          (select count(*) from audit_log) audit_events;
   ```
5. If the numbers match, the backup is good. Record the date below, then delete the test project.

| Date | Backup tested | Result | By |
|---|---|---|---|
| | | | |

## Recovery procedure: if data is lost or damaged

1. **Stop changes.** Tell the lab not to use CryoManager until you say so.
2. **Find out what happened.** As an admin, use Supabase → Table Editor → `audit_log` to see the most
   recent changes, with who made them and their before and after values. A single bad edit can be
   undone by hand from the `old_values` column, with no restore needed.
3. **For larger damage, restore:**
   - *Pro plan:* Supabase → Database → Backups → choose the last good day → Restore.
   - *Otherwise:* restore the last good nightly dump into a **new** Supabase project (steps 2–3 of the
     restore test). Then point Vercel's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at the new
     project and redeploy. User logins are included in the dump.
4. Re-enter any changes made between the backup and the incident (check the lab notebook and `audit_log`).
5. Write a short note of what happened and add a row to the table above.
