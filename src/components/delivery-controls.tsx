'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Truck, X } from 'lucide-react';
import { api, useData, useStore } from './store';
import { formatMoney } from '@/lib/domain';

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

export function RiderAssignment({
  order,
  onUpdated,
}: {
  order: any;
  onUpdated: () => Promise<void>;
}) {
  const { user, toast } = useStore();
  const manager = ['OWNER', 'MANAGER'].includes(user?.role);
  const {
    data: riders,
    error,
    refresh,
  } = useData<any[]>(manager && order.type === 'DELIVERY' ? 'admin/delivery/riders' : null);
  const [selected, setSelected] = useState(order.delivery?.riderId || ''),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  useEffect(() => {
    setSelected(order.delivery?.riderId || '');
  }, [order.delivery?.riderId, order.id]);
  if (order.type !== 'DELIVERY') return null;
  const assignable =
    manager &&
    order.delivery &&
    ['PENDING', 'ASSIGNED'].includes(order.delivery.status) &&
    !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(order.status);
  return (
    <section className="delivery-assignment" aria-label="Darawalka dalabka">
      <h3>
        <Truck size={17} /> Darawalka
      </h3>
      <p>
        {order.delivery?.rider?.fullName || 'Weli darawal looma qoondeyn.'}
        {order.delivery?.rider?.phone && ` · ${order.delivery.rider.phone}`}
      </p>
      {assignable && (
        <>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setFailure('');
              try {
                await api('admin/deliveries/' + order.delivery.id, {
                  method: 'PATCH',
                  body: JSON.stringify({ riderId: selected }),
                });
                await onUpdated();
                toast('Darawalka waa la qoondeeyey');
              } catch (e) {
                setFailure((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              Dooro darawal
              <select
                value={selected}
                required
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Dooro…</option>
                {riders?.map((rider) => (
                  <option key={rider.id} value={rider.id}>
                    {rider.fullName}
                    {rider.phone ? ` · ${rider.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="row-actions">
              <button className="button outline" disabled={busy || !selected}>
                {busy ? 'Sug…' : 'U qoondee darawal'}
              </button>
              <button type="button" className="button outline" onClick={() => setAdding(true)}>
                <Plus size={15} />
                Ku dar darawal
              </button>
            </div>
          </form>
          {riders?.length === 0 && (
            <p className="muted">Darawal firfircoon ma jiro. Riix “Ku dar darawal”.</p>
          )}
        </>
      )}
      {(error || failure) && (
        <div className="notice" role="alert">
          {failure || error}
          {error && (
            <button type="button" className="text-link" onClick={() => void refresh()}>
              Mar kale isku day
            </button>
          )}
        </div>
      )}
      {adding && (
        <NewRiderDialog
          onClose={() => setAdding(false)}
          onCreated={async (rider) => {
            await refresh();
            setSelected(rider.id);
            setAdding(false);
            toast('Darawal cusub waa la kaydiyey. Hadda u qoondee dalabka.');
          }}
        />
      )}
    </section>
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
  const unsettledProvider =
    !paid &&
    order.payments.some(
      (payment: any) => ['PENDING', 'UNPAID'].includes(payment.status) && payment.method !== 'CASH',
    );
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
              confirmCashCollected: form.get('confirmCashCollected') === 'on',
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
      {!paid && !refunded && !unsettledProvider && (
        <label className="check-row cash-confirmation">
          <input type="checkbox" name="confirmCashCollected" required />
          <span>Waxaan xaqiijinayaa in {formatMoney(pending)} cash la qaaday.</span>
        </label>
      )}
      {paid && <p className="muted">Lacagta waa la bixiyey. Mar kale lama qaadayo.</p>}
      {refunded && (
        <div className="notice">
          Dalab lacag laga celiyey lama dhammeystiri karo. Hubi payments-ka.
        </div>
      )}
      {unsettledProvider && (
        <div className="notice">
          Lacag-bixinta online-ka waa in la xaqiijiyaa ka hor dhammeystirka. Cash ahaan looma
          diiwaangelinayo.
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <button className="button full" disabled={busy || refunded || unsettledProvider}>
        {busy ? 'Sug…' : 'Xaqiiji in la geeyey'}
        <Check size={16} />
      </button>
    </form>
  );
}
