'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone, Plus, Printer, RefreshCw, Search, Truck } from 'lucide-react';
import { api, useData, useStore } from './store';
import { Loading, Notice, viewLabel } from './shared';
import { PrintOnce } from './receipt';
import { DeliveryCompletion, NewRiderDialog, PaymentCapture } from './delivery-controls';
import { formatMoney, orderView, paymentMethodLabel, ORDER_VIEWS } from '@/lib/domain';

const tz = 'Africa/Mogadishu';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const time = (d: string) =>
  new Date(d).toLocaleString('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const short = (n: string) => '#' + n.split('-').pop();
function StatusPill({ status }: { status: string }) {
  const [label, tone] = viewLabel[orderView(status)];
  return <span className={'status-pill ' + tone}>{label}</span>;
}
/** Every order, by state: pending (no rider), assigned (on the road), delivered, cancelled. */
export function OrdersBoard() {
  const [view, setView] = useState<string>('pending'),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [q, setQ] = useState(''),
    [query, setQuery] = useState('');
  const params = new URLSearchParams({ view, ...(from ? { from } : {}), ...(to ? { to } : {}) });
  if (query) params.set('q', query);
  const { data, error, loading, refresh } = useData<any>('admin/orders?' + params, 8000),
    { data: riders } = useData<any[]>('admin/delivery/riders', 30000);
  const orders: any[] = data?.orders || [];
  return (
    <div className="board">
      <div className="board-head">
        <div>
          <span className="mono-label">Botan · Delivery</span>
          <h1>Dalabyada</h1>
        </div>
        <Link className="button" href="/admin/orders/new">
          <Plus size={16} /> Dalab cusub
        </Link>
      </div>
      <form
        className="board-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <label className="field">
          Laga bilaabo
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          Ilaa
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Raadi dalab"
            placeholder="Telefoon, magac, cinwaan ama #"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button className="button outline">Raadi</button>
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setFrom('');
            setTo('');
            setQ('');
            setQuery('');
          }}
        >
          Dhammaan taariikhaha
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Cusboonaysii"
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
        </button>
      </form>
      <div className="board-tabs" role="tablist" aria-label="Xaaladda dalabka">
        {ORDER_VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={'board-tab ' + viewLabel[v][1] + (view === v ? ' active' : '')}
            onClick={() => setView(v)}
          >
            {viewLabel[v][0]}
            <b>{data?.counts?.[v] ?? '·'}</b>
          </button>
        ))}
      </div>
      {error && <Notice error={error} />}
      {loading && !data && <Loading />}
      <div className="board-list">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} riders={riders || []} onChanged={refresh} />
        ))}
        {data && !orders.length && (
          <p className="board-empty">
            {view === 'pending'
              ? 'Dalab sugaya darawal ma jiro.'
              : view === 'assigned'
                ? 'Dalab jidka ku jira ma jiro.'
                : view === 'delivered'
                  ? 'Dalab la geeyey ma jiro muddadan.'
                  : 'Dalab la joojiyey ma jiro.'}
          </p>
        )}
      </div>
    </div>
  );
}
function OrderCard({
  order: o,
  riders,
  onChanged,
}: {
  order: any;
  riders: any[];
  onChanged: () => Promise<void>;
}) {
  const { user, toast } = useStore(),
    [busy, setBusy] = useState(false);
  const v = orderView(o.status);
  const canAssign =
    ['OWNER', 'MANAGER', 'CASHIER'].includes(user?.role) && (v === 'pending' || v === 'assigned');
  const payment = o.payments?.[0];
  return (
    <article className={'order-card ' + v}>
      <Link href={'/admin/orders/' + o.id} className="order-card-main">
        <span className="order-card-top">
          <b className="mono" title={o.orderNumber}>
            {short(o.orderNumber)}
          </b>
          <StatusPill status={o.status} />
          <span className="mono-label">{time(o.createdAt)}</span>
        </span>
        <span className="order-card-who">
          <b>{o.guestName}</b> · {o.guestPhone}
        </span>
        <span className="order-card-where">{o.deliveryAddress}</span>
        <span className="order-card-items">
          {o.items.map((i: any) => `${i.quantity}× ${i.nameSnapshot}`).join(' · ')}
        </span>
      </Link>
      <div className="order-card-side">
        <strong>{formatMoney(o.total)}</strong>
        <span className={'payment-status ' + o.paymentStatus}>
          {payment ? paymentMethodLabel[payment.method] : ''} ·{' '}
          {o.paymentStatus === 'PAID' ? 'La qaaday' : 'Lama qaadin'}
        </span>
        {canAssign ? (
          <label className="order-card-rider">
            <Truck size={15} />
            <select
              aria-label={'Darawal u dooro ' + o.orderNumber}
              value={o.delivery?.riderId || ''}
              disabled={busy}
              onChange={async (e) => {
                if (!e.target.value) return;
                setBusy(true);
                try {
                  await api('admin/orders/' + o.id + '/assign', {
                    method: 'POST',
                    body: JSON.stringify({ riderId: e.target.value }),
                  });
                  await onChanged();
                  toast('Darawalka waa la qoondeeyey');
                } catch (err) {
                  toast((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <option value="">Assign darawal…</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                  {r.activeOrders ? ` (${r.activeOrders})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          o.delivery?.rider && (
            <span className="order-card-rider-name">
              <Truck size={15} /> {o.delivery.rider.fullName}
            </span>
          )
        )}
      </div>
    </article>
  );
}
/** One order: details, rider, payment, delivery confirmation, cancel and reprint. */
export function OrderDetail({ id }: { id: string }) {
  const { data: o, error, refresh } = useData<any>('admin/orders/' + id, 8000),
    { data: riders, refresh: refreshRiders } = useData<any[]>('admin/delivery/riders'),
    { data: restaurant } = useData<any>('restaurant'),
    { user, toast } = useStore(),
    [rider, setRider] = useState(''),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [printing, setPrinting] = useState(false);
  useEffect(() => setRider(o?.delivery?.riderId || ''), [o?.delivery?.riderId]);
  if (error) return <Notice error={error} />;
  if (!o) return <Loading />;
  const v = orderView(o.status),
    taker = ['OWNER', 'MANAGER', 'CASHIER'].includes(user?.role),
    manager = ['OWNER', 'MANAGER'].includes(user?.role),
    refunder = ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT'].includes(user?.role),
    open = v === 'pending' || v === 'assigned';
  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setFailure('');
    try {
      await work();
      await refresh();
      toast(done);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="order-page">
      <Link href="/admin/orders" className="text-link">
        <ArrowLeft size={15} /> Dalabyada
      </Link>
      <div className="order-page-head">
        <div>
          <span className="mono-label">
            {time(o.createdAt)} · {o.handledBy?.fullName || 'Botan'}
          </span>
          <h1>
            {o.orderNumber} <StatusPill status={o.status} />
          </h1>
        </div>
        <button className="button outline" onClick={() => setPrinting(true)}>
          <Printer size={16} /> Print
        </button>
      </div>
      {failure && <Notice error={failure} />}
      <div className="two-columns order-details">
        <div className="panel padded">
          <h2>Cuntada</h2>
          {o.items.map((i: any) => (
            <div className="order-item" key={i.id}>
              <span className="item-count">{i.quantity}×</span>
              <div>
                <h3>{i.nameSnapshot}</h3>
                <small>{i.modifiers.map((m: any) => m.nameSnapshot).join(', ')}</small>
              </div>
              <b>{formatMoney(i.lineTotal)}</b>
            </div>
          ))}
          {[
            ['Sub total', o.subtotal],
            ['Discount', -Number(o.discountAmount)],
            ['VAT', o.taxAmount],
            ['Delivery fee', o.deliveryFee],
            ['Total', o.total],
          ].map(([label, value]) => (
            <div className={'summary-row ' + (label === 'Total' ? 'total' : '')} key={label}>
              <span>{label}</span>
              <b>{formatMoney(value)}</b>
            </div>
          ))}
          {o.notes && <p className="note">{o.notes}</p>}
          <h3>Taariikhda</h3>
          <div className="timeline">
            {o.statusEvents.map((e: any) => (
              <div key={e.id}>
                <span />
                <div>
                  <b>{viewLabel[orderView(e.toStatus)][0]}</b>
                  <small>{time(e.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel padded">
            <h2>Macmiilka</h2>
            <p>
              <b>{o.guestName}</b>
            </p>
            <p>
              <a className="text-link" href={'tel:' + o.guestPhone.replace(/[^+\d]/g, '')}>
                <Phone size={14} /> {o.guestPhone}
              </a>
            </p>
            <p>{o.deliveryAddress}</p>
          </div>
          <div className="panel padded">
            <h2>
              <Truck size={18} /> Darawalka
            </h2>
            <p>
              {o.delivery?.rider
                ? `${o.delivery.rider.fullName}${o.delivery.rider.phone ? ' · ' + o.delivery.rider.phone : ''}`
                : 'Weli darawal looma qoondeyn.'}
            </p>
            {taker && open && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api('admin/orders/' + o.id + '/assign', {
                        method: 'POST',
                        body: JSON.stringify({ riderId: rider }),
                      }),
                    'Darawalka waa la qoondeeyey',
                  );
                }}
              >
                <label className="field">
                  {o.delivery?.riderId ? 'Beddel darawalka' : 'Dooro darawal'}
                  <select value={rider} required onChange={(e) => setRider(e.target.value)}>
                    <option value="">Dooro…</option>
                    {riders?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.fullName}
                        {r.phone ? ` · ${r.phone}` : ''}
                        {r.activeOrders ? ` (${r.activeOrders} jidka)` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row-actions">
                  <button
                    className="button"
                    disabled={busy || !rider || rider === o.delivery?.riderId}
                  >
                    {o.delivery?.riderId ? 'Beddel' : 'Assign'}
                  </button>
                  {manager && (
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => setAdding(true)}
                    >
                      <Plus size={15} /> Darawal cusub
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
          <div className="panel padded">
            <h2>Lacagta</h2>
            {o.payments.map((p: any) => (
              <div key={p.id} className="payment-row">
                <div className="summary-row">
                  <span>
                    {paymentMethodLabel[p.method] || p.method}
                    {p.providerReference ? ` · ${p.providerReference}` : ''}
                  </span>
                  <b>{formatMoney(p.amount)}</b>
                </div>
                <span className={'payment-status ' + p.status}>
                  {p.status === 'PAID' ? 'La qaaday' : p.status}
                </span>
                {taker && open && ['PENDING', 'UNPAID'].includes(p.status) && (
                  <PaymentCapture payment={p} onDone={refresh} />
                )}
                {p.refunds?.map((r: any) => (
                  <small className="muted" key={r.id}>
                    Lacag celin {formatMoney(r.amount)} · {r.reason}
                  </small>
                ))}
                {refunder && ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status) && (
                  <RefundForm payment={p} onDone={refresh} />
                )}
              </div>
            ))}
          </div>
          {taker && open && (
            <DeliveryCompletion
              order={o}
              endpoint={'admin/orders/' + o.id + '/complete-delivery'}
              onCompleted={refresh}
            />
          )}
          {taker && open && (
            <button
              className="button outline danger full"
              disabled={busy}
              onClick={() => {
                if (!confirm('Ma hubtaa inaad joojinayso dalabkan?')) return;
                void run(
                  () =>
                    api('admin/orders/' + o.id + '/status', {
                      method: 'PATCH',
                      body: JSON.stringify({ status: 'CANCELLED' }),
                    }),
                  'Dalabka waa la joojiyey',
                );
              }}
            >
              Jooji dalabka
            </button>
          )}
        </div>
      </div>
      {adding && (
        <NewRiderDialog
          onClose={() => setAdding(false)}
          onCreated={async (r) => {
            await refreshRiders();
            setRider(r.id);
            setAdding(false);
            toast('Darawal cusub waa la kaydiyey');
          }}
        />
      )}
      {printing && <PrintOnce order={o} restaurant={restaurant} done={() => setPrinting(false)} />}
    </div>
  );
}

/** Gives money back on a received payment (all of it or part). Retries never refund twice. */
function RefundForm({ payment, onDone }: { payment: any; onDone: () => Promise<void> }) {
  const { toast } = useStore(),
    refunded = (payment.refunds || []).reduce((s: number, r: any) => s + Number(r.amount), 0),
    left = Math.round((Number(payment.amount) - refunded) * 100) / 100,
    [open, setOpen] = useState(false),
    [amount, setAmount] = useState(String(left)),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    key = useRef('');
  if (!open)
    return (
      <button className="text-link" onClick={() => setOpen(true)}>
        Lacag celi (refund)
      </button>
    );
  return (
    <form
      className="payment-capture"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        key.current ||= crypto.randomUUID();
        setBusy(true);
        setError('');
        try {
          await api('payments/' + payment.id + '/refund', {
            method: 'POST',
            headers: { 'Idempotency-Key': key.current },
            body: JSON.stringify({ amount: Number(amount), reason: reason.trim() }),
          });
          key.current = '';
          setOpen(false);
          setReason('');
          await onDone();
          toast('Lacagta waa la celiyey');
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        Inta la celinayo (ugu badnaan {formatMoney(left)})
        <input
          type="number"
          min="0.01"
          step="0.01"
          max={left}
          required
          value={amount}
          onChange={(e) => {
            key.current = '';
            setAmount(e.target.value);
          }}
        />
      </label>
      <label className="field">
        Sababta
        <input
          required
          minLength={3}
          maxLength={300}
          value={reason}
          onChange={(e) => {
            key.current = '';
            setReason(e.target.value);
          }}
        />
      </label>
      {error && <Notice error={error} />}
      <div className="row-actions">
        <button className="button outline danger" disabled={busy}>
          {busy ? 'Sug…' : 'Celi lacagta'}
        </button>
        <button type="button" className="button outline" onClick={() => setOpen(false)}>
          Ka noqo
        </button>
      </div>
    </form>
  );
}
