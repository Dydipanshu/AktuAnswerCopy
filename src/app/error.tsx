'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#f3f1ea_45%,_#efe7dd_100%)] px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white/90 p-8 text-center shadow-xl">
        <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          Something went wrong
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          An unexpected error occurred. If this keeps happening, share the error ID below.
        </p>
        {error?.digest && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
            Error ID: {error.digest}
          </div>
        )}
        <button
          onClick={() => reset()}
          className="mt-6 rounded-full bg-slate-900 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
