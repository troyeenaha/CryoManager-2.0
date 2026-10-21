-- =====================================================================
-- CryoManager 0010 — Lab Members can add and edit boxes.
-- Run once in Supabase (SQL Editor → new snippet → paste → Run).
-- Safe to run more than once. Does not change any samples or boxes.
--
-- Lab Members (and Administrators) can now add boxes, edit box details
-- (name, nickname, size, position, notes) and archive/restore empty boxes.
-- Only Administrators can permanently delete a box.
-- Read-Only users still cannot change anything.
-- =====================================================================

drop policy if exists "boxes: insert" on public.boxes;
drop policy if exists "boxes: update" on public.boxes;

create policy "boxes: insert" on public.boxes
  for insert with check (public.can_edit_samples());

create policy "boxes: update" on public.boxes
  for update using (public.can_edit_samples()) with check (public.can_edit_samples());

-- "boxes: delete" stays admin-only (unchanged).
