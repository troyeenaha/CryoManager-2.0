import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import { supabase, unwrap } from '../lib/supabase.js';
import { useInventoryMutation } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { useToast } from './Toast.jsx';
import { cleanInitials, fmtDate, roleLabel, suggestInitials } from '../lib/format.js';
import { Alert, Button, Card, Field, Input, Modal, Select } from './ui.jsx';

export const useInvitations = () =>
  useQuery({
    queryKey: ['profiles', 'invitations'],
    queryFn: async () => unwrap(await supabase.from('invitations').select('*').is('accepted_at', null).order('created_at', { ascending: false })),
  });

export function inviteLink(inv) {
  const p = new URLSearchParams({ signup: '1', email: inv.email });
  if (inv.full_name) p.set('name', inv.full_name);
  if (inv.initials) p.set('initials', inv.initials);
  return `${window.location.origin}/?${p}`;
}

function inviteMessage(inv, me) {
  const first = (inv.full_name || '').split(' ')[0];
  return {
    subject: 'Your CryoManager account (Thurber Lab LN2 inventory)',
    body: [
      `Hi${first ? ` ${first}` : ''},`,
      '',
      `I've added you to CryoManager, the lab's LN2 inventory, as ${roleLabel[inv.role]}.`,
      '',
      'To set up your account (takes a minute):',
      `1. Open this link: ${inviteLink(inv)}`,
      '2. Choose a password and click Create account.',
      '3. Confirm your email from the message you receive, then sign in.',
      '',
      `Please use this email address (${inv.email}); that's how the app knows it's you.`,
      '',
      `— ${me?.full_name || ''}${me?.initials ? ` (${me.initials})` : ''}`,
    ].join('\n'),
  };
}

function SendInvite({ inv, compact }) {
  const { profile } = useAuth();
  const toast = useToast();
  const { subject, body } = inviteMessage(inv, profile);
  const mail = `mailto:${encodeURIComponent(inv.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      toast.success('Invitation message copied. Paste it into Slack, Teams or an email.');
    } catch {
      toast.error('Could not copy. Use the email button instead.');
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size={compact ? 'sm' : 'md'} onClick={() => { window.location.href = mail; }}>
        <Mail className="h-4 w-4" /> Email the invite
      </Button>
      <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={copy}>
        <Copy className="h-4 w-4" /> Copy message
      </Button>
    </div>
  );
}

export function AddPersonDialog({ onClose, existingEmails }) {
  const [form, setForm] = useState({ full_name: '', initials: '', email: '', role: 'member' });
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(null);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation(async (v) =>
    unwrap(await supabase.from('invitations').upsert(v, { onConflict: 'email' }).select().single()));

  const email = form.email.trim().toLowerCase();
  const errors = {
    full_name: !form.full_name.trim() && 'Required.',
    initials: !cleanInitials(form.initials) && 'Required (letters, up to 4).',
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'Enter a valid email.' : existingEmails.has(email) && 'This person already has an account.',
  };

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    run(
      () => save.mutateAsync({ email, full_name: form.full_name.trim(), initials: cleanInitials(form.initials), role: form.role, accepted_at: null }),
      { onDone: (inv) => setSaved(inv) },
    );
  }

  if (saved) {
    return (
      <Modal open onClose={onClose} size="md" title={`${saved.full_name} has been added`}
        subtitle={`${saved.email} · ${roleLabel[saved.role]}`}
        footer={<Button variant="secondary" onClick={onClose}>Done</Button>}>
        <p className="text-sm text-slate-600 mb-4">
          Last step: send them the sign-up link. When they create their account with <strong>{saved.email}</strong>,
          they're let in straight away as <strong>{roleLabel[saved.role]}</strong>, with no approval needed.
        </p>
        <SendInvite inv={saved} />
        <p className="mt-4 text-xs text-slate-500">
          You can also find this invitation later on the Users page under <em>Invited, not signed up yet</em>.
        </p>
      </Modal>
    );
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k) => touched && errors[k];
  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="md"
      title="Add a person"
      subtitle="They'll get a link to set their own password."
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="add-person" loading={busy}><UserPlus className="h-4 w-4" /> Add</Button></>}
    >
      <form id="add-person" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Full name" required error={err('full_name')}>
            <Input
              value={form.full_name}
              onChange={(e) => {
                const full_name = e.target.value;
                setForm((f) => ({ ...f, full_name, initials: !f.initials || f.initials === suggestInitials(f.full_name) ? suggestInitials(full_name) : f.initials }));
              }}
              placeholder="e.g. Kim Lee"
            />
          </Field>
          <Field label="Initials" required error={err('initials')}>
            <Input value={form.initials} onChange={(e) => setForm((f) => ({ ...f, initials: cleanInitials(e.target.value) }))} maxLength={4} className="uppercase font-semibold" />
          </Field>
        </div>
        <Field label="Email" required error={err('email')} hint="The email they will sign up with">
          <Input type="email" value={form.email} onChange={set('email')} placeholder="name@umich.edu" />
        </Field>
        <Field label="Access">
          <Select value={form.role} onChange={set('role')}>
            <option value="member">Lab Member: add, edit, move and take out samples</option>
            <option value="viewer">Read-Only: view, search and download reports</option>
            <option value="admin">Administrator: everything, including users</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

export function InvitationsList() {
  const toast = useToast();
  const { data } = useInvitations();
  const remove = useInventoryMutation(async (email) => unwrap(await supabase.from('invitations').delete().eq('email', email).select()));
  if (!data?.length) return null;
  return (
    <section className="mb-8" aria-labelledby="inv-h">
      <h2 id="inv-h" className="text-lg font-semibold text-slate-900 mb-3">Invited, not signed up yet ({data.length})</h2>
      <div className="space-y-3">
        {data.map((inv) => (
          <Card key={inv.email} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900">
                {inv.initials && <span className="mr-2 inline-flex rounded bg-brand-50 px-1.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/20">{inv.initials}</span>}
                {inv.full_name}
              </div>
              <div className="text-sm text-slate-500">{inv.email} · {roleLabel[inv.role]} · added {fmtDate(inv.created_at)}</div>
            </div>
            <SendInvite inv={inv} compact />
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={async () => {
                try { await remove.mutateAsync(inv.email); toast.success(`Invitation for ${inv.email} cancelled.`); } catch (e) { toast.error(e.message); }
              }}
            >
              <Trash2 className="h-4 w-4" /> Cancel
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
