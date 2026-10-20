import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { insertSamples, saveRow, useInventoryMutation, useProfiles } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { positionLabel } from '../lib/grid.js';
import { todayISO } from '../lib/format.js';
import { Alert, Button, Field, Input, Modal, Segmented, Select, Textarea, cx } from './ui.jsx';

export const MEDIA_PRESETS = ['10% DMSO, 90% FBS'];
const CUSTOM = '__custom__';

const TEXT_FIELDS = [
  'sample_name', 'transfected_with', 'passaged_by', 'media', 'cell_line_origin', 'genetic_modifications',
  'selection_marker', 'antibiotic_resistance', 'project', 'researcher_responsible', 'notes',
];

/**
 * Add samples (positions = [{row, col}, …], one or many) or edit one sample.
 * When several positions are chosen, every position gets the same details.
 */
export default function SampleForm({ box, positions = [], sample, onClose, onSaved }) {
  const { profile } = useAuth();
  const { data: people } = useProfiles();
  const isNew = !sample;
  const slots = isNew ? positions : [{ row: sample.row_num, col: sample.col_num }];
  const gridNames = slots.map((p) => `${box.name}${positionLabel(p.row, p.col)}`);

  const [form, setForm] = useState(() => ({
    sample_name: sample?.sample_name ?? '',
    transfected: sample?.transfected ?? null,
    transfected_with: sample?.transfected_with ?? '',
    passage_number: sample?.passage_number ?? '',
    passaged_by: sample?.passaged_by ?? (isNew ? profile?.initials ?? '' : ''),
    media: sample?.media ?? (isNew ? MEDIA_PRESETS[0] : ''),
    passage_date: sample?.passage_date ?? '',
    date_frozen: sample?.date_frozen ?? (isNew ? todayISO() : ''),
    date_added: sample?.date_added ?? todayISO(),
    cell_line_origin: sample?.cell_line_origin ?? '',
    genetic_modifications: sample?.genetic_modifications ?? '',
    selection_marker: sample?.selection_marker ?? '',
    antibiotic_resistance: sample?.antibiotic_resistance ?? '',
    project: sample?.project ?? '',
    researcher_responsible: sample?.researcher_responsible ?? (isNew ? profile?.full_name ?? '' : ''),
    notes: sample?.notes ?? '',
  }));
  const [customMedia, setCustomMedia] = useState(() => Boolean(sample?.media) && !MEDIA_PRESETS.includes(sample.media));
  const hasAdvanced = sample && ['cell_line_origin', 'genetic_modifications', 'selection_marker', 'antibiotic_resistance', 'project', 'notes']
    .some((k) => sample[k]);
  const [advanced, setAdvanced] = useState(Boolean(hasAdvanced));
  const [touched, setTouched] = useState(false);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((v) => (isNew ? insertSamples(v) : saveRow('samples', v)));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // "Who Passaged" choices: active lab members with initials (plus the saved value if it's someone no longer listed).
  const passagers = useMemo(() => {
    const list = (people || [])
      .filter((p) => p.status === 'active' && p.initials)
      .sort((a, b) => a.initials.localeCompare(b.initials))
      .map((p) => ({ value: p.initials, label: `${p.initials} — ${p.full_name || p.email}` }));
    if (form.passaged_by && !list.some((o) => o.value === form.passaged_by)) {
      list.unshift({ value: form.passaged_by, label: form.passaged_by });
    }
    return list;
  }, [people, form.passaged_by]);

  const pn = form.passage_number;
  const errors = {
    sample_name: !form.sample_name.trim() && 'Required.',
    transfected: form.transfected === null && 'Choose Yes or No.',
    transfected_with: form.transfected === true && !form.transfected_with.trim() && 'What were the cells transfected with?',
    passage_number: (pn === '' ? 'Required.' : !(Number.isInteger(Number(pn)) && Number(pn) >= 0) && 'Whole number, 0 or more.'),
    passaged_by: !form.passaged_by && 'Choose who passaged.',
    media: !form.media.trim() && 'Required.',
    passage_date: !form.passage_date && 'Required.',
  };
  const err = (k) => touched && errors[k];

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) {
      return;
    }
    const values = { ...form };
    TEXT_FIELDS.forEach((k) => { values[k] = (values[k] || '').trim(); });
    if (values.transfected !== true) values.transfected_with = '';
    values.passage_number = Number(form.passage_number);
    values.vial_count = 1; // one slot = one vial
    ['passage_date', 'date_frozen'].forEach((k) => { values[k] = form[k] || null; });
    values.date_added = form.date_added || todayISO();
    const where = gridNames.length > 3 ? `${gridNames.length} positions` : gridNames.join(', ');
    run(
      () => save.mutateAsync(
        isNew
          ? slots.map((p) => ({ ...values, box_id: box.id, row_num: p.row, col_num: p.col }))
          : { ...values, id: sample.id, version: sample.version },
      ),
      { success: `${values.sample_name} ${isNew ? 'added to' : 'saved at'} ${where}.`, onDone: () => { onSaved?.(); onClose(); } },
    );
  }

  const title = isNew
    ? (slots.length > 1 ? `Add Samples (${slots.length} positions)` : `Add Sample (${gridNames[0]})`)
    : `Edit Sample (${gridNames[0]})`;

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="lg"
      title={title}
      subtitle={`${box.tank_name} › Rack ${box.rack_name} › Box ${box.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="sample-form" loading={busy}>
            {isNew && slots.length > 1 ? `Save ${slots.length} samples` : 'Save'}
          </Button>
        </>
      }
    >
      <form id="sample-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {touched && Object.values(errors).some(Boolean) && <Alert tone="warning">Please fill in the highlighted fields.</Alert>}

        <Field label={slots.length > 1 ? `Grid Names (${slots.length})` : 'Grid Name'}>
          {slots.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 max-h-24 overflow-y-auto">
              {gridNames.map((g) => (
                <span key={g} className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-sm font-semibold text-brand-800">{g}</span>
              ))}
            </div>
          ) : (
            <Input value={gridNames[0]} readOnly tabIndex={-1} className="font-semibold text-brand-800 sm:w-40" />
          )}
        </Field>

        <Field label="Sample Name / Cell Type" required error={err('sample_name')}>
          <Input value={form.sample_name} onChange={set('sample_name')} placeholder="e.g. EO771 HER2" maxLength={120} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Transfected" required error={err('transfected')}>
            <div>
              <Segmented
                label="Transfected"
                value={form.transfected}
                onChange={(v) => setForm((f) => ({ ...f, transfected: v }))}
                options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]}
              />
            </div>
          </Field>
          {form.transfected === true && (
            <Field label="Transfected With" required error={err('transfected_with')}>
              <Input value={form.transfected_with} onChange={set('transfected_with')} placeholder="e.g. pLenti-HER2, GFP-Luc" maxLength={200} autoFocus />
            </Field>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Passage No." required error={err('passage_number')}>
            <Input type="number" min={0} step={1} value={form.passage_number} onChange={set('passage_number')} />
          </Field>
          <Field label="Who Passaged" required error={err('passaged_by')}>
            <Select value={form.passaged_by} onChange={set('passaged_by')} className="font-semibold">
              <option value="">Choose…</option>
              {passagers.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Date of Passage" required error={err('passage_date')}>
            <Input type="date" value={form.passage_date || ''} onChange={set('passage_date')} max={todayISO()} />
          </Field>
        </div>

        <Field label="Freezing Media" required error={err('media')}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Select
              value={customMedia ? CUSTOM : form.media}
              onChange={(e) => {
                if (e.target.value === CUSTOM) {
                  setCustomMedia(true);
                  setForm((f) => ({ ...f, media: MEDIA_PRESETS.includes(f.media) ? '' : f.media }));
                } else {
                  setCustomMedia(false);
                  setForm((f) => ({ ...f, media: e.target.value }));
                }
              }}
            >
              {MEDIA_PRESETS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value={CUSTOM}>Custom…</option>
            </Select>
            {customMedia && (
              <Input value={form.media} onChange={set('media')} placeholder="Type the freezing media" maxLength={200} aria-label="Custom freezing media" autoFocus />
            )}
          </div>
        </Field>

        <div className="rounded-xl border border-slate-200">
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((a) => !a)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
          >
            <span>Advanced Details <span className="font-normal text-slate-400">(optional)</span></span>
            <ChevronDown className={cx('h-4 w-4 text-slate-400 transition-transform', advanced && 'rotate-180')} />
          </button>
          {advanced && (
            <div className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-4 border-t border-slate-100">
              <Field label="Researcher Responsible">
                <Input value={form.researcher_responsible} onChange={set('researcher_responsible')} maxLength={120} />
              </Field>
              <Field label="Date Frozen"><Input type="date" value={form.date_frozen || ''} onChange={set('date_frozen')} max={todayISO()} /></Field>
              <Field label="Date Added to Inventory"><Input type="date" value={form.date_added || ''} onChange={set('date_added')} max={todayISO()} /></Field>
              <Field label="Cell Line Origin"><Input value={form.cell_line_origin} onChange={set('cell_line_origin')} placeholder="e.g. Mouse, C57BL/6 mammary" maxLength={200} /></Field>
              <Field label="Research Project"><Input value={form.project} onChange={set('project')} maxLength={200} /></Field>
              <Field label="Genetic Modifications" className="sm:col-span-2"><Input value={form.genetic_modifications} onChange={set('genetic_modifications')} maxLength={300} /></Field>
              <Field label="Selection Marker"><Input value={form.selection_marker} onChange={set('selection_marker')} maxLength={120} /></Field>
              <Field label="Antibiotic Resistance"><Input value={form.antibiotic_resistance} onChange={set('antibiotic_resistance')} placeholder="e.g. Puromycin" maxLength={120} /></Field>
              <Field label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={set('notes')} maxLength={4000} /></Field>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
