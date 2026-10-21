# Email setup (one time, free)

CryoManager sends three kinds of email:

| Email | Who gets it | Sent by |
|---|---|---|
| "You're approved / you're invited: click to confirm and set your password" | New lab members | Supabase, through **your Gmail** (Part A) |
| "Reset your password" | Anyone who forgot it | Supabase, through **your Gmail** (Part A) |
| "Someone is asking for access" | You (the admin) | Resend (Part B, optional) |

**Why Part A is required:** Supabase's built-in email sender only delivers to members of your
*Supabase team*, and only about 2 emails an hour. Without Part A, other lab members will never
receive their invitation or password-reset emails.

---

## Part A: send sign-in emails through Gmail (required, ~5 minutes)

Use a Gmail account you control (for example your personal Gmail). Emails will come *from* this address.

1. **Turn on 2-Step Verification** for that Google account (Google Account → Security → 2-Step Verification),
   if it isn't already on.
2. **Create an App Password:** go to <https://myaccount.google.com/apppasswords>, type the name
   `CryoManager`, and click **Create**. Google shows a 16-letter password. Copy it (spaces don't matter).
   - If that page says app passwords aren't available, the account may be managed by a school or
     workplace; use a personal Gmail instead.
3. In **Supabase → Authentication → Emails → SMTP Settings**, turn on **Enable custom SMTP** and fill in:

   | Field | Value |
   |---|---|
   | Sender email | your Gmail address |
   | Sender name | `CryoManager – Thurber Lab` |
   | Host | `smtp.gmail.com` |
   | Port | `465` |
   | Username | your Gmail address |
   | Password | the 16-letter App Password |

   Click **Save**.
4. **Rate limit:** Supabase → Authentication → **Rate Limits** → set *Rate limit for sending emails*
   to `100` per hour, then save.
5. **Make the emails say "CryoManager":** in Supabase → Authentication → **Emails → Templates**, edit
   these two templates. Keep `{{ .ConfirmationURL }}` exactly as written:

   **Confirm signup** and **Magic Link**: same text for both
   - Subject: `Your CryoManager account – Thurber Lab`
   - Body:
     ```html
     <h2>Welcome to CryoManager</h2>
     <p>You've been given access to the Thurber Lab LN2 inventory.</p>
     <p><a href="{{ .ConfirmationURL }}">Click here to confirm your email and set your password</a></p>
     <p>If you didn't expect this, you can ignore this email.</p>
     ```
6. **Test it:** in CryoManager, go to Users → **Add person**, add yourself with a *different* email
   address (or a lab-mate), and check that the email arrives (look in spam the first time).

Gmail lets a personal account send about 500 emails a day, far more than a lab needs.

---

## Part B: email alerts when someone requests access (optional, ~5 minutes)

Without this, requests still appear on the **Users** page (with a count). This adds an email to you.

1. Create a free account at <https://resend.com> **using the email address where you want alerts**.
2. In Resend, go to **API Keys → Create API key** (name it `CryoManager`, permission *Sending access*)
   and copy the key (it starts with `re_`).
3. In **Supabase → Database → Extensions**, search for **pg_net** and turn it on.
4. In **Supabase → SQL Editor → new snippet**, paste this, put your key between the quotes, and click **Run**:
   ```sql
   select vault.create_secret('re_PASTE_YOUR_KEY_HERE', 'resend_api_key');
   ```
5. In **CryoManager → Settings → Access request alerts**, enter the same email you used for Resend,
   and click **Save**.
6. Test it: sign out, click **New here? Request access**, and send a request with a test email.
   The alert should arrive within a minute.

Resend's free plan without your own web domain can only send to the address you signed up with,
which is why the alert goes to that one address.

To change the key later:
```sql
select vault.update_secret((select id from vault.secrets where name = 'resend_api_key'), 're_NEW_KEY');
```
