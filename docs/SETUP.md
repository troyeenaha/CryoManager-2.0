# Setup and deployment

You will need accounts on **GitHub**, **Supabase** and **Vercel**. Sign in to Vercel and Supabase
with your GitHub account. Plan for about 30 minutes.

---

## 1. Put the code on GitHub

1. Create a **new private** repository, for example `thurber-lab/cryomanager`.
2. Upload the contents of this folder, or from a terminal:
   ```bash
   cd cryomanager
   git init && git add . && git commit -m "CryoManager v1"
   git branch -M main
   git remote add origin https://github.com/<you>/cryomanager.git
   git push -u origin main
   ```
3. Never commit a `.env.local` file. It is already in `.gitignore`.

## 2. Create the Supabase project

1. Go to https://supabase.com/dashboard and choose **New project**.
   - Region: **East US** (closest to Michigan).
   - Database password: generate a strong one and **store it in a password manager**. The app never
     needs it, but you will need it for backups and restores.
2. When the project is ready, open **SQL Editor → New query**, paste the whole contents of
   `supabase/migrations/0001_cryomanager_schema.sql`, and click **Run**. You should see "Success. No rows returned".
3. Open **Authentication → Sign In / Providers → Email** and confirm that **Email** is enabled and
   **Confirm email** is ON.
4. Open **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address, for example `https://cryomanager.vercel.app` (you can update it after step 4).
   - **Redirect URLs:** add `https://cryomanager.vercel.app/**` and `http://localhost:5173/**`.
5. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`

   Do **not** copy the `service_role` / secret key anywhere in this project.

> **Email limits.** Supabase's built-in email sender only allows a handful of messages per hour, which
> is enough for a lab to get started. For reliable sign-up and password-reset emails, add an SMTP sender
> under **Authentication → Emails → SMTP Settings**. A free Resend or Brevo account works, as does a
> University of Michigan mail relay if IT provides one.

## 3. Deploy on Vercel

1. Go to https://vercel.com/new and import the GitHub repository.
2. Framework preset: **Vite** (detected automatically). Build command `npm run build`, output `dist`.
3. Under **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Click **Deploy**. Vercel will give you an address like `https://cryomanager.vercel.app`, served over HTTPS.
5. If the address differs from what you entered in step 2.4, update Supabase's **Site URL** and **Redirect URLs**.

Every push to `main` now redeploys automatically.

## 4. Make yourself the first administrator

1. Open the website, click **Request an account**, sign up, and confirm your email.
   You will see "Waiting for approval". That is expected.
2. In Supabase → **SQL Editor**, run (with your email):
   ```sql
   update public.profiles
      set role = 'admin', status = 'active'
    where email = 'you@umich.edu';
   ```
3. Refresh the website. You are now an administrator, and every later approval happens on the **Users** page.

## 5. Set up the lab

1. **Tanks → Add Tank** (for example "LN2 Tank", NCRC Building 28, Room 028-G135, 6 racks, −196 °C).
2. **Racks → Add Rack** (for example "A", 12 boxes).
3. **Boxes → Add Box** (for example "A1", 12 × 12, Blue).
4. **Grid View**: click an empty position to add the first sample.
5. Ask lab members to **Request an account**, then approve them on **Users** as *Lab Member* or *Read-Only*.

Optional: put the authorised Thurber Lab logo at `public/thurber-lab-logo.png`. It appears at the
bottom of the sidebar automatically.

## 6. Turn on email (required before inviting anyone)

Follow [EMAIL_SETUP.md](EMAIL_SETUP.md). Without it, lab members won't receive their invitation emails.

## 7. Turn on backups

Do this before entering real inventory. See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).

## 7. Moving data from the old Base44 app (optional)

If the old app has records worth keeping, export them from Base44 as CSV. Then use Supabase →
**Table Editor → samples → Insert → Import data from CSV** after creating the matching tanks,
racks and boxes. The `box_id`, `row_num` (A = 1, B = 2 …) and `col_num` columns must be filled in.
The database rejects duplicates and positions outside the grid, so a bad import cannot corrupt the inventory.
Cancel Base44 only after you have checked the imported data in the new app.

## Security checklist

- [ ] GitHub repository is **private**.
- [ ] Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in Vercel. No service-role key anywhere.
- [ ] Database password is stored in a password manager, not in a file.
- [ ] "Confirm email" is ON in Supabase Auth.
- [ ] When someone leaves the lab, click **Remove** on the Users page the same day.
- [ ] At least two people hold the admin role, so the lab is never locked out.
- [ ] Supabase and GitHub accounts have two-factor authentication enabled.
