import { useRef, useState } from 'react';
import { useToast } from './Toast.jsx';
import { friendlyError } from '../lib/errors.js';

/**
 * Wraps a save action so that:
 *  - double clicks never submit twice,
 *  - success is only shown after the database confirms,
 *  - errors are shown in plain language and the form stays open.
 */
export function useFormSubmit() {
  const toast = useToast();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action, { success, onDone } = {}) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      onDone?.(result);
      return true;
    } catch (err) {
      setError(friendlyError(err));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { run, busy, error, setError };
}
