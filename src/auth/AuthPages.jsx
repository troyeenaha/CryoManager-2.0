import { useState } from 'react';
import { Clock, KeyRound, LogOut, ShieldOff } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../lib/errors.js';
import { useAuth } from './AuthProvider.jsx';
import { cleanInitials, suggestInitials } from '../lib/format.js';
import { BrandMark } from '../components/Brand.jsx';
import { Button, Field, Input, Alert } from '../components/ui.jsx';

function AuthShell({ children, title, subtitle }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <BrandMark className="h-12 w-12" />
          <div>
            <div className="text-2xl font-semibold text-slate-900 tracking-tight">CryoManager</div>
            <div className="text-sm text-slate-500">Lab Storage System</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Thurber Lab · University of Michigan</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState('signin'); // signin | signup | forgot
  const [form, setForm] = useState({ name: '', initials: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: form.email.trim(), password: form.password,
        });
        if (err) throw err;
      } else if (mode === 'signup') {
        if (form.password.length < 8) throw new Error('Use a password of at least 8 characters.');
        if (!cleanInitials(form.initials)) throw new Error('Please enter your initials (as written on your tubes).');
        const { error: err } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { full_name: form.name.trim(), initials: cleanInitials(form.initials) }, emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        setNotice('Account created. Check your email to confirm your address; an administrator will then approve your access.');
        setMode('signin');
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: `${window.location.origin}/`,
        });
        if (err) throw err;
        setNotice('If that email has an account, a password-reset link is on its way.');
        setMode('signin');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    signin: ['Sign in', 'Use your lab account to access the inventory.'],
    signup: ['Request access', 'Create an account. A lab administrator must approve it before you can see the inventory.'],
    forgot: ['Reset password', 'We will email you a secure link to choose a new password.'],
  };

  return (
    <AuthShell title={titles[mode][0]} subtitle={titles[mode][1]}>
      <form onSubmit={submit} className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {mode === 'signup' && (
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Full name" required>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f, name,
                    initials: !f.initials || f.initials === suggestInitials(f.name) ? suggestInitials(name) : f.initials,
                  }));
                }}
                required
                autoComplete="name"
              />
            </Field>
            <Field label="Initials" required hint="As on your tubes">
              <Input value={form.initials} onChange={(e) => setForm((f) => ({ ...f, initials: cleanInitials(e.target.value) }))} placeholder="TN" maxLength={4} className="uppercase font-semibold" />
            </Field>
          </div>
        )}
        <Field label="Email" required>
          <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        {mode !== 'forgot' && (
          <Field label="Password" required hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
            <Input
              type="password" value={form.password} onChange={set('password')} required
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>
        )}
        <Button type="submit" className="w-full" loading={busy}>
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap justify-between gap-2 text-sm">
        {mode !== 'signin' ? (
          <button className="text-brand-700 hover:underline" onClick={() => setMode('signin')}>Back to sign in</button>
        ) : (
          <>
            <button className="text-brand-700 hover:underline" onClick={() => setMode('signup')}>Request an account</button>
            <button className="text-slate-500 hover:underline" onClick={() => setMode('forgot')}>Forgot password?</button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export function SetNewPasswordPage() {
  const { finishRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    finishRecovery();
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="New password" required hint="At least 8 characters">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>
          <KeyRound className="h-4 w-4" /> Save password
        </Button>
      </form>
    </AuthShell>
  );
}

export function AccessPendingPage() {
  const { profile, signOut } = useAuth();
  const disabled = profile?.status === 'disabled';
  return (
    <AuthShell
      title={disabled ? 'Access removed' : 'Waiting for approval'}
      subtitle={
        disabled
          ? 'Your access to the lab inventory has been turned off. Contact a lab administrator if this is a mistake.'
          : 'Your account has been created. A lab administrator needs to approve it before you can view the inventory. This page updates automatically.'
      }
    >
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
        {disabled ? <ShieldOff className="h-5 w-5 text-red-500" /> : <Clock className="h-5 w-5 text-amber-500" />}
        <div className="text-sm">
          <div className="font-medium text-slate-900">{profile?.full_name || profile?.email}</div>
          <div className="text-slate-500">{profile?.email}</div>
        </div>
      </div>
      <Button variant="secondary" className="w-full mt-5" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </AuthShell>
  );
}

export function NotConfiguredPage() {
  return (
    <AuthShell title="Setup needed" subtitle="CryoManager is not connected to its database yet.">
      <div className="text-sm text-slate-600 space-y-3">
        <p>
          Add <code className="px-1 rounded bg-slate-100">VITE_SUPABASE_URL</code> and{' '}
          <code className="px-1 rounded bg-slate-100">VITE_SUPABASE_ANON_KEY</code> as environment variables
          (in <code className="px-1 rounded bg-slate-100">.env.local</code> locally, or in Vercel → Settings →
          Environment Variables), then redeploy.
        </p>
        <p>See <strong>docs/SETUP.md</strong> in the repository for step-by-step instructions.</p>
      </div>
    </AuthShell>
  );
}

export function SetInitialsPage() {
  const { profile, refreshProfile } = useAuth();
  const [initials, setInitials] = useState(suggestInitials(profile?.full_name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const value = cleanInitials(initials);
    if (!value) return setError('Please enter your initials.');
    setBusy(true);
    setError('');
    const { error: err } = await supabase.from('profiles').update({ initials: value }).eq('id', profile.id);
    if (err) { setBusy(false); return setError(friendlyError(err)); }
    await refreshProfile();
    setBusy(false);
  }

  return (
    <AuthShell
      title="What are your initials?"
      subtitle="These appear as “Who Passaged” on samples, the same way you write them on tubes. You can change them later in Settings."
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Initials" required hint="Letters only, up to 4 (e.g. TN)">
          <Input value={initials} onChange={(e) => setInitials(cleanInitials(e.target.value))} maxLength={4} className="uppercase text-lg font-semibold tracking-widest" autoFocus />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>Continue</Button>
      </form>
    </AuthShell>
  );
}
