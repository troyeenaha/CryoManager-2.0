// CryoManager — "notify-move" email sender (Supabase Edge Function).
//
// Sends "Troyee moved this vial from … to …" emails from the lab's Gmail,
// like the invitation emails. Only signed-in Lab Members / Administrators can
// use it, and it only emails people who have an active CryoManager account.
//
// Needs two secrets (Supabase → Edge Functions → Secrets):
//   GMAIL_USER          the Gmail address emails come from
//   GMAIL_APP_PASSWORD  a Gmail App Password for that address
// See docs/EMAIL_SETUP.md, Part C.

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const esc = (v: unknown) =>
  String(v ?? '').slice(0, 300)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clean = (v: unknown, n = 300) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

type Place = { grid?: string; where?: string };
type Move = { sample?: string; from?: Place; to?: Place };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  try {
    // 1. Who is asking? Must be signed in, active, and allowed to edit.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Please sign in again.' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await db.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    const { data: me } = await db.from('profiles')
      .select('full_name, initials, email, role, status').eq('id', user.id).single();
    if (!me || me.status !== 'active' || !['admin', 'member'].includes(me.role)) {
      return json({ error: 'Only Lab Members and Administrators can send move alerts.' }, 403);
    }

    // 2. What happened, and to whom.
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.recipientIds) ? body.recipientIds.slice(0, 40) : [];
    const moves: Move[] = Array.isArray(body.moves) ? body.moves.slice(0, 200) : [];
    const note = clean(body.note, 500);
    const boxId = /^[0-9a-f-]{36}$/i.test(String(body.boxId ?? '')) ? String(body.boxId) : '';
    if (!ids.length) return json({ error: 'Choose at least one person.' }, 400);
    if (!moves.length) return json({ error: 'Nothing to report.' }, 400);

    // Only people with an active CryoManager account can be emailed.
    const { data: people } = await db.from('profiles').select('email, status').in('id', ids);
    const to = [...new Set((people ?? []).filter((p) => p.status === 'active' && p.email).map((p) => p.email))];
    if (!to.length) return json({ error: 'None of the chosen people have an active account.' }, 400);

    // 3. Write the email.
    const who = clean(me.full_name || me.email, 120);
    const first = who.split(' ')[0] || who;
    const n = moves.length;
    const m0 = moves[0];
    const subject = n === 1
      ? `${first} moved ${clean(m0.sample, 80)} to ${clean(m0.to?.grid, 20)}`
      : `${first} moved ${n} vials in the LN2 inventory`;
    const origin = req.headers.get('origin') ?? '';
    const link = /^https?:\/\/[^/\s]+$/.test(origin) ? `${origin}${boxId ? `/grid/${boxId}` : ''}` : '';
    const date = new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' });
    const shown = moves.slice(0, 25);

    const sentence = (m: Move) =>
      `<strong>${esc(m.sample)}</strong> from <strong>${esc(m.from?.grid)}</strong> ` +
      `<span style="color:#64748b">(${esc(m.from?.where)})</span> to <strong>${esc(m.to?.grid)}</strong> ` +
      `<span style="color:#64748b">(${esc(m.to?.where)})</span>`;

    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.5">
  <h2 style="margin:0 0 4px;font-size:20px">Vial${n === 1 ? '' : 's'} moved in CryoManager</h2>
  <p style="margin:0 0 16px;color:#64748b;font-size:13px">Thurber Lab LN2 inventory · ${esc(date)}</p>
  <p style="margin:0 0 12px">${esc(who)}${me.initials ? ` (${esc(me.initials)})` : ''} moved ${n === 1 ? 'a vial' : `${n} vials`}:</p>
  <ul style="margin:0 0 16px;padding-left:20px">
    ${shown.map((m) => `<li style="margin-bottom:6px">${sentence(m)}</li>`).join('')}
    ${n > 25 ? `<li>…and ${n - 25} more (see My Activity in CryoManager)</li>` : ''}
  </ul>
  ${note ? `<p style="margin:0 0 16px;padding:10px 12px;background:#f1f5f9;border-radius:8px"><strong>Note:</strong> ${esc(note)}</p>` : ''}
  ${link ? `<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#0f4c75;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Open the box in CryoManager</a></p>` : ''}
  <p style="margin:0;color:#64748b;font-size:12px">You received this because ${esc(first)} chose to let you know. Reply to this email to answer ${esc(first)} directly.</p>
</div>`;

    const text = [
      `${who}${me.initials ? ` (${me.initials})` : ''} moved ${n === 1 ? 'a vial' : `${n} vials`} on ${date}:`,
      '',
      ...shown.map((m) => `- ${clean(m.sample)} from ${clean(m.from?.grid)} (${clean(m.from?.where)}) to ${clean(m.to?.grid)} (${clean(m.to?.where)})`),
      ...(n > 25 ? [`...and ${n - 25} more (see My Activity in CryoManager)`] : []),
      ...(note ? ['', `Note: ${note}`] : []),
      ...(link ? ['', `Open the box: ${link}`] : []),
    ].join('\n');

    // 4. Send through Gmail (port 465; Supabase blocks 25 and 587).
    const userAddr = Deno.env.get('GMAIL_USER');
    const pass = Deno.env.get('GMAIL_APP_PASSWORD');
    if (!userAddr || !pass) return json({ error: 'Email sending is not set up yet (missing Gmail secrets).' }, 500);
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: userAddr, pass: pass.replace(/\s+/g, '') },
    });
    await transport.sendMail({
      from: { name: 'CryoManager – Thurber Lab', address: userAddr },
      to,
      replyTo: me.email ? { name: who, address: me.email } : undefined,
      subject,
      text,
      html,
    });
    return json({ sent: to.length });
  } catch (err) {
    console.error(err);
    return json({ error: 'The email could not be sent. Please try again later.' }, 500);
  }
});
