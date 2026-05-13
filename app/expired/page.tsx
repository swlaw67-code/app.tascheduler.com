// app/expired/page.tsx
export default function ExpiredPage() {
  const phone = process.env.NEXT_PUBLIC_SUPPORT_PHONE || '(478)257-9269';

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--surface-bg)] p-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 mb-6">
          <svg className="w-8 h-8 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>

        <h1
          className="text-3xl text-[var(--text-primary)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Account Past Due
        </h1>

        <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
          Your TASScheduler account is currently suspended due to an outstanding balance.
          Please contact us to restore access to your account.
        </p>

        <div className="card p-6 mb-6">
          <p className="text-sm text-[var(--text-muted)] mb-2">Call us to resolve this</p>
          <a
            href={`tel:${phone.replace(/\D/g,'')}`}
            className="text-2xl font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {phone}
          </a>
        </div>

        <a href="/login" className="btn-ghost text-sm">
          ← Back to Login
        </a>
      </div>
    </main>
  );
}
