import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Boxes as BoxesIcon, Grid3x3, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteRow, saveRow, useBoxes, useInventoryMutation, useRacks, useSettings } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useToast } from '../components/Toast.jsx';
import { useFormSubmit } from '../components/useFormSubmit.js';
import { friendlyError } from '../lib/errors.js';
import { BOX_COLORS, GRID_PRESETS, boxColor, fmtPct, pct } from '../lib/grid.js';
import {
  Alert, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Menu, Modal, PageHeader,
  ProgressBar, SearchInput, Select, Spinner, StatusBadge, Textarea, cx,
} from '../components/ui.jsx';

function BoxForm({ box, racks, defaultRackId, onClose }) {
  const { data: settings } = useSettings();
  const isNew = !box?.id;
  const [form, setForm] = useState({
    rack_id: box?.rack_id ?? defaultRackId ?? '',
    name: box?.name ?? '',
    rows: box?.rows ?? settings?.default_box_rows ?? 9,
    cols: box?.cols ?? settings?.default_box_cols ?? 9,
    color: box?.color ?? 'blue',
    notes: box?.notes ?? '',
  });
  const [touched, setTouched] = useState(false);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((v) => saveRow('boxes', v));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const selectable = racks.filter((r) => r.status !== 'archived' || r.id === box?.rack_id);
  const rack = racks.find((r) => r.id === form.rack_id);
  const full = rack && (isNew || rack.id !== box?.rack_id) && rack.box_count >= rack.box_capacity;
  const presetKey = `${form.rows}x${form.cols}`;
  const isPreset = GRID_PRESETS.some((p) => `${p.rows}x${p.cols}` === presetKey);
  const [custom, setCustom] = useState(!isPreset);

  const errors = {
    rack_id: !form.rack_id && 'Choose a rack.',
    name: !form.name.trim() && 'Box name is required.',
    rows: !(Number(form.rows) >= 1 && Number(form.rows) <= 26) && '1–26 rows (A–Z).',
    cols: !(Number(form.cols) >= 1 && Number(form.cols) <= 30) && '1–30 columns.',
  };

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    run(
      () => save.mutateAsync({
        id: box?.id,
        version: box?.version,
        rack_id: form.rack_id,
        name: form.name.trim(),
        rows: Number(form.rows),
        cols: Number(form.cols),
        color: form.color,
        notes: form.notes.trim(),
      }),
      { success: (b) => `Box "${b.name}" ${isNew ? 'added' : 'saved'}.`, onDone: onClose },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={isNew ? 'Add New Box' : 'Edit Box'}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="box-form" loading={busy}>Save</Button></>}
    >
      <form id="box-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {full && <Alert tone="warning">Rack {rack.name} is full ({rack.box_count} / {rack.box_capacity} boxes).</Alert>}
        <Field label="Box Name" required error={touched && errors.name} hint="Unique within its rack">
          <Input value={form.name} onChange={set('name')} placeholder="e.g. A1" maxLength={40} />
        </Field>
        <Field label="Rack" required error={touched && errors.rack_id}>
          <Select value={form.rack_id} onChange={set('rack_id')}>
            <option value="">Select a rack…</option>
            {selectable.map((r) => (
              <option key={r.id} value={r.id}>{r.tank_name} › Rack {r.name} ({r.box_count}/{r.box_capacity})</option>
            ))}
          </Select>
        </Field>
        <Field label="Grid Size" required>
          <Select
            value={custom ? 'custom' : presetKey}
            onChange={(e) => {
              if (e.target.value === 'custom') return setCustom(true);
              const p = GRID_PRESETS.find((x) => `${x.rows}x${x.cols}` === e.target.value);
              setCustom(false);
              setForm((f) => ({ ...f, rows: p.rows, cols: p.cols }));
            }}
          >
            {GRID_PRESETS.map((p) => <option key={p.label} value={`${p.rows}x${p.cols}`}>{p.label}</option>)}
            <option value="custom">Custom (rows × columns)…</option>
          </Select>
        </Field>
        {custom && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rows" error={touched && errors.rows}><Input type="number" min={1} max={26} value={form.rows} onChange={set('rows')} /></Field>
            <Field label="Columns" error={touched && errors.cols}><Input type="number" min={1} max={30} value={form.cols} onChange={set('cols')} /></Field>
          </div>
        )}
        {!isNew && <p className="text-xs text-slate-500 -mt-2">A grid can only be shrunk if no samples sit in the rows or columns being removed.</p>}
        <Field label="Color">
          <div role="radiogroup" aria-label="Box color" className="flex flex-wrap gap-2">
            {BOX_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={form.color === c.id}
                aria-label={c.label}
                title={c.label}
                onClick={() => setForm((f) => ({ ...f, color: c.id }))}
                className={cx('h-8 w-8 rounded-full ring-offset-2 transition', form.color === c.id ? 'ring-2 ring-slate-800' : 'hover:scale-110')}
                style={{ background: c.fill }}
              />
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} maxLength={2000} />
        </Field>
      </form>
    </Modal>
  );
}

