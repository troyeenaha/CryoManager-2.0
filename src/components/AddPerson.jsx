import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, MailCheck, Send, Trash2, UserPlus, X } from 'lucide-react';
import { supabase, unwrap } from '../lib/supabase.js';
import { sendAccountEmail, useInventoryMutation } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { useToast } from './Toast.jsx';
import { friendlyError } from '../lib/errors.js';
import { cleanInitials, fmtDate, roleLabel, suggestInitials } from '../lib/format.js';
import { Alert, Button, Card, Field, Input, Modal, Select } from './ui.jsx';

export const useInvitations = (enabled = true) =>
  useQuery({
    queryKey: ['profiles', 'invitations'],
    enabled,
    queryFn: async () =>
      unwrap(await supabase.from('invitations').select('*').is('accepted_at', null).neq('status', 'declined').order('created_at', { ascending: false })),
  });

/** Turns Supabase email errors into something an admin can act on. */
function emailProblem(err) {
  const m = err?.message || String(err);
  if (/not authorized|authorized/i.test(m)) {
    return "Supabase's built-in email can only reach members of your Supabase team. Set up the free email sender (docs/EMAIL_SETUP.md) so invitations reach everyone.";
  }
  if (/rate limit|too many/i.test(m)) return 'Too many emails were sent in a short time. Wait a few minutes and use "Send email again".';
  return friendlyError(err);
}

const ROLE_OPTIONS = (
  <>
    <option value="member">Lab Member: add, edit, move and take out samples</option>
    <option value="viewer">Read-Only: view, search and download reports</option>
    <option value="admin">Administrator: everything, including users</option>
  </>
);

export function AddPersonDialog({ onClose, existingEmails }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({ first: '', last: '', initials: '', email: '', role: 'member' });
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(null); // { inv, emailError }
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation(async (v) =>
    unwrap(await supabase.from('invitations').upsert(v, { onConflict: 'email' }).select().single()));

  const email = form.email.trim().toLowerCase();
  const errors = {
    first: !form.first.trim() && 'Required.',
    last: !form.last.trim() && 'Required.',
    initials: !cleanInitials(form.initials) && 'Required (letters, up to 4).',
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Enter a valid email.' : existingEmails.has(email) && 'This person already has an account.',
  };
  const setName = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (!f.initials || f.initials === suggestInitials(`${f.first} ${f.last}`)) next.initials = suggestInitials(`${next.first} ${next.last}`);
      return next;
    });
  };

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    const fullName = `${form.first.trim()} ${form.last.trim()}`;
    const initials = cleanInitials(form.initials);
    run(async () => {
      const inv = await save.mutateAsync({
        email, full_name: fullName, initials, role: form.role,
        status: 'invited', source: 'admin', accepted_at: null, invited_by: profile.id,
      });
      let emailError = null;
      try { await sendAccountEmail({ email, fullName, initials }); } catch (err) { emailError = emailProblem(err); }
      return { inv, emailError };
    }, { onDone: setDone });
  }

  if (done) {
    const { inv, emailError } = done;
    return (
      <Modal open onClose={onClose} size="md" title={emailError ? `${inv.full_name} was added, but the email wasn't sent` : `Invitation sent to ${inv.full_name}`}
        subtitle={`${inv.email} · ${roleLabel[inv.role]}`}
        footer={<Button onClick={onClose}>Done</Button>}>
        {emailError ? (
          <Alert tone="warning">{emailError}</Alert>
        ) : (
          <div className="flex gap-3 rounded-xl bg-brand-50 border border-brand-100 p-4 text-sm text-slate-700">
            <MailCheck className="h-5 w-5 text-brand-700 shrink-0" />
            <p>
              They'll get an email from CryoManager. Clicking the link confirms their email address. Then they check their name and initials,
              choose a password, and they're in as <strong>{roleLabel[inv.role]}</strong>, with nothing else for you to approve.
            </p>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">You can send the email again from the Users page under <em>Invited</em>.</p>
      </Modal>
    );
  }

  const err = (k) => touched && errors[k];
  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="md"
      title="Add a person"
      subtitle="They'll get an email invitation to confirm their address and choose a password."
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="add-person" loading={busy}><Send className="h-4 w-4" /> Send invitation</Button></>}
    >
      <form id="add-person" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required error={err('first')}><Input value={form.first} onChange={setName('first')} placeholder="Greg" /></Field>
          <Field label="Last name" required error={err('last')}><Input value={form.last} onChange={setName('last')} placeholder="Thurber" /></Field>
        </div>
        <Field label="Initials" required error={err('initials')} hint="They can change these when they set up their account">
          <Input value={form.initials} onChange={(e) => setForm((f) => ({ ...f, initials: cleanInitials(e.target.value) }))} maxLength={4} className="uppercase font-semibold max-w-28" />
        </Field>
        <Field label="Email" required error={err('email')}>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@umich.edu" />
        </Field>
        <Field label="Access">
          <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>{ROLE_OPTIONS}</Select>
        </Field>
      </form>
    </Modal>
  );
}

