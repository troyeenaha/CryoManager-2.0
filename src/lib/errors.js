// Turns database / network errors into messages a lab member can act on.

const CONSTRAINT_MESSAGES = {
  samples_one_per_position:
    'That position is already occupied. Someone may have just used it — the grid has been refreshed.',
  tanks_name_unique: 'A tank with this name already exists.',
  racks_name_unique_in_tank: 'A rack with this name already exists in this tank.',
  boxes_name_unique_in_rack: 'A box with this name already exists in this rack.',
};

export class ConflictError extends Error {
  constructor(message = 'Someone else changed this record after you opened it. Close the form, refresh, and try again.') {
    super(message);
    this.name = 'ConflictError';
    this.code = '40001';
  }
}

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  const msg = err.message || String(err);
  const code = err.code;

  if (err instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'Cannot reach the server. Check your internet connection and try again — nothing was saved.';
  }
  if (code === '23505') {
    for (const [key, text] of Object.entries(CONSTRAINT_MESSAGES)) {
      if (msg.includes(key)) return text;
    }
    return msg.startsWith('duplicate key') ? 'That would create a duplicate entry.' : msg;
  }
  if (code === '23503') {
    return 'This item still contains other items (or has history attached), so it cannot be deleted. Archive it instead.';
  }
  if (code === '23514') return 'One of the values is not allowed. Please check the form.';
  if (code === '42501' || /row-level security/i.test(msg)) {
    return 'You do not have permission to do that. Ask a lab administrator if you need access.';
  }
  if (code === 'PGRST301' || /JWT expired/i.test(msg)) {
    return 'Your session has expired. Please sign in again.';
  }
  return msg;
}
