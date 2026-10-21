// All database access lives in this one file, so the rest of the app never
// talks to Supabase directly. If the backend ever changes, only this file
// (and src/auth) needs rewriting.
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';
import { ConflictError } from '../lib/errors.js';

export const keys = {
  tanks: ['tanks'],
  racks: ['racks'],
  boxes: ['boxes'],
  samples: (boxId) => ['samples', boxId],
  allSamples: ['samples'],
  stats: ['stats'],
  search: (params) => ['search', params],
  history: (id) => ['history', id],
  profiles: ['profiles'],
  settings: ['settings'],
};

// ---------------------------------------------------------------- reads

export const useTanks = () =>
  useQuery({
    queryKey: keys.tanks,
    queryFn: async () => unwrap(await supabase.from('tank_summary').select('*').order('name')),
  });

// Natural order: A1, A2 … A9, A10, A11, A12 (not A1, A10, A11, A12, A2).
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byNatural = (...keys) => (a, b) => {
  for (const k of keys) {
    const d = natural.compare(String(a[k] ?? ''), String(b[k] ?? ''));
    if (d) return d;
  }
  return 0;
};

export const useRacks = () =>
  useQuery({
    queryKey: keys.racks,
    queryFn: async () =>
      unwrap(await supabase.from('rack_summary').select('*')).sort(byNatural('tank_name', 'name')),
  });

export const useBoxes = () =>
  useQuery({
    queryKey: keys.boxes,
    queryFn: async () =>
      unwrap(await supabase.from('box_summary').select('*')).sort(byNatural('tank_name', 'rack_name', 'name')),
  });

// Fields the sample form remembers and suggests while typing.
export const SUGGEST_FIELDS = [
  'sample_name', 'transfected_with', 'media', 'cell_line_origin', 'genetic_modifications',
  'selection_marker', 'antibiotic_resistance', 'project', 'researcher_responsible',
];

/**
 * Everything typed before (including vials since taken out), per field:
 * { sample_name: ['EO771 HER2', 'MDA-MB-231', …], … }. Spellings that differ
 * only in capitals or spaces count as one, shown the way most people typed it;
 * the most used come first.
 */
export const useSampleSuggestions = () =>
  useQuery({
    queryKey: ['samples', 'suggestions'],
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await fetchAll('samples', (q) => q, SUGGEST_FIELDS.join(','));
      const out = {};
      for (const field of SUGGEST_FIELDS) {
        const groups = new Map(); // normalized -> { total, spellings: Map(spelling -> count) }
        for (const r of rows) {
          const v = String(r[field] ?? '').trim().replace(/\s+/g, ' ');
          if (!v) continue;
          const k = v.toLowerCase();
          const g = groups.get(k) || { total: 0, spellings: new Map() };
          g.total += 1;
          g.spellings.set(v, (g.spellings.get(v) || 0) + 1);
          groups.set(k, g);
        }
        out[field] = [...groups.values()]
          .map((g) => ({ total: g.total, value: [...g.spellings].sort((a, b) => b[1] - a[1])[0][0] }))
          .sort((a, b) => b.total - a.total || natural.compare(a.value, b.value))
          .map((g) => g.value);
      }
      return out;
    },
  });

/**
 * Adds the missing boxes to racks, named like rack A: rack B gets B1, B2 …
 * up to the rack's capacity. One statement, so either all are added or none.
 */
export async function fillRacksWithBoxes(plan) {
  const rows = plan.flatMap((p) => p.names.map((name) => ({ rack_id: p.rack.id, name, rows: 9, cols: 9 })));
  if (!rows.length) return [];
  return unwrap(await supabase.from('boxes').insert(rows).select('id'));
}

/** Which boxes each rack is missing (by name), up to its capacity. */
export function planRackFill(racks, boxes) {
  return racks
    .filter((r) => r.status !== 'archived')
    .map((r) => {
      const inRack = boxes.filter((b) => b.rack_id === r.id && b.status !== 'archived');
      const taken = new Set(boxes.filter((b) => b.rack_id === r.id).map((b) => b.name.trim().toLowerCase()));
      const free = Math.max(0, r.box_capacity - inRack.length);
      const names = [];
      for (let i = 1; names.length < free && i <= r.box_capacity + 50; i++) {
        const n = `${r.name}${i}`;
        if (!taken.has(n.toLowerCase())) names.push(n);
      }
      return { rack: r, names };
    })
    .filter((p) => p.names.length);
}