/** Access requests (to approve) and invitations not yet used (to resend or cancel). */
export function InvitationsList() {
  const toast = useToast();
  const { profile } = useAuth();
  const { data } = useInvitations();
  const [roleFor, setRoleFor] = useState({});
  const [busy, setBusy] = useState(null);
  const update = useInventoryMutation(async ({ email, values }) =>
    unwrap(await supabase.from('invitations').update(values).eq('email', email).select().single()));
  const remove = useInventoryMutation(async (email) => unwrap(await supabase.from('invitations').delete().eq('email', email).select()));

  const requests = (data || []).filter((i) => i.status === 'requested');
  const invited = (data || []).filter((i) => i.status === 'invited');

  async function act(key, fn) {
    setBusy(key);
    try { await fn(); } catch (err) { toast.error(emailProblem(err)); } finally { setBusy(null); }
  }
  const approve = (inv) => act(`a-${inv.email}`, async () => {
    const role = roleFor[inv.email] || 'member';
    await update.mutateAsync({ email: inv.email, values: { status: 'invited', role, invited_by: profile.id } });
    try {
      await sendAccountEmail({ email: inv.email, fullName: inv.full_name, initials: inv.initials });
      toast.success(`${inv.full_name} approved as ${roleLabel[role]}. They've been emailed a link to confirm and set their password.`);
    } catch (err) {
      toast.error(`${inv.full_name} is approved, but the email failed: ${emailProblem(err)}`);
    }
  });
  const decline = (inv) => act(`d-${inv.email}`, async () => {
    await update.mutateAsync({ email: inv.email, values: { status: 'declined' } });
    toast.success(`Request from ${inv.full_name} declined.`);
  });
  const resend = (inv) => act(`r-${inv.email}`, async () => {
    await sendAccountEmail({ email: inv.email, fullName: inv.full_name, initials: inv.initials });
    toast.success(`Email sent again to ${inv.email}.`);
  });
  const cancel = (inv) => act(`c-${inv.email}`, async () => {
    await remove.mutateAsync(inv.email);
    toast.success(`Invitation for ${inv.email} cancelled.`);
  });

  const Who = ({ inv, when }) => (
    <div className="flex-1 min-w-0">
      <div className="font-medium text-slate-900">
        {inv.initials && <span className="mr-2 inline-flex rounded bg-brand-50 px-1.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/20">{inv.initials}</span>}
        {inv.full_name}
      </div>
      <div className="text-sm text-slate-500">{inv.email} · {when}</div>
    </div>
  );

  return (
    <>
      <section className="mb-8" aria-labelledby="req-h">
        <h2 id="req-h" className="text-lg font-semibold text-slate-900 mb-3">
          Access requests {requests.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-800">{requests.length}</span>}
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">No one is waiting. New people can click <em>Request access</em> on the sign-in page.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((inv) => (
              <Card key={inv.email} className="p-4 flex flex-col md:flex-row md:items-center gap-3 border-amber-200">
                <Who inv={inv} when={`asked ${fmtDate(inv.requested_at || inv.created_at)}`} />
                <Select aria-label="Access to give" value={roleFor[inv.email] || 'member'} onChange={(e) => setRoleFor((r) => ({ ...r, [inv.email]: e.target.value }))} className="md:w-44">
                  <option value="member">Lab Member</option>
                  <option value="viewer">Read-Only</option>
                  <option value="admin">Administrator</option>
                </Select>
                <div className="flex gap-2">
                  <Button onClick={() => approve(inv)} loading={busy === `a-${inv.email}`} disabled={Boolean(busy)}><Check className="h-4 w-4" /> Approve</Button>
                  <Button variant="secondary" onClick={() => decline(inv)} loading={busy === `d-${inv.email}`} disabled={Boolean(busy)}><X className="h-4 w-4" /> Decline</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {invited.length > 0 && (
        <section className="mb-8" aria-labelledby="inv-h">
          <h2 id="inv-h" className="text-lg font-semibold text-slate-900 mb-1">Invited, not set up yet ({invited.length})</h2>
          <p className="text-sm text-slate-500 mb-3">They've been emailed a link but haven't finished setting up their account.</p>
          <div className="space-y-3">
            {invited.map((inv) => (
              <Card key={inv.email} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <Who inv={inv} when={`${roleLabel[inv.role]} · ${inv.source === 'request' ? 'approved' : 'invited'} ${fmtDate(inv.created_at)}`} />
                <Button variant="secondary" size="sm" onClick={() => resend(inv)} loading={busy === `r-${inv.email}`} disabled={Boolean(busy)}>
                  <Send className="h-4 w-4" /> Send email again
                </Button>
                <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => cancel(inv)} disabled={Boolean(busy)}>
                  <Trash2 className="h-4 w-4" /> Cancel
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export { UserPlus };
