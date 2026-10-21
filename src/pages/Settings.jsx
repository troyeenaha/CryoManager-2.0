import { useState } from 'react';
import { BellRing, DatabaseBackup, FileJson, FileSpreadsheet, KeyRound, Save, UserRound } from 'lucide-react';
import { supabase, unwrap } from '../lib/supabase.js';
import { useInventoryMutation, useSettings } from '../api/data.js';
import { buildFullExport } from '../api/reports.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { useFormSubmit } from '../components/useFormSubmit.js';
import { downloadBlob, downloadXlsx } from '../lib/export.js';
import { friendlyError } from '../lib/errors.js';
import { cleanInitials, roleLabel } from '../lib/format.js';
import { Alert, Button, Card, Field, Input, PageHeader, Spinner } from '../components/ui.jsx';

function Section({ icon: Icon, title, description, children }) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-brand-700" /></div>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ProfileSection() {
  const { profile, user, refreshProfile } = useAuth();
  const [name, setName] = useState(profile.full_name || '');
  const [initials, setInitials] = useState(profile.initials || '');
  const [pw, setPw] = useState('');
  const nameForm = useFormSubmit();
  const pwForm = useFormSubmit();

  return (
    <Section icon={UserRound} title="My account" description={`${user.email} · ${roleLabel[profile.role]}`}>
      <form
        className="flex flex-col sm:flex-row gap-3 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return nameForm.setError('Enter your name.');
          if (!cleanInitials(initials)) return nameForm.setError('Enter your initials.');
          nameForm.run(async () => {
            unwrap(await supabase.from('profiles').update({ full_name: name.trim(), initials: cleanInitials(initials) }).eq('id', profile.id).select());
            await refreshProfile();
          }, { success: 'Profile updated.' });
        }}
      >
        <Field label="Display name" className="flex-1"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
        <Field label="Initials" hint="Shown as Who Passaged" className="sm:w-32">
          <Input value={initials} onChange={(e) => setInitials(cleanInitials(e.target.value))} maxLength={4} className="uppercase font-semibold" />
        </Field>
        <Button type="submit" variant="secondary" loading={nameForm.busy}><Save className="h-4 w-4" /> Save</Button>
      </form>
      {nameForm.error && <Alert tone="error" className="mt-3">{nameForm.error}</Alert>}

      <form
        className="flex flex-col sm:flex-row gap-3 sm:items-end mt-5 pt-5 border-t border-slate-100"
        onSubmit={(e) => {
          e.preventDefault();
          if (pw.length < 8) return pwForm.setError('Use at least 8 characters.');
          pwForm.run(async () => {
            const { error } = await supabase.auth.updateUser({ password: pw });
            if (error) throw error;
            setPw('');
          }, { success: 'Password changed.' });
        }}
      >
        <Field label="New password" hint="At least 8 characters" className="flex-1">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="secondary" loading={pwForm.busy}><KeyRound className="h-4 w-4" /> Change password</Button>
      </form>
      {pwForm.error && <Alert tone="error" className="mt-3">{pwForm.error}</Alert>}
    </Section>
  );
}

function LabDefaults() {
  const { data, isLoading } = useSettings();
  const save = useInventoryMutation(async (v) => unwrap(await supabase.from('app_settings').update(v).eq('id', 1).select().single()));
  const { run, busy, error } = useFormSubmit();
  const [form, setForm] = useState(null);
  if (isLoading) return <Spinner className="py-6" />;
  const f = form || {
    default_box_rows: data?.default_box_rows ?? 9,
    default_box_cols: data?.default_box_cols ?? 9,
    default_temperature_c: data?.default_temperature_c ?? -196,
  };
  const set = (k) => (e) => setForm({ ...f, [k]: e.target.value });
  return (
    <Section icon={Save} title="Lab defaults" description="Pre-filled values when adding new boxes and tanks.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => save.mutateAsync({
            default_box_rows: Number(f.default_box_rows),
            default_box_cols: Number(f.default_box_cols),
            default_temperature_c: Number(f.default_temperature_c),
          }), { success: 'Defaults saved.' });
        }}
      >
        {error && <Alert tone="error" className="mb-4">{error}</Alert>}
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Default box rows"><Input type="number" min={1} max={26} value={f.default_box_rows} onChange={set('default_box_rows')} /></Field>
          <Field label="Default box columns"><Input type="number" min={1} max={30} value={f.default_box_cols} onChange={set('default_box_cols')} /></Field>
          <Field label="Default tank temperature (°C)"><Input type="number" step="0.1" value={f.default_temperature_c} onChange={set('default_temperature_c')} /></Field>
        </div>
        <Button type="submit" className="mt-4" loading={busy}>Save defaults</Button>
      </form>
    </Section>
  );
}

function RequestAlerts() {
  const { data, isLoading } = useSettings();
  const save = useInventoryMutation(async (v) => unwrap(await supabase.from('app_settings').update(v).eq('id', 1).select().single()));
  const { run, busy, error } = useFormSubmit();
  const [email, setEmail] = useState(null);
  if (isLoading) return null;
  const value = email ?? data?.alert_email ?? '';
  return (
    <Section icon={BellRing} title="Access request alerts" description="Who gets an email when someone asks for access on the sign-in page.">
      <form
        className="flex flex-col sm:flex-row gap-3 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim().toLowerCase();
          if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return;
          run(() => save.mutateAsync({ alert_email: v }), { success: v ? `Alerts will go to ${v}.` : 'Email alerts turned off.' });
        }}
      >
        <Field label="Send alerts to" className="flex-1" hint="Must be the email you used to create your free Resend account">
          <Input type="email" value={value} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Button type="submit" variant="secondary" loading={busy}><Save className="h-4 w-4" /> Save</Button>
      </form>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      <p className="mt-3 text-xs text-slate-500">
        Requests always appear on the Users page. Emailed alerts also need the one-time Resend setup in
        <code className="mx-1 px-1 bg-slate-100 rounded">docs/EMAIL_SETUP.md</code>.
      </p>
    </Section>
  );
}

function DataExport() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);

  async function exportAll(kind) {
    setBusy(kind);
    try {
      const { sheets, json } = await buildFullExport({ includeAdmin: isAdmin });
      if (kind === 'xlsx') downloadXlsx(sheets, 'full-export');
      else {
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `cryomanager-full-export-${new Date().toISOString().slice(0, 10)}.json`);
      }
      toast.success('Export downloaded.');
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section icon={DatabaseBackup} title="Export all data" description="Download every tank, rack, box and sample (including archived ones) in open formats.">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => exportAll('xlsx')} loading={busy === 'xlsx'} disabled={Boolean(busy)}>
          <FileSpreadsheet className="h-4 w-4" /> Excel workbook
        </Button>
        <Button variant="secondary" onClick={() => exportAll('json')} loading={busy === 'json'} disabled={Boolean(busy)}>
          <FileJson className="h-4 w-4" /> JSON
        </Button>
      </div>
      <p className="text-sm text-slate-500 mt-4">
        {isAdmin
          ? 'Administrator exports also include users and the full audit log.'
          : 'Administrator exports additionally include users and the audit log.'}{' '}
        These downloads are a convenient snapshot. They are <strong>not</strong> a substitute for the automated database
        backups described in <code className="px-1 bg-slate-100 rounded">docs/BACKUP_AND_RECOVERY.md</code>.
      </p>
    </Section>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6 max-w-3xl">
        <ProfileSection />
        {isAdmin && <LabDefaults />}
        {isAdmin && <RequestAlerts />}
        <DataExport />
      </div>
    </>
  );
}