export const useBoxSamples = (boxId) =>
  useQuery({
    queryKey: keys.samples(boxId),
    enabled: Boolean(boxId),
    queryFn: async () =>
      unwrap(await supabase.from('samples').select('*').eq('box_id', boxId).eq('status', 'active')),
  });

export const useStats = () =>
  useQuery({
    queryKey: keys.stats,
    queryFn: async () => unwrap(await supabase.rpc('inventory_stats')),
  });

export const useSampleHistory = (sampleId) =>
  useQuery({
    queryKey: keys.history(sampleId),
    enabled: Boolean(sampleId),
    queryFn: async () =>
      unwrap(
        await supabase
          .from('audit_log')
          .select('*')
          .eq('entity_type', 'sample')
          .eq('entity_id', sampleId)
          .order('occurred_at', { ascending: false }),
      ),
  });

export const useSettings = () =>
  useQuery({
    queryKey: keys.settings,
    queryFn: async () => unwrap(await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle()),
  });

export const useProfiles = (enabled = true) =>
  useQuery({
    queryKey: keys.profiles,
    enabled,
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').order('created_at')),
  });

// Characters that would break PostgREST "or" filters.
const clean = (s) => (s || '').replace(/[,()*\\:"%]/g, ' ').trim();

/**
 * Global sample search across name, ID, position, researcher, media,
 * project, tank / rack / box names, plus optional filters. Paginated.
 */
const SEARCH_FIELDS = [
  'sample_name', 'grid_name', 'position', 'transfected_with', 'tank_name', 'rack_name', 'box_name',
  'box_label', 'researcher_responsible', 'passaged_by', 'media', 'project', 'cell_line_origin',
  'genetic_modifications', 'selection_marker', 'antibiotic_resistance', 'notes',
];

/** Initials of lab members whose name or email contains `word` ("troyee" → ["TN"]). */
function initialsFor(word, people) {
  const w = word.toLowerCase();
  return (people || [])
    .filter((p) => p.initials && ((p.full_name || '').toLowerCase().includes(w) || (p.email || '').toLowerCase().split('@')[0].includes(w)))
    .map((p) => p.initials);
}

/** One OR-group: everything a single search word could match. */
function wordGroup(word, people) {
  const t = clean(word);
  if (!t) return null;
  const parts = SEARCH_FIELDS.map((f) => `${f}.ilike."*${t}*"`);
  initialsFor(t, people).forEach((ini) => parts.push(`passaged_by.eq.${ini}`));
  (people || [])
    .filter((p) => (p.full_name || '').toLowerCase().includes(t.toLowerCase()) && p.full_name)
    .forEach((p) => parts.push(`researcher_responsible.ilike."*${clean(p.full_name)}*"`));
  if (/^\d+$/.test(t)) parts.push(`passage_number.eq.${t}`);
  if (/^(transfected|yes)$/i.test(t)) parts.push('transfected.is.true');
  if (/^(untransfected|no)$/i.test(t)) parts.push('transfected.is.false');
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) parts.push(`passage_date.eq.${t}`, `date_frozen.eq.${t}`, `date_added.eq.${t}`);
  return `or(${parts.join(',')})`;
}

/**
 * Search the inventory. Every word in `term` must match something
 * (cell line, ID, grid name, box nickname, initials, a person's full name, …).
 * `people` (lab profiles) lets "Greg" find samples passaged by "GT".
 */
export async function searchSamples({
  term = '', status = 'active', transfected = 'any', researcher = '',
  dateFrom = '', dateTo = '', people = [], limit = 2000,
}) {
  let q = supabase.from('sample_locations').select('*', { count: 'exact' });
  if (status !== 'any') q = q.eq('status', status);
  if (transfected !== 'any') q = q.eq('transfected', transfected === 'yes');
  if (dateFrom) q = q.gte('passage_date', dateFrom);
  if (dateTo) q = q.lte('passage_date', dateTo);

  const groups = [];
  const r = clean(researcher);
  if (r) {
    const parts = ['researcher_responsible', 'passaged_by'].map((f) => `${f}.ilike."*${r}*"`);
    initialsFor(r, people).forEach((ini) => parts.push(`passaged_by.eq.${ini}`));
    groups.push(`or(${parts.join(',')})`);
  }
  (term || '').split(/\s+/).filter(Boolean).slice(0, 6).forEach((w) => {
    const g = wordGroup(w, people);
    if (g) groups.push(g);
  });
  if (groups.length) q = q.or(`and(${groups.join(',')})`);

  q = q.order('sample_name').order('tank_name').order('rack_name').order('box_name').order('row_num').order('col_num')
    .range(0, limit - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, count: count ?? data.length };
}

/** Anyone (not signed in) asks for access. Returns 'requested' | 'already_requested' | 'already_invited' | 'has_account'. */
export async function requestAccess({ email, fullName, initials }) {
  return unwrap(await supabase.rpc('request_access', { p_email: email, p_full_name: fullName, p_initials: initials }));
}

/**
 * Emails someone a secure CryoManager link (sent by Supabase). Clicking it
 * confirms their address and signs them in, then they choose a password.
 * Used when an admin approves a request or adds a person.
 */
export async function sendAccountEmail({ email, fullName, initials }) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/`, data: { full_name: fullName, initials } },
  });
  if (error) throw error;
}

/** Fetch every row of a table/view (paged under the hood — no 1000-row cap). */
export async function fetchAll(table, build = (q) => q, columns = '*') {
  const size = 1000;
  let from = 0;
  const out = [];
  for (;;) {
    const data = unwrap(await build(supabase.from(table).select(columns)).range(from, from + size - 1));
    out.push(...data);
    if (data.length < size) return out;
    from += size;
  }
}

// ---------------------------------------------------------------- writes

/**
 * Insert (no id) or update (id + version). Updates only succeed if nobody
 * else saved the row since it was loaded; otherwise a ConflictError is thrown.
 */
export async function saveRow(table, { id, version, ...values }) {
  if (!id) {
    return unwrap(await supabase.from(table).insert(values).select().single());
  }
  const rows = unwrap(
    await supabase.from(table).update(values).eq('id', id).eq('version', version).select(),
  );
  if (!rows.length) throw new ConflictError();
  return rows[0];
}

/** Adds several samples in one statement: all are saved, or none are. */
export async function insertSamples(rows) {
  return unwrap(await supabase.from('samples').insert(rows).select());
}

/**
 * Moves several samples in one transaction (all or nothing).
 * moves: [{ sample, boxId, row, col }]
 */
export async function moveSamples(moves) {
  return unwrap(
    await supabase.rpc('move_samples', {
      p_moves: moves.map((m) => ({ id: m.sample.id, version: m.sample.version, box_id: m.boxId, row: m.row, col: m.col })),
    }),
  );
}

/** Takes several samples out of storage in one statement (all or nothing). */
export async function takeOutSamples(samples, status, reason) {
  const ids = samples.map((s) => s.id);
  const rows = unwrap(
    await supabase.from('samples').update({ status, archive_reason: reason }).in('id', ids).eq('status', 'active').select('id'),
  );
  if (rows.length !== ids.length) {
    throw new Error(`${ids.length - rows.length} of the samples had already been changed by someone else. Refresh and check.`);
  }
  return rows;
}

export async function deleteRow(table, id) {
  const rows = unwrap(await supabase.from(table).delete().eq('id', id).select('id'));
  if (!rows.length) throw new Error('Nothing was deleted — you may not have permission, or it was already removed.');
}

export async function moveSample({ sample, boxId, row, col }) {
  return unwrap(
    await supabase.rpc('move_sample', {
      p_sample_id: sample.id,
      p_box_id: boxId,
      p_row: row,
      p_col: col,
      p_expected_version: sample.version,
    }),
  );
}

/** Mutation that refreshes the inventory views after the database confirms. */
export function useInventoryMutation(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      ['tanks', 'racks', 'boxes', 'samples', 'stats', 'search', 'history', 'profiles', 'settings'].forEach(
        (k) => qc.invalidateQueries({ queryKey: [k] }),
      );
    },
  });
}

/** Keeps every open browser in sync when a colleague changes something. */
export function useLiveInventory(enabled) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    const map = { samples: ['samples', 'stats', 'search', 'boxes', 'history'], boxes: ['boxes', 'racks'], racks: ['racks', 'tanks'], tanks: ['tanks'] };
    let channel = supabase.channel('inventory-changes');
    Object.entries(map).forEach(([table, ks]) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () =>
        ks.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
