import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { saveRow, useInventoryMutation } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useFormSubmit } from './useFormSubmit.js';
import { positionLabel } from '../lib/grid.js';
import { todayISO } from '../lib/format.js';
import { Alert, Button, Field, Input, Modal, Segmented, Textarea, cx } from './ui.jsx';

const TEXT_FIELDS = [
  'sample_name', 'passaged_by', 'media', 'cell_line_origin', 'genetic_modifications', 'selection_marker',
  'antibiotic_resistance', 'project', 'researcher_responsible', 'notes',
];

/** Add (sample = null) or edit a sample at a fixed grid position. */
export default function SampleForm({ box, row, col, sample, onClose }) {
  const { profile } = useAuth();
  const isNew = !sample;
  const pos = positionLabel(row, col);
  const [form, setForm] = useState(() => ({
    sample_name: sample?.sample_name ?? '',
    transfected: sample?.transfected ?? null,
    passage_number: sample?.passage_number ?? '',
    passaged_by: sample?.passaged_by ?? (isNew ? profile?.full_name ?? '' : ''),
    media: sample?.media ?? '',
    passage_date: sample?.passage_date ?? '',
    vial_count: sample?.vial_count ?? 1,
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
  const hasAdvanced = sample && ['cell_line_origin', 'genetic_modifications', 'selection_marker', 'antibiotic_resistance', 'project', 'notes']
    .some((k) => sample[k]);
  const [advanced, setAdvanced] = useState(Boolean(hasAdvanced));
  const [touched, setTouched] = useState(false);
  const { run, busy, error } = useFormSubmit();
  const save = useInventoryMutation((v) => saveRow('samples', v));
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const errors = {
    sample_name: !form.sample_name.trim() && 'Sample name / cell type is required.',
    passage_number: form.passage_number !== '' && !(Number.isInteger(Number(form.passage_number)) && Number(form.passage_number) >= 0) && 'Whole number, 0 or more.',
    vial_count: !(Number.isInteger(Number(form.vial_count)) && Number(form.vial_count) >= 1 && Number(form.vial_count) <= 50) && '1–50 vials.',
  };

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) {
      if (errors.vial_count) setAdvanced(true);
      return;
    }
    const values = { ...form };
    TEXT_FIELDS.forEach((k) => { values[k] = (values[k] || '').trim(); });
    values.passage_number = form.passage_number === '' ? null : Number(form.passage_number);
    values.vial_count = Number(form.vial_count);
    ['passage_date', 'date_frozen'].forEach((k) => { values[k] = form[k] || null; });
    values.date_added = form.date_added || todayISO();
    run(
      () => save.mutateAsync(
        isNew
          ? { ...values, box_id: box.id, row_num: row, col_num: col }
          : { ...values, id: sample.id, version: sample.version },
      ),
      { success: (s) => `${s.sample_name} ${isNew ? 'added to' : 'saved at'} ${pos}.`, onDone: onClose },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="lg"
      title={`${isNew ? 'Add Sample' : 'Edit Sample'} (${pos})`}
      subtitle={`${box.tank_name} › Rack ${box.rack_name} › Box ${box.name}`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="sample-form" loading={busy}>Save</Button></>}
    >
      <form id="sample-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid sm:grid-cols-[8rem_1fr] gap-4">
          <Field label="Grid Name"><Input value={pos} readOnly tabIndex={-1} className="font-semibold text-brand-800" /></Field>
          <Field label="Sample Name / Cell Type" required error={touched && errors.sample_name}>
            <Input value={form.sample_name} onChange={set('sample_name')} placeholder="e.g. EO771 HER2" maxLength={120} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Transfected">
            <div>
              <Segmented
                label="Transfected"
                value={form.transfected}
                onChange={(v) => setForm((f) => ({ ...f, transfected: v }))}
                options={[{ value: true, label: 'Yes' }, { value: false, label: 'No' }, { value: null, label: 'Not recorded' }]}
              />
            </div>
          </Field>
          <Field label="Passage No." error={touched && errors.passage_number}>
            <Input type="number" min={0} step={1} value={form.passage_number} onChange={set('passage_number')} />
          </Field>
          <Field label="Who Passaged">
            <Input value={form.passaged_by} onChange={set('passaged_by')} maxLength={120} />
          </Field>
          <Field label="Date of Passage">
            <Input type="date" value={form.passage_date || ''} onChange={set('passage_date')} max={todayISO()} />
          </Field>
        </div>
        <Field label="Media" hint="Freezing medium">
          <Input value={form.media} onChange={set('media')} placeholder="e.g. 10% DMSO, 90% FBS" maxLength={200} />
        </Field>

        <div className="rounded-xl border border-slate-200">
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced((a) => !a)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-xl"
          >
            Advanced Details
            <ChevronDown className={cx('h-4 w-4 text-slate-400 transition-transform', advanced && 'rotate-180')} />
          </button>
          {advanced && (
            <div className="px-4 pb-4 pt-1 grid sm:grid-cols-2 gap-4 border-t border-slate-100">
              <Field label="Number of Vials" error={touched && errors.vial_count} hint="Vials stored together in this one slot">
                <Input type="number" min={1} max={50} value={form.vial_count} onChange={set('vial_count')} />
              </Field>
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
