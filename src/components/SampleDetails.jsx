import { useMemo, useState } from 'react';
import { Archive, ArrowRightLeft, History, Pencil, Trash2 } from 'lucide-react';
import { moveSample, saveRow, useBoxSamples, useBoxes, useInventoryMutation, useSampleHistory } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { boxColor, positionLabel, rowLabel } from '../lib/grid.js';
import { fmtDate, fmtDateTime, yesNo } from '../lib/format.js';
import { Alert, Badge, Button, Field, Modal, Segmented, Select, Spinner, Textarea, cx } from './ui.jsx';

// ------------------------------------------------------------------ details

const FIELDS = [
  ['Sample ID', (s) => s.sample_code],
  ['Transfected', (s) => yesNo(s.transfected)],
  ['Passage No.', (s) => s.passage_number ?? '—'],
  ['Who Passaged', (s) => s.passaged_by || '—'],
  ['Date of Passage', (s) => fmtDate(s.passage_date)],
  ['Media', (s) => s.media || '—'],
  ['Vials', (s) => s.vial_count],
  ['Researcher Responsible', (s) => s.researcher_responsible || '—'],
  ['Date Frozen', (s) => fmtDate(s.date_frozen)],
  ['Date Added', (s) => fmtDate(s.date_added)],
  ['Cell Line Origin', (s) => s.cell_line_origin || '—'],
  ['Research Project', (s) => s.project || '—'],
  ['Genetic Modifications', (s) => s.genetic_modifications || '—'],
  ['Selection Marker', (s) => s.selection_marker || '—'],
  ['Antibiotic Resistance', (s) => s.antibiotic_resistance || '—'],
];

const ACTION_LABEL = {
  create: ['Added', 'green'], update: ['Edited', 'blue'], move: ['Moved', 'teal'],
  archive: ['Archived', 'amber'], remove: ['Removed', 'red'], restore: ['Restored', 'green'], delete: ['Deleted', 'red'],
};
const IGNORE = new Set(['updated_at', 'updated_by', 'version', 'created_at', 'created_by', 'archived_at', 'archived_by']);
const pretty = (k) => k.replace(/_/g, ' ').replace(/\bnum\b/, '').trim();

