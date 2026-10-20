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

export const useRacks = () =>
  useQuery({
    queryKey: keys.racks,
    queryFn: async () =>
      unwrap(await supabase.from('rack_summary').select('*').order('tank_name').order('name')),
  });

export const useBoxes = () =>
  useQuery({
    queryKey: keys.boxes,
    queryFn: async () =>
      unwrap(
        await supabase.from('box_summary').select('*').order('tank_name').order('rack_name').order('name'),
      ),
  });

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
export async function searchSamples({
  term = '', status = 'active', transfected = 'any', researcher = '',
  dateFrom = '', dateTo = '', page = 0, pageSize = 50, all = false,
}) {
  let q = supabase.from('sample_locations').select('*', { count: 'exact' });
  if (status !== 'any') q = q.eq('status', status);
  if (transfected !== 'any') q = q.eq('transfected', transfected === 'yes');
  if (dateFrom) q = q.gte('passage_date', dateFrom);
  if (dateTo) q = q.lte('passage_date', dateTo);

  // Text conditions are OR-groups; when both are used they are ANDed together.
  const groups = [];
  const r = clean(researcher);
  if (r) groups.push(['researcher_responsible', 'passaged_by'].map((f) => `${f}.ilike."*${r}*"`));
  const t = clean(term);
  if (t) {
    const fields = [
      'sample_name', 'sample_code', 'grid_name', 'position', 'transfected_with', 'tank_name', 'rack_name', 'box_name',
      'researcher_responsible', 'passaged_by', 'media', 'project', 'cell_line_origin',
      'genetic_modifications', 'selection_marker', 'notes',
    ].map((f) => `${f}.ilike."*${t}*"`);
    if (/^\d+$/.test(t)) fields.push(`passage_number.eq.${t}`);
    if (/^(yes|transfected)$/i.test(t)) fields.push('transfected.is.true');
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) fields.push(`passage_date.eq.${t}`, `date_frozen.eq.${t}`, `date_added.eq.${t}`);
    groups.push(fields);
  }
  if (groups.length === 1) q = q.or(groups[0].join(','));
  if (groups.length === 2) q = q.or(`and(or(${groups[0].join(',')}),or(${groups[1].join(',')}))`);

  q = q.order('tank_name').order('rack_name').order('box_name').order('row_num').order('col_num');
  if (!all) q = q.range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data, count: count ?? data.length };
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
