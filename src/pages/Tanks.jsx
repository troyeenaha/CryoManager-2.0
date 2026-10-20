import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Container, MapPin, Pencil, Plus, Thermometer, Trash2, LayoutList } from 'lucide-react';
import { deleteRow, saveRow, useInventoryMutation, useSettings, useTanks } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { useFormSubmit } from '../components/useFormSubmit.js';
import { friendlyError } from '../lib/errors.js';
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Menu, Modal, PageHeader,
  ProgressBar, SearchInput, Segmented, Spinner, StatusBadge, Textarea,
} from '../components/ui.jsx';
import { pct } from '../lib/grid.js';

function TankForm({ tank, open, onClose }) {
  const { data: settings } = useSettings();
  const isNew = !tank?.id;
  const [form, setForm] = useState(() => ({
    name: tank?.name ?? '',
    location: tank?.location ?? '',
    rack_capacity: tank?.rack_capacity ?? 6,
    temperature_c: tank?.temperature_c ?? settings?.default_temperature_c ?? -196,
    status: tank?.status === 'inactive' ? 'inactive' : 'active',
    notes: tank?.notes ?? '',
  }));
  const [touched, setTouched] = useState(false);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((values) => saveRow('tanks', values));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const errors = {
    name: !form.name.trim() && 'Tank name is required.',
    rack_capacity: !(Number(form.rack_capacity) >= 1 && Number(form.rack_capacity) <= 100) && 'Enter 1–100.',
    temperature_c: (form.temperature_c === '' || Number.isNaN(Number(form.temperature_c))) && 'Enter a temperature.',
  };
  const invalid = Object.values(errors).some(Boolean);

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    run(
      () => save.mutateAsync({
        id: tank?.id,
        version: tank?.version,
        name: form.name.trim(),
        location: form.location.trim(),
        rack_capacity: Number(form.rack_capacity),
        temperature_c: Number(form.temperature_c),
        status: tank?.status === 'archived' ? 'archived' : form.status,
        notes: form.notes.trim(),
      }),
      { success: (t) => `Tank "${t.name}" ${isNew ? 'added' : 'saved'}.`, onDone: onClose },
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={isNew ? 'Add New Tank' : 'Edit Tank'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="tank-form" loading={busy}>Save</Button>
        </>
      }
    >
      <form id="tank-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Tank Name" required error={touched && errors.name}>
          <Input value={form.name} onChange={set('name')} placeholder="e.g. LN2 Tank" maxLength={80} />
        </Field>
        <Field label="Location" hint="Building and room">
          <Input value={form.location} onChange={set('location')} placeholder="e.g. NCRC Building 28, Room 028-G135" maxLength={160} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rack Capacity" required error={touched && errors.rack_capacity}>
            <Input type="number" min={1} max={100} value={form.rack_capacity} onChange={set('rack_capacity')} />
          </Field>
          <Field label="Temperature (°C)" required error={touched && errors.temperature_c}>
            <Input type="number" step="0.1" value={form.temperature_c} onChange={set('temperature_c')} />
          </Field>
        </div>
        {tank?.status !== 'archived' && (
          <Field label="Status">
            <div>
              <Segmented
                label="Status"
                value={form.status}
                onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
              />
            </div>
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

function TankCard({ tank, isAdmin, onEdit, onDelete, onArchive, onRestore }) {
  const navigate = useNavigate();
  const used = pct(tank.rack_count, tank.rack_capacity);
  const open = () => navigate(`/racks?tank=${tank.id}`);
  return (
    <Card
      className="group p-5 flex flex-col gap-4 transition-all duration-150 hover:shadow-md hover:border-slate-300 cursor-pointer"
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open()}
      tabIndex={0}
      role="link"
      aria-label={`Open ${tank.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
          <Container className="h-5 w-5 text-brand-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900 truncate">{tank.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={tank.status} />
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Menu
                label={`Actions for ${tank.name}`}
                items={isAdmin ? [
                  { label: 'Edit', icon: Pencil, onClick: onEdit },
                  tank.status === 'archived'
                    ? { label: 'Restore', icon: ArchiveRestore, onClick: onRestore }
                    : { label: 'Archive', icon: Archive, onClick: onArchive },
                  { label: 'Delete', icon: Trash2, onClick: onDelete, danger: true },
                ] : []}
              />
            </div>
          </div>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex items-start gap-2 text-slate-600">
          <MapPin className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
          <dd>{tank.location || <span className="text-slate-400">No location set</span>}</dd>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <Thermometer className="h-4 w-4 text-slate-400" />
          <dd>{Number(tank.temperature_c).toLocaleString()}°C</dd>
        </div>
      </dl>
      <div className="mt-auto pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="flex items-center gap-1.5 text-slate-500"><LayoutList className="h-4 w-4" /> Racks</span>
          <span className="font-medium text-slate-900">{tank.rack_count} / {tank.rack_capacity}</span>
        </div>
        <ProgressBar value={used} />
      </div>
    </Card>
  );
}

export default function TanksPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { data: tanks, isLoading, error, refetch } = useTanks();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null); // tank object or {} for new
  const [confirm, setConfirm] = useState(null); // { type, tank }
  const mutate = useInventoryMutation(async ({ type, tank }) => {
    if (type === 'delete') return deleteRow('tanks', tank.id);
    return saveRow('tanks', { id: tank.id, version: tank.version, status: type === 'archive' ? 'archived' : 'active' });
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tanks || [])
      .filter((t) => showArchived || t.status !== 'archived')
      .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.location || '').toLowerCase().includes(q));
  }, [tanks, search, showArchived]);

  async function doConfirm() {
    try {
      await mutate.mutateAsync(confirm);
      const verb = { delete: 'deleted', archive: 'archived', restore: 'restored' }[confirm.type];
      toast.success(`Tank "${confirm.tank.name}" ${verb}.`);
      setConfirm(null);
    } catch (err) {
      toast.error(friendlyError(err));
      setConfirm(null);
    }
  }

  const archivedCount = (tanks || []).filter((t) => t.status === 'archived').length;

  return (
    <>
      <PageHeader
        title="Tanks"
        subtitle="Liquid nitrogen storage tanks"
        actions={isAdmin && (
          <Button onClick={() => setEditing({})}>
            <Plus className="h-4 w-4" /> Add Tank
          </Button>
        )}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tanks by name or location" className="sm:max-w-sm flex-1" />
        {archivedCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-700 h-4 w-4" />
            Show archived ({archivedCount})
          </label>
        )}
      </div>

      {isLoading ? <Spinner /> : error ? <ErrorState error={error} onRetry={refetch} /> : visible.length === 0 ? (
        <EmptyState
          icon={Container}
          title={search ? 'No tanks match your search' : 'No tanks yet'}
          action={isAdmin && !search && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add Tank</Button>}
        >
          {!search && (isAdmin ? 'Add your first LN2 tank to start building the inventory.' : 'An administrator needs to add the first tank.')}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <TankCard
              key={t.id}
              tank={t}
              isAdmin={isAdmin}
              onEdit={() => setEditing(t)}
              onDelete={() => setConfirm({ type: 'delete', tank: t })}
              onArchive={() => setConfirm({ type: 'archive', tank: t })}
              onRestore={() => setConfirm({ type: 'restore', tank: t })}
            />
          ))}
        </div>
      )}

      {editing && <TankForm key={editing.id || 'new'} tank={editing} open onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        busy={mutate.isPending}
        tone={confirm?.type === 'restore' ? 'primary' : 'danger'}
        title={confirm && { delete: 'Delete tank?', archive: 'Archive tank?', restore: 'Restore tank?' }[confirm.type]}
        confirmLabel={confirm && { delete: 'Delete permanently', archive: 'Archive', restore: 'Restore' }[confirm.type]}
        requireText={confirm?.type === 'delete' ? confirm.tank.name : undefined}
      >
        {confirm?.type === 'delete' && (
          <>
            <p>This permanently deletes <strong>{confirm.tank.name}</strong>.</p>
            {confirm.tank.rack_count > 0 ? (
              <Alert tone="warning">This tank still holds {confirm.tank.rack_count} rack(s), so the database will refuse. Move or archive its racks first, or archive the tank instead.</Alert>
            ) : (
              <p>Only empty tanks can be deleted (a record of the deletion stays in the audit log). Archiving is usually the safer choice.</p>
            )}
          </>
        )}
        {confirm?.type === 'archive' && (
          <p>Archived tanks are hidden from everyday views but kept for the record. A tank can only be archived once all of its racks have been archived or moved.</p>
        )}
        {confirm?.type === 'restore' && <p>Make <strong>{confirm.tank.name}</strong> active again?</p>}
      </ConfirmDialog>
    </>
  );
}
