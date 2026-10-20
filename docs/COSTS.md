# Running costs

Prices were checked in October 2026. They change, so confirm on each provider's pricing page before budgeting.

| Service | Plan | Cost | Notes |
|---|---|---|---|
| GitHub | Free | $0 | Private repositories and the Actions minutes for the nightly backup are free. |
| Vercel | Hobby | $0 | Enough for a lab's internal tool. Vercel's terms limit Hobby to non-commercial use; move to Pro ($20/user/month) if the university or a grant requires a commercial plan. |
| Supabase | **Pro (recommended)** | **~$25/month** | Daily backups, no pausing, 8 GB database. |
| Supabase | Free | $0 | 500 MB database (years of samples), but projects **pause after 7 days without activity** and have no automatic backups. |
| Email (SMTP) | Resend / Brevo free tier | $0 | Optional; makes sign-up and reset emails reliable. |
| Custom domain | Optional | ~$12–20/year | Or ask U-M IT for a subdomain. |

**Recommendation:** run on Supabase Pro, about **$300 a year**, for real inventory. That is the only
recurring cost, and it buys the daily backups and no-pause guarantee that a "data loss is unacceptable"
system needs.

If you start on the free plan, the nightly backup workflow (BACKUP_AND_RECOVERY.md) both protects the data
and keeps the project active, so it does not pause. Upgrading later takes one click and needs no code changes.

Sources: supabase.com/pricing, vercel.com/pricing, and a third-party summary of Supabase's 2026 free tier
(automationatlas.io).
