'use client';

import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * TEMP: Do not crash the whole app on permission errors.
 * We'll re-enable once rules + auth are finalized.
 */
export function FirebaseErrorListener() {
  useEffect(() => {
    const handleError = (_error: FirestorePermissionError) => {
      // no-op (keeps app usable)
      // you can surface toast here later if you want
    };

    errorEmitter.on('permission-error', handleError);
    return () => errorEmitter.off('permission-error', handleError);
  }, []);

  return null;
}
