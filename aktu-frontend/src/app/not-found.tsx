export default function NotFound() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#f3f1ea_45%,_#efe7dd_100%)] px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white/90 p-8 text-center shadow-xl">
        <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
          Page not found
        </h1>
        <p className="mt-3 text-sm text-slate-600">We couldn’t find that page. Go back and try again.</p>
      </div>
    </div>
  );
}
