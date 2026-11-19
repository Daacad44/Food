'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, RotateCcw, Smartphone, X } from 'lucide-react';
import { api } from './store';
import { describeOperator, parseSomaliMobile } from '@/lib/somali-phone';
import { formatMoney } from '@/lib/domain';

/** Live "Hormuud · EVC Plus" under a phone field. */
export function WalletBadge({ phone }: { phone: string }) {
  if (!phone.trim()) return null;
  const n = parseSomaliMobile(phone);
  return n ? (
    <span className="wallet-badge ok" aria-live="polite">
      <Smartphone size={13} /> {describeOperator(n)}
    </span>
  ) : (
    <span className="wallet-badge bad" aria-live="polite">
      Lambar Soomaali ah oo la garanayo ma aha
    </span>
  );
}

type Result = { status: 'PAID' | 'DECLINED' | 'UNKNOWN'; message: string; operator?: string };
/**
 * Sends a WaafiPay request to the customer's phone and waits while they enter their PIN.
 * Declined: retry (optionally another number) or close. Paid: done.
 */
export function WaafiSendDialog({
  paymentId,
  amount,
  phone: initialPhone,
  orderNumber,
  onClose,
  onPaid,
  autoStart = true,
}: {
  paymentId: string;
  amount: unknown;
  phone: string;
  orderNumber?: string;
  onClose: (result?: Result) => void;
  onPaid?: () => void;
  autoStart?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    started = useRef(false),
    [phone, setPhone] = useState(initialPhone),
    [state, setState] = useState<'idle' | 'waiting' | Result['status'] | 'error'>('idle'),
    [message, setMessage] = useState(''),
    [seconds, setSeconds] = useState(0);
  const n = parseSomaliMobile(phone);
  useEffect(() => dialog.current?.showModal(), []);
  useEffect(() => {
    if (state !== 'waiting') return;
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);
  async function send() {
    if (!n) return;
    setState('waiting');
    setMessage('');
    try {
      const r: Result = await api('payments/' + paymentId + '/send', {
        method: 'POST',
        body: JSON.stringify({ phone: n.msisdn }),
      });
      setState(r.status);
      setMessage(r.message);
      if (r.status === 'PAID') onPaid?.();
    } catch (e) {
      setState('error');
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    if (autoStart && !started.current && n) {
      started.current = true;
      void send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () =>
    onClose(
      state === 'PAID' || state === 'DECLINED' || state === 'UNKNOWN'
        ? { status: state, message }
        : undefined,
    );
  return (
    <dialog
      ref={dialog}
      className="modal waafi-dialog"
      aria-labelledby="waafi-title"
      onCancel={(e) => {
        if (state === 'waiting') e.preventDefault();
        else close();
      }}
    >
      <div className="modal-heading">
        <h2 id="waafi-title">
          WaafiPay · {formatMoney(amount)}
          {orderNumber && <small> · {orderNumber.split('-').pop()}</small>}
        </h2>
        {state !== 'waiting' && (
          <button className="icon-button" onClick={close} aria-label="Xir">
            <X size={20} />
          </button>
        )}
      </div>
      <div className="waafi-body">
        {state === 'waiting' ? (
          <div className="waafi-wait" role="status">
            <span className="waafi-phone">
              <Smartphone size={34} />
              <Loader2 size={22} className="spin" />
            </span>
            <b>Codsiga waxaa loo diray {n?.local}</b>
            <p>
              {n && describeOperator(n)} · Macmiilka ha geliyo PIN-kiisa taleefanka. ({seconds}s)
            </p>
            <small className="muted">Ha xirin daaqadda; jawaabta ayaa la sugayaa.</small>
          </div>
        ) : state === 'PAID' ? (
          <div className="waafi-result ok" role="status">
            <Check size={34} />
            <b>Lacagta waa la helay</b>
            <p>{message}</p>
          </div>
        ) : (
          <>
            {(state === 'DECLINED' || state === 'UNKNOWN' || state === 'error') && (
              <div
                className={'waafi-result ' + (state === 'UNKNOWN' ? 'warn' : 'bad')}
                role="alert"
              >
                <b>
                  {state === 'UNKNOWN'
                    ? 'Jawaab lama helin'
                    : state === 'DECLINED'
                      ? 'Lacagta lama bixin'
                      : 'Lama diri karin'}
                </b>
                <p>{message}</p>
              </div>
            )}
            <label className="field">
              Lambarka lacagta laga bixinayo
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus={state === 'idle'}
              />
              <WalletBadge phone={phone} />
            </label>
          </>
        )}
      </div>
      {state !== 'waiting' && (
        <div className="modal-footer">
          {state === 'PAID' ? (
            <button className="button" onClick={close}>
              Dhammaad <Check size={16} />
            </button>
          ) : (
            <>
              <button type="button" className="button outline" onClick={close}>
                {state === 'idle' ? 'Ka noqo' : 'Dambe'}
              </button>
              {state !== 'UNKNOWN' && (
                <button className="button" disabled={!n} onClick={() => void send()}>
                  {state === 'idle' ? (
                    <>
                      <Smartphone size={16} /> Dir codsiga
                    </>
                  ) : (
                    <>
                      <RotateCcw size={16} /> Isku day mar kale
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