function MiniGrid({ box }) {
  // Small occupancy-free preview of the grid shape
  const c = boxColor(box.color);
  const rows = Math.min(box.rows, 12);
  const cols = Math.min(box.cols, 12);
  return (
    <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, 6px)` }} aria-hidden="true">
      {Array.from({ length: rows * cols }).map((_, i) => (
        <span key={i} className="h-[6px] w-[6px] rounded-[1px]" style={{ background: c.soft }} />
      ))}
    </div>
  );
}

export default function BoxesPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const rackFilter = params.get('rack') || '';
  const racksQ = useRacks();
  const boxesQ = useBoxes();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const mutate = useInventoryMutation(async ({ type, box }) => {
    if (type === 'delete') return deleteRow('boxes', box.id);
    return saveRow('boxes', { id: box.id, version: box.version, status: type === 'archive' ? 'archived' : 'active' });
  });

  const racks = racksQ.data || [];
  const boxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (boxesQ.data || [])
      .filter((b) => showArchived || b.status !== 'archived')
      .filter((b) => !rackFilter || b.rack_id === rackFilter)
      .filter((b) => !q || [b.name, b.rack_name, b.tank_name, b.notes].some((s) => (s || '').toLowerCase().includes(q)));
  }, [boxesQ.data, search, showArchived, rackFilter]);

  async function doConfirm() {
    try {
      await mutate.mutateAsync(confirm);
      toast.success(`Box "${confirm.box.name}" ${{ delete: 'deleted', archive: 'archived', restore: 'restored' }[confirm.type]}.`);
    } catch (err) {
      toast.error(friendlyError(err));
    }
    setConfirm(null);
  }

  const loading = racksQ.isLoading || boxesQ.isLoading;
  const err = racksQ.error || boxesQ.error;

  return (
    <>
      <PageHeader
        title="Boxes"
        subtitle="Cryo boxes and how full they are"
        actions={isAdmin && <Button onClick={() => setEditing({})} disabled={!racks.length}><Plus className="h-4 w-4" /> Add Box</Button>}
      />
      <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search boxes" className="sm:max-w-xs flex-1" />
        <Select aria-label="Filter by rack" value={rackFilter} onChange={(e) => setParams(e.target.value ? { rack: e.target.value } : {})} className="sm:max-w-64">
          <option value="">All racks</option>
          {racks.map((r) => <option key={r.id} value={r.id}>{r.tank_name} › Rack {r.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-brand-700 h-4 w-4" />
          Show archived
        </label>
      </div>

      {loading ? <Spinner /> : err ? <ErrorState error={err} onRetry={() => { racksQ.refetch(); boxesQ.refetch(); }} /> : boxes.length === 0 ? (
        <EmptyState
          icon={BoxesIcon}
          title={search || rackFilter ? 'No boxes match' : 'No boxes yet'}
          action={isAdmin && racks.length > 0 && <Button onClick={() => setEditing({})}><Plus className="h-4 w-4" /> Add Box</Button>}
        >
          {!racks.length ? 'Add a rack first, then add boxes to it.' : null}
        </EmptyState>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {boxes.map((b) => {
            const c = boxColor(b.color);
            return (
              <Card key={b.id} className="p-5 flex flex-col">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm" style={{ background: c.fill, color: c.text }}>
                    {b.name.slice(0, 3)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500 truncate">{b.tank_name} › Rack {b.rack_name}</div>
                    <h3 className="font-semibold text-slate-900 truncate">Box {b.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={b.status} />
                      <span className="text-xs text-slate-500">{b.rows} × {b.cols}</span>
                    </div>
                  </div>
                  <Menu
                    label={`Actions for box ${b.name}`}
                    items={[
                      { label: 'Open in Grid View', icon: Grid3x3, onClick: () => navigate(`/grid/${b.id}`) },
                      isAdmin && { label: 'Edit', icon: Pencil, onClick: () => setEditing(b) },
                      isAdmin && (b.status === 'archived'
                        ? { label: 'Restore', icon: ArchiveRestore, onClick: () => setConfirm({ type: 'restore', box: b }) }
                        : { label: 'Archive', icon: Archive, onClick: () => setConfirm({ type: 'archive', box: b }) }),
                      isAdmin && { label: 'Delete', icon: Trash2, danger: true, onClick: () => setConfirm({ type: 'delete', box: b }) },
                    ]}
                  />
                </div>
                <div className="mt-4 flex items-end justify-between gap-4">
                  <MiniGrid box={b} />
                  <div className="text-right">
                    <div className="text-2xl font-semibold text-slate-900">{b.filled_positions}<span className="text-sm font-normal text-slate-400"> / {b.total_positions}</span></div>
                    <div className="text-xs text-slate-500">{b.total_positions - b.filled_positions} available</div>
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar value={pct(b.filled_positions, b.total_positions)} />
                  <div className="mt-1.5 text-xs text-slate-500">{fmtPct(b.filled_positions, b.total_positions)} occupied</div>
                </div>
                {b.status !== 'archived' && (
                  <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(`/grid/${b.id}`)}>
                    <Grid3x3 className="h-4 w-4" /> Open Grid
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && <BoxForm key={editing.id || 'new'} box={editing} racks={racks} defaultRackId={rackFilter} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        busy={mutate.isPending}
        tone={confirm?.type === 'restore' ? 'primary' : 'danger'}
        title={confirm && { delete: 'Delete box?', archive: 'Archive box?', restore: 'Restore box?' }[confirm.type]}
        confirmLabel={confirm && { delete: 'Delete permanently', archive: 'Archive', restore: 'Restore' }[confirm.type]}
        requireText={confirm?.type === 'delete' ? confirm.box.name : undefined}
      >
        {confirm?.type === 'delete' && (
          <p>Only boxes that have never held a sample can be deleted. Boxes with sample history must be archived instead, so the record of where samples were is never lost.</p>
        )}
        {confirm?.type === 'archive' && (confirm.box.filled_positions > 0
          ? <Alert tone="warning">Box {confirm.box.name} still holds {confirm.box.filled_positions} sample(s). Move or archive them first.</Alert>
          : <p>Archive empty box <strong>{confirm.box.name}</strong>? It will be hidden from the grid and storage totals.</p>)}
        {confirm?.type === 'restore' && <p>Make box <strong>{confirm.box.name}</strong> active again?</p>}
      </ConfirmDialog>
    </>
  );
}