function HistoryList({ sampleId, boxesById }) {
  const { data, isLoading, error } = useSampleHistory(sampleId);
  if (isLoading) return <Spinner label="Loading history…" className="py-8" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;
  if (!data?.length) return <p className="text-sm text-slate-500">No history recorded.</p>;
  const loc = (v) => {
    const b = boxesById[v.box_id];
    return `${b ? `${b.tank_name} › Rack ${b.rack_name} › Box ${b.name} · ` : ''}${positionLabel(v.row_num, v.col_num)}`;
  };
  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-5">
      {data.map((ev) => {
        const [label, tone] = ACTION_LABEL[ev.action] || [ev.action, 'slate'];
        const changes = ev.action === 'update' && ev.old_values
          ? Object.keys(ev.new_values).filter((k) => !IGNORE.has(k) && JSON.stringify(ev.new_values[k]) !== JSON.stringify(ev.old_values[k]))
          : [];
        return (
          <li key={ev.id} className="ml-5">
            <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{label}</Badge>
              <span className="text-xs text-slate-500">{fmtDateTime(ev.occurred_at)} · {ev.actor_email || 'system'}</span>
            </div>
            <div className="mt-1 text-sm text-slate-700">
              {ev.action === 'create' && <>Stored at {loc(ev.new_values)}</>}
              {ev.action === 'move' && <>{loc(ev.old_values)} → {loc(ev.new_values)}</>}
              {['archive', 'remove'].includes(ev.action) && ev.new_values.archive_reason && <>Reason: {ev.new_values.archive_reason}</>}
              {changes.length > 0 && (
                <ul className="space-y-0.5">
                  {changes.map((k) => (
                    <li key={k}>
                      <span className="text-slate-500 capitalize">{pretty(k)}:</span>{' '}
                      <span className="line-through text-slate-400">{String(ev.old_values[k] ?? '—') || '—'}</span>{' '}
                      → {String(ev.new_values[k] ?? '—') || '—'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SampleDetails({ sample, box, onClose, onEdit, onMove, onRemove, readOnly = false }) {
  const { canEdit: mayEdit } = useAuth();
  const canEdit = mayEdit && !readOnly && sample.status === 'active';
  const [tab, setTab] = useState('details');
  const { data: boxes } = useBoxes();
  const boxesById = useMemo(() => Object.fromEntries((boxes || []).map((b) => [b.id, b])), [boxes]);
  const c = boxColor(box.color);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-3">
          <span className="h-9 min-w-9 px-2 rounded-lg flex items-center justify-center text-sm font-semibold" style={{ background: c.fill, color: c.text }}>
            {positionLabel(sample.row_num, sample.col_num)}
          </span>
          <span className="truncate">{sample.sample_name}</span>
        </span>
      }
      subtitle={`${box.tank_name} › Rack ${box.rack_name} › Box ${box.name} › ${positionLabel(sample.row_num, sample.col_num)}`}
      footer={canEdit && (
        <>
          <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={onRemove}><Trash2 className="h-4 w-4" /> Remove / Archive</Button>
          <Button variant="secondary" onClick={onMove}><ArrowRightLeft className="h-4 w-4" /> Move</Button>
          <Button onClick={onEdit}><Pencil className="h-4 w-4" /> Edit</Button>
        </>
      )}
    >
      <div className="mb-5">
        <Segmented
          label="View"
          value={tab}
          onChange={setTab}
          options={[{ value: 'details', label: 'Details' }, { value: 'history', label: 'History' }]}
        />
      </div>
      {tab === 'details' ? (
        <>
          {sample.status !== 'active' && (
            <Alert tone="warning" className="mb-4">
              This sample is <strong>{sample.status}</strong>{sample.archived_at ? ` since ${fmtDate(sample.archived_at)}` : ''}
              {sample.archive_reason ? ` — ${sample.archive_reason}` : ''}. It no longer occupies this position.
            </Alert>
          )}
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {FIELDS.map(([label, get]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="text-sm text-slate-900 break-words">{get(sample)}</dd>
              </div>
            ))}
          </dl>
          {sample.notes && (
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-500">Notes</div>
              <p className="text-sm text-slate-900 whitespace-pre-wrap">{sample.notes}</p>
            </div>
          )}
          <p className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> Last modified {fmtDateTime(sample.updated_at)}
          </p>
        </>
      ) : (
        <HistoryList sampleId={sample.id} boxesById={boxesById} />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ move

export function MoveDialog({ sample, fromBox, onClose, onMoved }) {
  const { data: boxes } = useBoxes();
  const [boxId, setBoxId] = useState(fromBox.id);
  const [target, setTarget] = useState(null);
  const { data: occupants, isLoading } = useBoxSamples(boxId);
  const { run, busy, error } = useFormSubmit();
  const move = useInventoryMutation(moveSample);
  const box = (boxes || []).find((b) => b.id === boxId) || fromBox;
  const taken = useMemo(() => new Map((occupants || []).map((s) => [`${s.row_num}-${s.col_num}`, s])), [occupants]);

  function submit() {
    if (!target) return;
    run(() => move.mutateAsync({ sample, boxId, row: target.row, col: target.col }), {
      success: `${sample.sample_name} moved to ${box.name} ${positionLabel(target.row, target.col)}.`,
      onDone: onMoved,
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="xl"
      title={`Move ${sample.sample_name}`}
      subtitle={`From ${fromBox.tank_name} › ${fromBox.rack_name} › ${fromBox.name} › ${positionLabel(sample.row_num, sample.col_num)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!target} loading={busy}>
            <ArrowRightLeft className="h-4 w-4" />
            {target ? `Move to ${box.name} ${positionLabel(target.row, target.col)}` : 'Choose a position'}
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <Field label="Destination box" className="mb-4 max-w-md">
        <Select value={boxId} onChange={(e) => { setBoxId(e.target.value); setTarget(null); }}>
          {(boxes || []).filter((b) => b.status === 'active').map((b) => (
            <option key={b.id} value={b.id}>
              {b.tank_name} › Rack {b.rack_name} › Box {b.name} ({b.total_positions - b.filled_positions} free)
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-slate-500 mb-3">Click an empty position. Occupied positions cannot be selected.</p>
      {isLoading ? <Spinner className="py-8" /> : (
        <div className="overflow-x-auto pb-1">
          <div className="grid gap-1 w-max" style={{ gridTemplateColumns: `1.5rem repeat(${box.cols}, 2.25rem)` }}>
            <span />
            {Array.from({ length: box.cols }, (_, i) => <span key={i} className="text-center text-[11px] text-slate-400">{i + 1}</span>)}
            {Array.from({ length: box.rows }, (_, r) => (
              <FragmentRow key={r} r={r + 1} cols={box.cols} taken={taken} sample={sample} target={target} setTarget={setTarget} color={boxColor(box.color)} />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function FragmentRow({ r, cols, taken, sample, target, setTarget, color }) {
  return (
    <>
      <span className="text-[11px] text-slate-400 flex items-center justify-center">{rowLabel(r)}</span>
      {Array.from({ length: cols }, (_, ci) => {
        const c = ci + 1;
        const occ = taken.get(`${r}-${c}`);
        const self = occ?.id === sample.id;
        const chosen = target?.row === r && target?.col === c;
        return (
          <button
            key={c}
            type="button"
            disabled={Boolean(occ)}
            onClick={() => setTarget({ row: r, col: c })}
            aria-label={`${positionLabel(r, c)}${occ ? ` occupied by ${occ.sample_name}` : ' empty'}`}
            aria-pressed={chosen}
            title={occ ? `${positionLabel(r, c)} · ${occ.sample_name}` : positionLabel(r, c)}
            className={cx(
              'h-9 w-9 rounded-md text-[10px] font-medium transition',
              occ ? 'cursor-not-allowed opacity-70' : 'border border-dashed border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50',
              chosen && 'ring-2 ring-brand-700 ring-offset-1 bg-brand-100 border-solid border-brand-700',
              self && 'ring-2 ring-amber-400',
            )}
            style={occ ? { background: color.fill, color: color.text } : undefined}
          >
            {chosen ? '✓' : positionLabel(r, c)}
          </button>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ remove / archive

export function RemoveDialog({ sample, onClose, onDone }) {
  const [status, setStatus] = useState('archived');
  const [reason, setReason] = useState('');
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((v) => saveRow('samples', v));

  function submit() {
    run(
      () => save.mutateAsync({ id: sample.id, version: sample.version, status, archive_reason: reason.trim() }),
      { success: `${sample.sample_name} ${status === 'archived' ? 'archived' : 'marked as removed'}. Its position is now free.`, onDone },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="sm"
      title="Remove sample from the box?"
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button variant="danger" onClick={submit} loading={busy}><Archive className="h-4 w-4" /> Confirm</Button></>}
    >
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <p className="text-sm text-slate-600 mb-4">
        <strong>{sample.sample_name}</strong> ({positionLabel(sample.row_num, sample.col_num)}) will leave the grid and its slot becomes free.
        The record and its full history are kept and can be found in Reports.
      </p>
      <Field label="What happened?" className="mb-4">
        <div>
          <Segmented
            label="Outcome"
            value={status}
            onChange={setStatus}
            options={[{ value: 'archived', label: 'Archive (taken out / used)' }, { value: 'removed', label: 'Removed (discarded)' }]}
          />
        </div>
      </Field>
      <Field label="Reason / note" hint="e.g. Thawed for experiment 2026-10-21">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} />
      </Field>
    </Modal>
  );
}
