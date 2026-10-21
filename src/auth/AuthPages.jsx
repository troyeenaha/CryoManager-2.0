import { useState } from 'react';
import { Clock, KeyRound, LogOut, MailCheck, ShieldOff } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { requestAccess } from '../api/data.js';
import { friendlyError } from '../lib/errors.js';
import { useAuth } from './AuthProvider.jsx';
import { cleanInitials, suggestInitials } from '../lib/format.js';
import { BrandMark, LabLogo } from '../components/Brand.jsx';
import { Alert, Button, Field, Input, cx } from '../components/ui.jsx';

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
          {title && <h1 className="text-lg font-semibold text-slate-900">{title}</h1>}
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          <div className={title ? 'mt-6' : ''}>{children}</div>
        </div>
        <div className="mt-8"><LabLogo className="max-h-20" /></div>
      </div>
    </div>
  );
}

const nameParts = (full) => {
  const p = (full || '').trim().split(/\s+/);
  return { first: p[0] || '', last: p.slice(1).join(' ') };
};

/** First page anyone sees: "Sign in" or "New here? Request access". */
export function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(params.get('signup') ? 'request' : 'signin'); // signin | request | forgot
  const [sent, setSent] = useState(null); // result of a request
  const [form, setForm] = useState(() => {
    const n = nameParts(params.get('name'));
    return { first: n.first, last: n.last, initials: cleanInitials(params.get('initials') || ''), email: params.get('email') || '', password: '' };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setName = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      const before = suggestInitials(`${f.first} ${f.last}`);
      if (!f.initials || f.initials === before) next.initials = suggestInitials(`${next.first} ${next.last}`);
      return next;
    });
  };
  const go = (t) => { setTab(t); setError(''); setNotice(''); setSent(null); };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (tab === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (err) throw err;
      } else if (tab === 'request') {
        if (!form.first.trim() || !form.last.trim()) throw new Error('Please enter your first and last name.');
        if (!cleanInitials(form.initials)) throw new Error('Please enter your initials (as written on your tubes).');
        const result = await requestAccess({ email: form.email, fullName: `${form.first.trim()} ${form.last.trim()}`, initials: form.initials });
        setSent(result);
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: `${window.location.origin}/` });
        if (err) throw err;
        setNotice('If that email has an account, a link to choose a new password is on its way.');
        setTab('signin');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const msg = {
      requested: ['Request sent', `Thanks, ${form.first}. A lab administrator will review your request. Once you're approved you'll get an email from CryoManager. Click the link in it to confirm your email address and choose your password.`],
      already_requested: ['Request already received', 'Your request is waiting for an administrator. You will get an email as soon as you are approved.'],
      already_invited: ['You have already been invited', 'Look in your inbox (and spam folder) for the email from CryoManager, and click the link in it to set up your account.'],
      has_account: ['You already have an account', 'Sign in with your email and password. If you forgot your password, use "Forgot password?".'],
    }[sent] || ['Request sent', ''];
    return (
      <AuthShell title={msg[0]} subtitle={msg[1]}>
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-100 p-4">
          {sent === 'has_account' ? <KeyRound className="h-5 w-5 text-brand-700" /> : <MailCheck className="h-5 w-5 text-brand-700" />}
          <div className="text-sm">
            <div className="font-medium text-slate-900">{form.first} {form.last} <span className="text-brand-800">({cleanInitials(form.initials)})</span></div>
            <div className="text-slate-500">{form.email.trim().toLowerCase()}</div>
          </div>
        </div>
        <Button variant="secondary" className="w-full mt-5" onClick={() => go('signin')}>Back to sign in</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      {tab !== 'forgot' ? (
        <div role="tablist" aria-label="Sign in or request access" className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 mb-6">
          {[['signin', 'Sign in'], ['request', 'New here? Request access']].map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => go(id)}
              className={cx('rounded-lg py-2 text-sm font-medium transition', tab === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-900">Reset password</h1>
          <p className="text-sm text-slate-500 mt-1">We'll email you a secure link to choose a new password.</p>
        </div>
      )}

      {tab === 'request' && (
        <p className="text-sm text-slate-500 -mt-2 mb-5">
          Tell us who you are. A lab administrator approves your request, then you'll get an email to confirm your address and choose a password.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {tab === 'request' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name" required><Input value={form.first} onChange={setName('first')} autoComplete="given-name" /></Field>
              <Field label="Last name" required><Input value={form.last} onChange={setName('last')} autoComplete="family-name" /></Field>
            </div>
            <Field label="Initials" required hint="As you write them on your tubes, e.g. GT">
              <Input value={form.initials} onChange={(e) => setForm((f) => ({ ...f, initials: cleanInitials(e.target.value) }))} maxLength={4} className="uppercase font-semibold max-w-28" />
            </Field>
          </>
        )}
        <Field label="Email" required hint={tab === 'request' ? 'Your university email is best' : undefined}>
          <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        {tab === 'signin' && (
          <Field label="Password" required>
            <Input type="password" value={form.password} onChange={set('password')} required autoComplete="current-password" />
          </Field>
        )}
        <Button type="submit" className="w-full" loading={busy}>
          {tab === 'signin' ? 'Sign in' : tab === 'request' ? 'Send request' : 'Send reset link'}
        </Button>
      </form>
      <div className="mt-5 text-sm text-center">
        {tab === 'signin' && <button className="text-slate-500 hover:underline" onClick={() => go('forgot')}>Forgot password?</button>}
        {tab === 'forgot' && <button className="text-brand-700 hover:underline" onClick={() => go('signin')}>Back to sign in</button>}
      </div>
    </AuthShell>
  );
}

/**
 * After someone clicks the link in their approval / invitation email (which
 * also confirms their address), they finish here: name, initials, password.
 */
export function FinishSetupPage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const n = nameParts(profile?.full_name);
  const [form, setForm] = useState({ first: n.first, last: n.last, initials: profile?.initials || suggestInitials(profile?.full_name), pw: '', pw2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!form.first.trim() || !form.last.trim()) return setError('Please enter your first and last name.');
    if (!cleanInitials(form.initials)) return setError('Please enter your initials.');
    if (form.pw.length < 8) return setError('Use a password of at least 8 characters.');
    if (form.pw !== form.pw2) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: form.pw });
      if (pwErr) throw pwErr;
      const { error: pErr } = await supabase.from('profiles')
        .update({ full_name: `${form.first.trim()} ${form.last.trim()}`, initials: cleanInitials(form.initials), password_set: true })
        .eq('id', profile.id);
      if (pErr) throw pErr;
      await refreshProfile();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome! Finish setting up your account" subtitle={`Your email (${profile?.email}) is confirmed. Check your details and choose a password.`}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required><Input value={form.first} onChange={set('first')} autoComplete="given-name" /></Field>
          <Field label="Last name" required><Input value={form.last} onChange={set('last')} autoComplete="family-name" /></Field>
        </div>
        <Field label="Initials" required hint="Shown as Who Passaged on samples">
          <Input value={form.initials} onChange={(e) => setForm((f) => ({ ...f, initials: cleanInitials(e.target.value) }))} maxLength={4} className="uppercase font-semibold max-w-28" />
        </Field>
        <Field label="Choose a password" required hint="At least 8 characters">
          <Input type="password" value={form.pw} onChange={set('pw')} autoComplete="new-password" />
        </Field>
        <Field label="Type it again" required>
          <Input type="password" value={form.pw2} onChange={set('pw2')} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" loading={busy}>Finish and open CryoManager</Button>
      </form>
      <button className="mt-5 w-full text-center text-sm text-slate-500 hover:underline" onClick={signOut}>Not you? Sign out</button>
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
