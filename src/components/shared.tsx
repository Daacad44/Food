'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api, useStore } from './store';

/** Where each role lands after signing in. */
export function landing(role?: string) {
  if (role === 'RIDER') return '/rider';
  if (role === 'ACCOUNTANT') return '/admin/reports';
  return '/admin/orders/new';
}
export const roleLabel: Record<string, string> = {
  OWNER: 'Milkiile',
  MANAGER: 'Maamule',
  CASHIER: 'Cashier',
  RIDER: 'Darawal',
  ACCOUNTANT: 'Xisaabiye',
};
/** Pending / assigned / delivered / cancelled, as staff talk about an order. */
export const viewLabel: Record<string, [label: string, tone: string]> = {
  pending: ['Pending', 'new'],
  assigned: ['Assigned', 'road'],
  delivered: ['Delivered', 'done'],
  cancelled: ['Cancelled', 'off'],
};
export function Wordmark() {
  return (
    <span className="wordmark">
      botan<span>.</span>
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span />
      {'Soo dejinaya…'}
    </div>
  );
}
export function Notice({ error }: { error: string }) {
  return (
    <div className="notice" role="alert">
      {error}
    </div>
  );
}
export function LoginPage() {
  const { user, ready, refreshUser } = useStore(),
    router = useRouter(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ready && user?.kind === 'staff') router.replace(landing(user.role));
  }, [ready, user, router]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api('auth/staff/login', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      await refreshUser();
      router.replace(landing(result.role));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="login-screen">
      <section className="login-art" aria-hidden="true">
        <Wordmark />
        <p className="mono-label">Botan Restaurant · Delivery</p>
        <h1>
          Dalab qaado.
          <br />
          Darawal u dir.
          <br />
          <em>La socod.</em>
        </h1>
      </section>
      <form onSubmit={submit} className="login-card">
        <div className="mono-label">Botan team</div>
        <h2>Gal akoonkaaga</h2>
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            maxLength={72}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <Notice error={error} />}
        <button className="button full" disabled={busy}>
          {busy ? 'Sug…' : 'Gal'} <ArrowRight size={17} />
        </button>
      </form>
    </main>
  );
}
