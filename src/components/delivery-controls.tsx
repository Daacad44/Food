'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api, useStore } from './store';
import { formatMoney, paymentMethodLabel, PAYMENT_METHODS } from '@/lib/domain';

export function NewRiderDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (rider: any) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="modal" onCancel={onClose} aria-labelledby="rider-dialog-title">
      <div className="modal-heading">
        <h2 id="rider-dialog-title">Ku dar darawal</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close rider dialog">
          <X size={20} />
        </button>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          const form = new FormData(event.currentTarget);
          try {
            const rider = await api('admin/delivery/riders', {
              method: 'POST',
              body: JSON.stringify(Object.fromEntries(form)),
            });
            await onCreated(rider);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Magaca darawalka
          <input name="fullName" required minLength={2} maxLength={100} autoComplete="name" />
        </label>
        <label className="field">
          Email-ka darawalka
          <input name="email" required type="email" autoComplete="off" />
        </label>
        <label className="field">
          Telefoonka darawalka
          <input name="phone" type="tel" maxLength={30} autoComplete="off" />
        </label>
        <label className="field">
          Password-ka darawalka
          <input
            name="password"
            required
            type="password"
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        <p className="muted">
          Ugu yaraan 12 characters. Darawalku wuxuu ka galayaa Staff login, kadib Rider portal.
        </p>
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <button type="button" className="button outline" onClick={onClose}>
            Ka noqo
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Sug…' : 'Kaydi darawalka'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Records money received by hand: cash counted, or a mobile-money transfer seen on the phone. */
export function PaymentCapture({ payment, onDone }: { payment: any; onDone: () => Promise<void> }) {
  const { toast } = useStore(),
    [method, setMethod] = useState(payment.method),
    [reference, setReference] = useState(payment.providerReference || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="payment-capture"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          await api('payments/' + payment.id + '/capture', {
            method: 'POST',
            body: JSON.stringify({
              method,
              ...(method !== 'CASH' && reference ? { reference: reference.trim() } : {}),
            }),
          });
          await onDone();
          toast('Lacagta waa la diiwaangeliyey');
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="segmented" role="group" aria-label="Habka lacagta">
        {PAYMENT_METHODS.map((m) => (
          <button
            type="button"
            key={m}
            className={method === m ? 'active' : ''}
            aria-pressed={method === m}
            onClick={() => setMethod(m)}
          >
            {paymentMethodLabel[m]}
          </button>
        ))}
      </div>
      {method !== 'CASH' && (
        <label className="field">
          Telefoonka lacagta laga soo diray
          <input
            type="tel"
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <button className="button outline full" disabled={busy}>
        {busy ? 'Sug…' : `La qaaday · ${formatMoney(payment.amount)}`}
      </button>
    </form>
  );
}

export function DeliveryCompletion({
  order,
  endpoint,
  onCompleted,
}: {
  order: any;
  endpoint: string;
  onCompleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { toast } = useStore();
  const paid = order.paymentStatus === 'PAID';
  const pending = order.payments
    .filter((payment: any) => ['PENDING', 'UNPAID'].includes(payment.status))
    .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
  const refunded = ['PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.paymentStatus);
  const methods = [
    ...new Set(
      order.payments
        .filter((payment: any) => ['PENDING', 'UNPAID'].includes(payment.status))
        .map((payment: any) => paymentMethodLabel[payment.method] || payment.method),
    ),
  ].join(' / ');
  return (
    <form
      className="delivery-completion"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setError('');
        try {
          await api(endpoint, {
            method: 'POST',
            body: JSON.stringify({
              proofNote: form.get('proofNote'),
              confirmPaymentCollected: form.get('confirmPaymentCollected') === 'on',
            }),
          });
          await onCompleted();
          toast('Gaarsiinta waa la dhammeeyey');
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Dhammee gaarsiinta</h3>
      <p className="muted">
        Xaqiiji marka cuntada la gaarsiiyey macmiilka. Ficilkan iyo qofka sameeyey waxaa lagu
        kaydinayaa taariikhda dalabka.
      </p>
      <label className="field">
        Caddaynta gaarsiinta
        <textarea
          name="proofNote"
          required
          minLength={3}
          maxLength={500}
          placeholder="Tusaale: Macmiilka ayaa cuntada la guddoonsiiyey."
        />
      </label>
      {!paid && !refunded && (
        <label className="check-row cash-confirmation">
          <input type="checkbox" name="confirmPaymentCollected" required />
          <span>
            Waxaan xaqiijinayaa in {formatMoney(pending)} ({methods || 'Cash'}) la qaaday.
          </span>
        </label>
      )}
      {paid && <p className="muted">Lacagta waa la bixiyey. Mar kale lama qaadayo.</p>}
      {refunded && (
        <div className="notice">
          Dalab lacag laga celiyey lama dhammeystiri karo. Hubi payments-ka.
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <button className="button full" disabled={busy || refunded}>
        {busy ? 'Sug…' : 'Xaqiiji in la geeyey'}
        <Check size={16} />
      </button>
    </form>
  );
}
