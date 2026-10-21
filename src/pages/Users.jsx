import { useState } from 'react';
import { Check, TriangleAlert, UserCheck, UserPlus, UserX, Users as UsersIcon } from 'lucide-react';
import { AddPersonDialog, InvitationsList } from '../components/AddPerson.jsx';
import { supabase, unwrap } from '../lib/supabase.js';
import { useInventoryMutation, useProfiles } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { friendlyError } from '../lib/errors.js';
import { fmtDate, roleLabel } from '../lib/format.js';
import { Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Modal, PageHeader, Select, Spinner, StatusBadge } from '../components/ui.jsx';

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

/** Two steps: explain what happens, then ask "are you sure?" before deleting. */
function RemovePersonDialog({ person, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const remove = useInventoryMutation(async (id) => unwrap(await supabase.rpc('remove_person', { p_user: id })));
  const who = person.full_name || person.email;

  async function confirmRemove() {
    try {
      await remove.mutateAsync(person.id);
      toast.success(`${who} has been removed.`);
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }

  if (step === 1) {
    return (
      <Modal
        open
        onClose={onClose}
        size="sm"
        title={`Remove ${who}?`}
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => setStep(2)}>Continue</Button></>}
      >
        <div className="text-sm text-slate-600 space-y-3">
          <p><strong>{who}</strong>{person.initials ? ` (${person.initials})` : ''} · {person.email}</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Their account and login are deleted. They can't sign in any more.</li>
            <li>They disappear from the Users list.</li>
            <li>The samples they added and the history of what they did <strong>stay</strong> as they are.</li>
            <li>You can invite the same email again later if needed.</li>
          </ul>
        </div>
      </Modal>
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      busy={remove.isPending}
      size="sm"
      title="Are you sure?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>No, keep {person.full_name ? person.full_name.split(' ')[0] : 'them'}</Button>
          <Button variant="danger" onClick={confirmRemove} loading={remove.isPending}><UserX className="h-4 w-4" /> Yes, remove permanently</Button>
        </>
      }
    >
      <div className="flex gap-3 text-sm text-slate-700">
        <TriangleAlert className="h-5 w-5 text-red-500 shrink-0" />
        <p>This permanently removes <strong>{who}</strong> ({person.email}). It can't be undone.</p>
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useProfiles();
  const [confirm, setConfirm] = useState(null);
  const [roleFor, setRoleFor] = useState({}); // pending user id -> chosen role
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null); // person being removed
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

      {pending.length > 0 && <section className="mb-8" aria-labelledby="pending-h">
        <h2 id="pending-h" className="text-lg font-semibold text-slate-900 mb-3">Accounts waiting for approval ({pending.length})</h2>
        {(
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
                  <Button variant="secondary" onClick={() => setRemoving(u)} disabled={mutate.isPending}>
                    Decline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>}

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
                          <div className="flex justify-end gap-1">
                            {u.status === 'disabled' && (
                              <Button variant="ghost" size="sm" onClick={() => apply(u, { status: 'active' }, `${u.email} can sign in again.`)}>
                                <UserCheck className="h-4 w-4" /> Restore
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" disabled={self}
                              title={self ? 'You cannot remove your own account' : undefined}
                              onClick={() => setRemoving(u)}>
                              <UserX className="h-4 w-4" /> Remove
                            </Button>
                          </div>
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
          Removing someone deletes their account and login straight away. The samples they added and the history
          of what they did stay exactly as they are. You can invite the same email again later.
        </Alert>
      </section>

      {removing && <RemovePersonDialog person={removing} onClose={() => setRemoving(null)} />}

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
