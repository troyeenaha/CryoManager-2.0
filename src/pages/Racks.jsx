import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Boxes as BoxesIcon, LayoutList, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteRow, fillRacksWithBoxes, planRackFill, saveRow, useBoxes, useInventoryMutation, useRacks, useTanks } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { useFormSubmit } from '../components/useFormSubmit.js';
import { friendlyError } from '../lib/errors.js';
import { RACK_COLORS, boxColor, boxColorOf, pct, rackShade } from '../lib/grid.js';
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Menu, Modal, PageHeader,
  ProgressBar, SearchInput, Select, Spinner, StatusBadge, Textarea, cx,
} from '../components/ui.jsx';

/** A small drawing of the rack: slot 1 at the top (A1) down to the last slot (A12). */
function RackSchematic({ rack, boxes, onOpenBox }) {
  const inRack = boxes
    .filter((b) => b.rack_id === rack.id && b.status !== 'archived')
    .sort((a, b) => (a.shade_index || 0) - (b.shade_index || 0));
  const slots = Math.max(rack.box_capacity, inRack.length);
  const h = slots > 16 ? 'h-2.5' : slots > 12 ? 'h-3.5' : 'h-[18px]';
  return (
    <div className="w-40 shrink-0 select-none" aria-label={`Rack ${rack.name}: ${inRack.length} of ${rack.box_capacity} slots used, top to bottom`}>
      <div className="text-[10px] text-center text-slate-400 mb-1">top</div>
      <div className="rounded-md border-2 border-slate-300 bg-slate-50 p-1 relative">
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 h-2 w-8 rounded-t-md border-2 border-b-0 border-slate-300 bg-white" aria-hidden="true" />
        <div className="flex flex-col gap-[3px]">
          {Array.from({ length: slots }, (_, i) => {
            const b = inRack[i];
            if (!b) {
              return <div key={i} className={cx(h, 'rounded-[3px] border border-dashed border-slate-300 bg-white')} title={`Slot ${i + 1}: empty`} />;
            }
            const c = boxColorOf(b);
            return (
              <button
                key={b.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenBox(b); }}
                title={`Slot ${i + 1}: Box ${b.name}${b.label ? ` · ${b.label}` : ''} (${b.filled_positions}/${b.total_positions})`}
                className={cx(h, 'rounded-[3px] px-1 text-[9px] font-semibold leading-none flex items-center justify-between gap-1 overflow-hidden hover:ring-2 hover:ring-slate-400 transition')}
                style={{ background: c.fill, color: c.text }}
              >
                {slots <= 16 && <><span className="truncate">{b.name}{b.label && <span className="font-normal opacity-90"> · {b.label}</span>}</span><span className="opacity-80 font-normal shrink-0">{b.filled_positions}</span></>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="text-[10px] text-center text-slate-400 mt-1">bottom</div>
    </div>
  );
}

function RackForm({ rack, tanks, allRacks, defaultTankId, onClose }) {
  const isNew = !rack?.id;
  const [form, setForm] = useState({
    tank_id: rack?.tank_id ?? defaultTankId ?? '',
    name: rack?.name ?? '',
    position: rack?.position ?? '',
    box_capacity: rack?.box_capacity ?? 12,
    color: rack?.color ?? 'blue',
    notes: rack?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((v) => saveRow('racks', v));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectable = tanks.filter((t) => t.status !== 'archived' || t.id === rack?.tank_id);
  const chosenColor = form.color;
  const sameTank = (allRacks || []).filter((r) => r.tank_id === form.tank_id && r.status !== 'archived' && r.id !== rack?.id);
  const clash = sameTank.filter((r) => r.color === chosenColor);
  const tank = tanks.find((t) => t.id === form.tank_id);
  const full = tank && isNew && tank.rack_count >= tank.rack_capacity;
  const errors = {
    tank_id: !form.tank_id && 'Choose a tank.',
    name: !form.name.trim() && 'Rack name is required.',
    box_capacity: !(Number(form.box_capacity) >= 1 && Number(form.box_capacity) <= 100) && 'Enter 1–100.',
    position: form.position !== '' && !(Number(form.position) >= 1) && 'Must be 1 or more.',
  };

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    run(
      () => save.mutateAsync({
        id: rack?.id,
        version: rack?.version,
        tank_id: form.tank_id,
        name: form.name.trim(),
        position: form.position === '' ? null : Number(form.position),
        box_capacity: Number(form.box_capacity),
        color: chosenColor,
        notes: form.notes.trim(),
      }),
      { success: (r) => `Rack "${r.name}" ${isNew ? 'added' : 'saved'}.`, onDone: onClose },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={isNew ? 'Add New Rack' : 'Edit Rack'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="rack-form" loading={busy}>Save</Button></>}
    >
      <form id="rack-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {full && <Alert tone="warning">{tank.name} is full ({tank.rack_count} / {tank.rack_capacity} racks). Increase its capacity or choose another tank.</Alert>}
        <Field label="Tank" required error={touched && errors.tank_id}>
          <Select value={form.tank_id} onChange={set('tank_id')}>
            <option value="">Select a tank…</option>
            {selectable.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.rack_count}/{t.rack_capacity} racks)</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rack Name" required error={touched && errors.name} hint="Unique within its tank">
            <Input value={form.name} onChange={set('name')} placeholder="e.g. A" maxLength={40} />
          </Field>
          <Field label="Position in Tank" error={touched && errors.position} hint="Optional slot number">
            <Input type="number" min={1} value={form.position} onChange={set('position')} />
          </Field>
        </div>
        <Field label="Box Capacity" required error={touched && errors.box_capacity}>
          <Input type="number" min={1} max={100} value={form.box_capacity} onChange={set('box_capacity')} />
        </Field>
        <Field label="Rack Color" hint="Each box in this rack gets a shade of this color, from light (first box) to dark (last box)">
          <div>
            <div role="radiogroup" aria-label="Rack color" className="flex flex-wrap gap-2">
              {RACK_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={chosenColor === c.id}
                  aria-label={c.label}
                  title={`${c.label}${sameTank.some((r) => r.color === c.id) ? ` (used by Rack ${sameTank.filter((r) => r.color === c.id).map((r) => r.name).join(', ')})` : ''}`}
                  onClick={() => setForm((f) => ({ ...f, color: c.id }))}
                  className={cx('h-8 w-8 rounded-full ring-offset-2 transition', chosenColor === c.id ? 'ring-2 ring-slate-800' : 'hover:scale-110')}
                  style={{ background: c.fill, opacity: sameTank.some((r) => r.color === c.id) && chosenColor !== c.id ? 0.35 : 1 }}
                />
              ))}
            </div>
            {clash.length > 0 ? (
              <p className="mt-2 text-xs text-amber-700">Rack {clash.map((r) => r.name).join(', ')} in this tank already uses {boxColor(chosenColor).label}. Pick a different color if you want them to look different.</p>
            ) : (
              sameTank.length > 0 && <p className="mt-2 text-xs text-slate-500">Faded colors are already used by other racks in this tank.</p>
            )}
            <div className="mt-3 h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${rackShade(chosenColor, 1, 3).fill}, ${rackShade(chosenColor, 2, 3).fill}, ${rackShade(chosenColor, 3, 3).fill})` }} aria-hidden="true" />
          </div>
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

export default function RacksPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tankFilter = params.get('tank') || '';
  const tanksQ = useTanks();
  const racksQ = useRacks();
  const boxesQ = useBoxes();
  const [filling, setFilling] = useState(null); // plan for "Fill racks with boxes"
  const fill = useInventoryMutation(fillRacksWithBoxes);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const mutate = useInventoryMutation(async ({ type, rack }) => {
    if (type === 'delete') return deleteRow('racks', rack.id);
    return saveRow('racks', { id: rack.id, version: rack.version, status: type === 'archive' ? 'archived' : 'active' });
  });

  const tanks = tanksQ.data || [];
  const racks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (racksQ.data || [])
      .filter((r) => showArchived || r.status !== 'archived')
      .filter((r) => !tankFilter || r.tank_id === tankFilter)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.tank_name.toLowerCase().includes(q) || (r.notes || '').toLowerCase().includes(q));
  }, [racksQ.data, search, showArchived, tankFilter]);

  async function doConfirm() {
    try {
      await mutate.mutateAsync(confirm);
      toast.success(`Rack "${confirm.rack.name}" ${{ delete: 'deleted', archive: 'archived', restore: 'restored' }[confirm.type]}.`);
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setConfirm(null);
  }

  const loading = tanksQ.isLoading || racksQ.isLoading;
  const err = tanksQ.error || racksQ.error;

  return (
    <>
      <PageHeader
        title="Racks"
        subtitle="Racks inside each tank"
        actions={isAdmin && (
          <>
            <Button variant="secondary" onClick={() => setFilling(planRackFill(racksQ.data || [], boxesQ.data || []))} disabled={!racksQ.data?.length || !boxesQ.data}>
              <BoxesIcon className="h-4 w-4" /> Fill racks with boxes
            </Button>
            <Button onClick={() => setEditing({})} disabled={!tanks.length}><Plus className="h-4 w-4" /> Add Rack</Button>
          </>
        )}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search racks" className="sm:max-w-xs flex-1" />
        <Select
          aria-label="Filter by tank"
          value={tankFilter}
          onChange={(e) => setParams(e.target.value ? { tank: e.target.value } : {})}
          className="sm:max-w-56"
        >
          <option value="">All tanks</option>
          {tanks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-700 h-4 w-4" />
          Show archived
        </label>
      </div>

      {loading ? <Spinner /> : err ? <ErrorState error={err} onRetry={() => { tanksQ.refetch(); racksQ.refetch(); }} /> : racks.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title={search || tankFilter ? 'No racks match' : 'No racks yet'}
          action={isAdmin && tanks.length > 0 && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add Rack</Button>}
        >
          {!tanks.length ? 'Add a tank first, then add racks to it.' : null}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {racks.map((r) => (
            <Card
              key={r.id}
              tabIndex={0}
              role="link"
              aria-label={`Open rack ${r.name}`}
              onClick={() => navigate(`/boxes?rack=${r.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/boxes?rack=${r.id}`)}
              className="p-5 cursor-pointer transition-all hover:shadow-md hover:border-slate-300"
            >
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-semibold" style={{ background: boxColor(r.color).fill, color: boxColor(r.color).text }}>
                  {r.name.slice(0, 3)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500 truncate">{r.tank_name}{r.position ? ` · slot ${r.position}` : ''}</div>
                  <h3 className="font-semibold text-slate-900 truncate">Rack {r.name}</h3>
                  <div className="mt-1"><StatusBadge status={r.status} /></div>
                </div>
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Menu
                    label={`Actions for rack ${r.name}`}
                    items={isAdmin ? [
                      { label: 'Edit', icon: Pencil, onClick: () => setEditing(r) },
                      { label: 'Fill with boxes', icon: BoxesIcon, onClick: () => setFilling(planRackFill([r], boxesQ.data || [])) },
                      r.status === 'archived'
                        ? { label: 'Restore', icon: ArchiveRestore, onClick: () => setConfirm({ type: 'restore', rack: r }) }
                        : { label: 'Archive', icon: Archive, onClick: () => setConfirm({ type: 'archive', rack: r }) },
                      { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ type: 'delete', rack: r }) },
                    ] : []}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-4">
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: boxColor(r.color).fill }} /> {boxColor(r.color).label}
                  </div>
                  {r.notes && <p className="mt-2 text-sm text-slate-500 line-clamp-3">{r.notes}</p>}
                  <p className="mt-2 text-xs text-slate-400">Click a box in the drawing to open its grid.</p>
                  <div className="mt-auto pt-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="flex items-center gap-1.5 text-slate-500"><BoxesIcon className="h-4 w-4" /> Boxes</span>
                      <span className="font-medium text-slate-900">{r.box_count} / {r.box_capacity}</span>
                    </div>
                    <ProgressBar value={pct(r.box_count, r.box_capacity)} />
                  </div>
                </div>
                <RackSchematic rack={r} boxes={boxesQ.data || []} onOpenBox={(b) => navigate(`/grid/${b.id}`)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <RackForm key={editing.id || 'new'} rack={editing} tanks={tanks} allRacks={racksQ.data || []} defaultTankId={tankFilter} onClose={() => setEditing(null)} />
      )}

      {filling && (
        <Modal
          open
          onClose={() => setFilling(null)}
          busy={fill.isPending}
          title="Fill racks with boxes"
          subtitle="Adds empty 9 × 9 boxes, named like rack A (B1, B2 …), up to each rack's capacity."
          footer={
            <>
              <Button variant="secondary" onClick={() => setFilling(null)} disabled={fill.isPending}>{filling.length ? 'Cancel' : 'Close'}</Button>
              {filling.length > 0 && (
                <Button
                  loading={fill.isPending}
                  onClick={async () => {
                    try {
                      const added = await fill.mutateAsync(filling);
                      toast.success(`${added.length} boxes added.`);
                      setFilling(null);
                    } catch (err) {
                      toast.error(friendlyError(err));
                    }
                  }}
                >
                  <Plus className="h-4 w-4" /> Add {filling.reduce((n, p) => n + p.names.length, 0)} boxes
                </Button>
              )}
            </>
          }
        >
          {filling.length === 0 ? (
            <p className="text-sm text-slate-600">Every rack is already full. Nothing to add.</p>
          ) : (
            <>
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {filling.map((p) => (
                  <li key={p.rack.id} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <span className="h-6 w-6 rounded-md shrink-0" style={{ background: boxColor(p.rack.color).fill }} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">{p.rack.tank_name} › Rack {p.rack.name}: {p.names.length} box{p.names.length === 1 ? '' : 'es'}</div>
                      <div className="text-xs text-slate-500 truncate">{p.names.join(', ')}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">Boxes already in a rack are left alone. Anyone with admin access can rename, resize or add a nickname to any box later (Boxes → ⋮ → Edit).</p>
            </>
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        busy={mutate.isPending}
        tone={confirm?.type === 'restore' ? 'primary' : 'danger'}
        title={confirm && { delete: 'Delete rack?', archive: 'Archive rack?', restore: 'Restore rack?' }[confirm.type]}
        confirmLabel={confirm && { delete: 'Delete permanently', archive: 'Archive', restore: 'Restore' }[confirm.type]}
        requireText={confirm?.type === 'delete' ? confirm.rack.name : undefined}
      >
        {confirm?.type === 'delete' && (confirm.rack.box_count > 0
          ? <Alert tone="warning">Rack {confirm.rack.name} still holds {confirm.rack.box_count} box(es). The database will refuse until they are moved or archived.</Alert>
          : <p>Permanently delete empty rack <strong>{confirm.rack.name}</strong> from {confirm.rack.tank_name}?</p>)}
        {confirm?.type === 'archive' && <p>Archive rack <strong>{confirm.rack.name}</strong>? Only racks whose boxes are all archived or moved can be archived.</p>}
        {confirm?.type === 'restore' && <p>Make rack <strong>{confirm.rack.name}</strong> active again? It must fit within its tank&apos;s capacity.</p>}
      </ConfirmDialog>
    </>
  );
}
