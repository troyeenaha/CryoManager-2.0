import { useMemo, useState } from 'react';
import { CircleCheck, Mail } from 'lucide-react';
import { useProfiles } from '../api/data.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { boxDisplay, positionLabel } from '../lib/grid.js';
import { fmtDate, todayISO } from '../lib/format.js';
import { Button, Field, Input, Modal, Textarea, cx } from './ui.jsx';

const where = (box, row, col) =>
  `${box.name}${positionLabel(row, col)} (${box.tank_name} › Rack ${box.rack_name} › Box ${boxDisplay(box)})`;

/**
 * moves: [{ sample, fromBox, from: {row, col}, toBox, to: {row, col} }]
 * Builds an email in the user's own mail app (nothing is sent automatically).
 */
export function buildMoveEmail({ moves, me, note }) {
  const n = moves.length;
  const lines = moves.slice(0, 25).map((m) =>
    `• ${m.sample.sample_name}: ${where(m.fromBox, m.from.row, m.from.col)} → ${where(m.toBox, m.to.row, m.to.col)}`);
  if (n > 25) lines.push(`…and ${n - 25} more (see CryoManager → Reports → Sample movement history).`);
  const subject = n === 1
    ? `CryoManager: ${moves[0].sample.sample_name} moved to ${moves[0].toBox.name}${positionLabel(moves[0].to.row, moves[0].to.col)}`
    : `CryoManager: ${n} vials moved to box ${boxDisplay(moves[0].toBox)}`;
  const body = [
    'Hi,',
    '',
    `I moved ${n === 1 ? 'a vial' : `${n} vials`} in the LN2 inventory on ${fmtDate(todayISO())}:`,
    '',
    ...lines,
    ...(note?.trim() ? ['', `Note: ${note.trim()}`] : []),
    '',
    `Open the box: ${window.location.origin}/grid/${moves[0].toBox.id}`,
    '',
    `— ${me?.full_name || me?.email || ''}${me?.initials ? ` (${me.initials})` : ''}`,
  ].join('\n');
  return { subject, body };
}

export function NotifyMoveDialog({ moves, onClose }) {
  const { profile } = useAuth();
  const { data: people } = useProfiles();
  const [chosen, setChosen] = useState(() => new Set());
  const [other, setOther] = useState('');
  const [note, setNote] = useState('');
  const colleagues = useMemo(
    () => (people || []).filter((p) => p.status === 'active' && p.id !== profile?.id && p.email)
      .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email)),
    [people, profile],
  );
  const extra = other.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  const recipients = [...colleagues.filter((p) => chosen.has(p.id)).map((p) => p.email), ...extra];

  function openEmail() {
    const { subject, body } = buildMoveEmail({ moves, me: profile, note });
    const href = `mailto:${recipients.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    onClose();
  }

  const n = moves.length;
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <CircleCheck className="h-5 w-5 text-emerald-500" /> {n === 1 ? 'Vial moved' : `${n} vials moved`}
        </span>
      }
      subtitle="Optional: let someone know by email."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>No thanks</Button>
          <Button onClick={openEmail} disabled={!recipients.length}>
            <Mail className="h-4 w-4" /> Write email{recipients.length ? ` (${recipients.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600 mb-4 space-y-1 max-h-24 overflow-y-auto">
        {moves.slice(0, 8).map((m) => (
          <div key={m.sample.id}>
            <strong className="text-slate-900">{m.sample.sample_name}</strong>{' '}
            {m.fromBox.name}{positionLabel(m.from.row, m.from.col)} → <strong className="text-brand-800">{m.toBox.name}{positionLabel(m.to.row, m.to.col)}</strong>
          </div>
        ))}
        {n > 8 && <div>…and {n - 8} more</div>}
      </div>

      <Field label="Who should know?">
        <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {colleagues.length === 0 && <p className="px-3 py-2.5 text-sm text-slate-500">No other lab members yet. Type an email below.</p>}
          {colleagues.map((p) => (
            <label key={p.id} className={cx('flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50', chosen.has(p.id) && 'bg-brand-50')}>
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-700"
                checked={chosen.has(p.id)}
                onChange={() => setChosen((prev) => { const s = new Set(prev); if (s.has(p.id)) s.delete(p.id); else s.add(p.id); return s; })}
              />
              {p.initials && <span className="font-semibold text-brand-800 w-8">{p.initials}</span>}
              <span className="flex-1 min-w-0 truncate">{p.full_name || p.email}<span className="text-slate-400"> · {p.email}</span></span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Other email addresses" hint="Optional, separate with commas" className="mt-3">
        <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="name@umich.edu" />
      </Field>
      <Field label="Note" className="mt-3">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Moved to make room for the new HER2 batch." />
      </Field>
      <p className="mt-3 text-xs text-slate-500">
        This opens your own email program with the message written for you, so you can check it and press Send.
      </p>
    </Modal>
  );
}
