import { useState } from 'react';
import { Check, ShieldOff, UserCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import { AddPersonDialog, InvitationsList } from '../components/AddPerson.jsx';
import { supabase, unwrap } from '../lib/supabase.js';
import { useInventoryMutation, useProfiles } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, roleLabel } from '../lib/format.js';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Select, Spinner, StatusBadge } from '../components/ui.jsx';

const ROLE_HELP = {
  admin: 'Everything, including users, storage structure, settings and the full audit log.',
  member: 'View and search; add, edit, move and archive samples.',
  viewer: 'View, search and download reports. Cannot change anything.',
};

async function updateProfile(id, values) {
  const rows = unwrap(await supabase.from('profiles').update(values).eq('id', id).select());
  if (!rows.length) throw new Error('No change was saved.');
  return rows[0];
}

export default function UsersPage() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useProfiles();
  const [confirm, setConfirm] = useState(null);
  const [roleFor, setRoleFor] = useState({}); // pending user id -> chosen role
  const [adding, setAdding] = useState(false);
  const mutate = useInventoryMutation(({ id, values }) => updateProfile(id, values));

  async function apply(user, values, message) {
    try {
      await mutate.mutateAsync({ id: user.id, values });
      toast.success(message);
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setConfirm(null);
  }

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const users = data || [];
  const pending = users.filter((u) => u.status === 'pending');
  const others = users.filter((u) => u.status !== 'pending');

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Add people, set what they can do, and remove access"
        actions={<Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" /> Add person</Button>}
      />
      {adding && <AddPersonDialog onClose={() => setAdding(false)} existingEmails={new Set((data || []).map((u) => u.email.toLowerCase()))} />}

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {Object.entries(ROLE_HELP).map(([role, help]) => (
          <Card key={role} className="p-4">
            <div className="text-sm font-medium text-slate-900">{roleLabel[role]}</div>
            <div className="text-xs text-slate-500 mt-1">{help}</div>
          </Card>
        ))}
      </div>

      <InvitationsList />

      <section className="mb-8" aria-labelledby="pending-h">
        <h2 id="pending-h" className="text-lg font-semibold text-slate-900 mb-3">Waiting for approval {pending.length > 0 && `(${pending.length})`}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">No one is waiting. New people can request access from the sign-in page.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((u) => (
              <Card key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900">{u.full_name || '(no name given)'}{u.initials && <span className="ml-2 text-xs font-semibold text-brand-800">{u.initials}</span>}</div>
                  <div className="text-sm text-slate-500">{u.email} · requested {fmtDate(u.created_at)}</div>
                </div>
                <Select aria-label="Role to grant" value={roleFor[u.id] || 'member'} onChange={(e) => setRoleFor((r) => ({ ...r, [u.id]: e.target.value }))} className="sm:w-44">
                  <option value="member">Lab Member</option>
                  <option value="viewer">Read-Only</option>
                  <option value="admin">Administrator</option>
                </Select>
                <div className="flex gap-2">
                  <Button onClick={() => apply(u, { status: 'active', role: roleFor[u.id] || 'member' }, `${u.email} approved as ${roleLabel[roleFor[u.id] || 'member']}.`)} disabled={mutate.isPending}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm({ user: u, values: { status: 'disabled' }, title: 'Decline access?', label: 'Decline' })} disabled={mutate.isPending}>
                    Decline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="all-h">
        <h2 id="all-h" className="text-lg font-semibold text-slate-900 mb-3">All users</h2>
        {others.length === 0 ? <EmptyState icon={UsersIcon} title="No users yet" /> : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 hidden md:table-cell">Approved</th>
                    <th className="px-4 py-3 text-right">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {others.map((u) => {
                    const self = u.id === me.id;
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">
                            {u.initials && <span className="mr-2 inline-flex rounded bg-brand-50 px-1.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-700/20">{u.initials}</span>}
                            {u.full_name || '—'}{self && <span className="text-slate-400 font-normal"> (you)</span>}
                          </div>
                          <div className="text-xs text-slate-500">{u.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            disabled={u.status !== 'active' || mutate.isPending}
                            onChange={(e) => {
                              const role = e.target.value;
                              if (self || role === 'admin' || u.role === 'admin') {
                                setConfirm({ user: u, values: { role }, title: `Make ${u.email} ${roleLabel[role]}?`, label: 'Change role' });
                              } else {
                                apply(u, { role }, `${u.email} is now ${roleLabel[role]}.`);
                              }
                            }}
                            className="h-9 w-40"
                          >
                            <option value="admin">Administrator</option>
                            <option value="member">Lab Member</option>
                            <option value="viewer">Read-Only</option>
                          </Select>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-500">{fmtDate(u.approved_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {u.status === 'active' ? (
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" disabled={self}
                              onClick={() => setConfirm({ user: u, values: { status: 'disabled' }, title: 'Remove access?', label: 'Remove access' })}>
                              <ShieldOff className="h-4 w-4" /> Remove
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => apply(u, { status: 'active' }, `${u.email} can sign in again.`)}>
                              <UserCheck className="h-4 w-4" /> Restore
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <Alert tone="info" className="mt-4">
          Removing access takes effect immediately: the database stops returning data to that account on its next request.
          Their past changes stay in the audit history. To delete a login completely, use Supabase → Authentication → Users.
        </Alert>
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => apply(confirm.user, confirm.values, `${confirm.user.email} updated.`)}
        busy={mutate.isPending}
        title={confirm?.title}
        confirmLabel={confirm?.label}
        tone={confirm?.values?.status === 'disabled' ? 'danger' : 'primary'}
      >
        <p><strong>{confirm?.user.full_name || confirm?.user.email}</strong> ({confirm?.user.email})</p>
        {confirm?.values?.status === 'disabled' && <p>They will no longer be able to see or change the inventory.</p>}
        {confirm?.values?.role === 'admin' && <p>Administrators can manage users, delete storage and see the full audit log.</p>}
        {confirm?.user.id === me.id && confirm?.values?.role && <p>You are changing your own role. You may lose access to this page.</p>}
      </ConfirmDialog>
    </>
  );
}
