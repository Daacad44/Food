'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Printer, Search, Trash2, X, Check } from 'lucide-react';
import { api, useData, useStore } from './store';
import { Loading, Notice } from './shared';
import { PrintOnce } from './receipt';
import { formatMoney, paymentMethodLabel, PAYMENT_METHODS } from '@/lib/domain';

type Line = {
  key: string;
  menuItemId: string;
  name: string;
  imageUrl?: string | null;
  unitCents: number;
  quantity: number;
  modifierOptionIds: string[];
  modifierNames: string[];
};
const cents = (v: unknown) => Math.round(Number(v) * 100);
const dollars = (c: number) => formatMoney(c / 100);
const blank = {
  customerPhone: '',
  customerName: '',
  deliveryAddress: '',
  zoneId: '',
  deliveryFee: '',
  riderId: '',
  discountPercent: '',
  paymentMethod: 'CASH' as string,
  paymentPhone: '',
  paid: false,
  withVat: true,
  notes: '',
};
/** The order-taking screen: menu on the left, the order on the right. */
export function OrderEntry() {
  const { toast } = useStore();
  const { data: items, error: menuError } = useData<any[]>('menu/items'),
    { data: categories } = useData<any[]>('menu/categories'),
    { data: zones } = useData<any[]>('delivery/zones'),
    { data: riders, refresh: refreshRiders } = useData<any[]>('admin/delivery/riders', 30000),
    { data: restaurant } = useData<any>('restaurant'),
    { data: pending } = useData<any>('admin/orders?view=pending&limit=1', 15000);
  const [category, setCategory] = useState(''),
    [search, setSearch] = useState(''),
    [lines, setLines] = useState<Line[]>([]),
    [form, setForm] = useState(blank),
    [picking, setPicking] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [known, setKnown] = useState<any>(null),
    [printing, setPrinting] = useState<any>(null);
  const keys = useRef<Record<string, string>>({});
  const set = (patch: Partial<typeof blank>) => setForm((f) => ({ ...f, ...patch }));
  const taxRate = Number(restaurant?.settings?.taxRate ?? 0);
  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitCents * l.quantity, 0);
    const pct = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
    const discount = Math.min(subtotal, Math.round((subtotal * pct) / 100));
    const tax = form.withVat ? Math.round(((subtotal - discount) * taxRate) / 100) : 0;
    const fee = form.deliveryFee === '' ? 0 : cents(form.deliveryFee);
    return { subtotal, discount, tax, fee, total: subtotal - discount + tax + fee };
  }, [lines, form.discountPercent, form.withVat, form.deliveryFee, taxRate]);

  function add(item: any, options: any[] = []) {
    const ids = options.map((o) => o.id).sort();
    const key = item.id + ':' + ids.join(',');
    const unitCents = cents(item.basePrice) + options.reduce((s, o) => s + cents(o.priceDelta), 0);
    setLines((old) =>
      old.some((l) => l.key === key)
        ? old.map((l) => (l.key === key ? { ...l, quantity: Math.min(100, l.quantity + 1) } : l))
        : [
            ...old,
            {
              key,
              menuItemId: item.id,
              name: item.name,
              imageUrl: item.imageUrl,
              unitCents,
              quantity: 1,
              modifierOptionIds: ids,
              modifierNames: options.map((o) => o.name),
            },
          ],
    );
  }
  const qty = (key: string, n: number) =>
    setLines((old) =>
      old
        .map((l) => (l.key === key ? { ...l, quantity: Math.min(100, n) } : l))
        .filter((l) => l.quantity > 0),
    );
  const reset = useCallback(() => {
    setLines([]);
    setForm(blank);
    setKnown(null);
    setError('');
  }, []);

  async function lookup(phone: string) {
    if (!/^\+?[\d\s-]{7,20}$/.test(phone.trim())) return setKnown(null);
    try {
      const found = await api('customers/lookup?phone=' + encodeURIComponent(phone.trim()));
      setKnown(found);
      if (found)
        setForm((f) => ({
          ...f,
          customerName: f.customerName || (found.guestName !== 'Macmiil' ? found.guestName : ''),
          deliveryAddress: f.deliveryAddress || found.deliveryAddress || '',
          zoneId: f.zoneId || found.zoneId || '',
          deliveryFee:
            f.deliveryFee ||
            (found.zoneId && zones?.find((z) => z.id === found.zoneId)?.deliveryFee) ||
            f.deliveryFee,
        }));
    } catch {
      setKnown(null);
    }
  }

  async function save(print: boolean) {
    if (busy) return;
    setError('');
    if (!lines.length) return setError('Ku dar ugu yaraan hal cunto.');
    const mobile = form.paymentMethod !== 'CASH';
    const payload = {
      items: lines.map((l) => ({
        menuItemId: l.menuItemId,
        quantity: l.quantity,
        modifierOptionIds: l.modifierOptionIds,
        specialInstructions: '',
      })),
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      deliveryAddress: form.deliveryAddress.trim(),
      ...(form.zoneId ? { zoneId: form.zoneId } : {}),
      deliveryFee: form.deliveryFee === '' ? 0 : Number(form.deliveryFee),
      discountPercent: Number(form.discountPercent) || 0,
      withVat: form.withVat,
      paymentMethod: form.paymentMethod,
      ...(mobile ? { paymentPhone: (form.paymentPhone || form.customerPhone).trim() } : {}),
      paid: form.paid,
      ...(form.riderId ? { riderId: form.riderId } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };
    const intent = JSON.stringify(payload);
    keys.current[intent] ||= crypto.randomUUID();
    setBusy(true);
    try {
      const created = await api('orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': keys.current[intent],
          'X-Expected-Total': (totals.total / 100).toFixed(2),
        },
        body: intent,
      });
      delete keys.current[intent];
      toast(`Dalabka ${created.orderNumber} waa la kaydiyey`);
      if (print) setPrinting(await api('admin/orders/' + created.id));
      reset();
      void refreshRiders();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visible = (items || []).filter(
    (i) =>
      (!category || i.categoryId === category) &&
      `${i.name} ${i.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <div className="take-order">
      <section className="take-menu" aria-label="Menu">
        <div className="take-toolbar">
          <div>
            <span className="mono-label">Botan · Delivery</span>
            <h1>Dalab cusub</h1>
          </div>
          <label className="take-search">
            <Search size={16} />
            <input
              placeholder="Raadi cunto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search menu"
            />
          </label>
          <Link className="take-pending" href="/admin/orders">
            Dalabyada
            {pending?.counts?.pending ? <b>{pending.counts.pending}</b> : null}
          </Link>
        </div>
        <div className="pill-row take-categories" role="tablist" aria-label="Qaybaha">
          {[{ id: '', name: 'Dhammaan' }, ...(categories || [])].map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={'pill ' + (category === c.id ? 'active' : '')}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
        {menuError && <Notice error={menuError} />}
        {!items && !menuError && <Loading />}
        <div className="take-grid">
          {visible.map((i) => {
            const inOrder = lines
              .filter((l) => l.menuItemId === i.id)
              .reduce((s, l) => s + l.quantity, 0);
            return (
              <button
                key={i.id}
                className={'take-item ' + (inOrder ? 'in-order' : '')}
                disabled={!i.isAvailable}
                aria-label={'Ku dar ' + i.name}
                onClick={() => (i.modifierGroups?.length ? setPicking(i) : add(i))}
              >
                <span className="take-item-image">
                  <img src={i.imageUrl || '/food-placeholder.svg'} alt="" loading="lazy" />
                  {inOrder > 0 && <span className="take-item-count">{inOrder}</span>}
                  {!i.isAvailable && <span className="take-item-out">Dhammaaday</span>}
                </span>
                <span className="take-item-name">{i.name}</span>
                <span className="take-item-price">{formatMoney(i.basePrice)}</span>
              </button>
            );
          })}
          {items && !visible.length && <p className="muted">Cunto lama helin.</p>}
        </div>
        {lines.length > 0 && (
          <a className="take-jump" href="#take-panel">
            Dalabka · {count} <span>{dollars(totals.total)}</span>
          </a>
        )}
      </section>

      <aside className="take-panel" id="take-panel" aria-label="Dalabka">
        <div className="take-panel-head">
          <h2>
            Dalabka <span className="mono-label">{count} shay</span>
          </h2>
          <button
            type="button"
            className="take-clear"
            disabled={!lines.length}
            onClick={() => setLines([])}
          >
            <X size={14} /> Clear all
          </button>
        </div>
        <div className="take-lines">
          {lines.map((l) => (
            <div className="take-line" key={l.key}>
              <img src={l.imageUrl || '/food-placeholder.svg'} alt="" />
              <span className="take-line-name">
                <b>{l.name}</b>
                <small>
                  {l.modifierNames.length ? l.modifierNames.join(', ') + ' · ' : ''}
                  {dollars(l.unitCents)}
                </small>
              </span>
              <span className="qty">
                <button aria-label={'Dhim ' + l.name} onClick={() => qty(l.key, l.quantity - 1)}>
                  <Minus size={14} />
                </button>
                <span>{l.quantity}</span>
                <button aria-label={'Kordhi ' + l.name} onClick={() => qty(l.key, l.quantity + 1)}>
                  <Plus size={14} />
                </button>
              </span>
              <b className="mono">{dollars(l.unitCents * l.quantity)}</b>
              <button
                className="take-remove"
                aria-label={'Ka saar ' + l.name}
                onClick={() => qty(l.key, 0)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!lines.length && <p className="take-empty">Riix cunto si aad ugu darto dalabka.</p>}
        </div>

        <form
          className="take-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className="take-fields">
            <label className="field">
              Telefoonka macmiilka
              <input
                type="tel"
                required
                inputMode="tel"
                value={form.customerPhone}
                placeholder="61xxxxxxx"
                onChange={(e) => set({ customerPhone: e.target.value })}
                onBlur={(e) => void lookup(e.target.value)}
              />
              {known && (
                <small className="take-known">Macmiil hore · {known.orderCount} dalab</small>
              )}
            </label>
            <label className="field">
              Magaca
              <input
                value={form.customerName}
                maxLength={100}
                onChange={(e) => set({ customerName: e.target.value })}
              />
            </label>
            <label className="field wide">
              Cinwaanka (Delivery address)
              <input
                required
                minLength={2}
                maxLength={400}
                value={form.deliveryAddress}
                placeholder="Tusaale: Bakaaro, agagaarka suuqa"
                onChange={(e) => set({ deliveryAddress: e.target.value })}
              />
            </label>
            <label className="field">
              Xaafadda
              <select
                value={form.zoneId}
                onChange={(e) => {
                  const zone = zones?.find((z) => z.id === e.target.value);
                  set({
                    zoneId: e.target.value,
                    ...(zone ? { deliveryFee: String(Number(zone.deliveryFee)) } : {}),
                  });
                }}
              >
                <option value="">—</option>
                {zones?.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · {formatMoney(z.deliveryFee)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Delivery fee ($)
              <input
                type="number"
                min="0"
                max="1000"
                step="0.01"
                value={form.deliveryFee}
                placeholder="0.00"
                onChange={(e) => set({ deliveryFee: e.target.value })}
              />
            </label>
            <label className="field">
              Darawalka (Delivery man)
              <select value={form.riderId} onChange={(e) => set({ riderId: e.target.value })}>
                <option value="">Pending (dambe)</option>
                {riders?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                    {r.activeOrders ? ` · ${r.activeOrders} jidka` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Discount (%)
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.discountPercent}
                placeholder="0"
                onChange={(e) => set({ discountPercent: e.target.value })}
              />
            </label>
          </div>

          <fieldset className="take-pay">
            <legend>Lacag-bixinta</legend>
            <div className="segmented" role="group" aria-label="Habka lacag-bixinta">
              {PAYMENT_METHODS.map((m) => (
                <button
                  type="button"
                  key={m}
                  aria-pressed={form.paymentMethod === m}
                  className={form.paymentMethod === m ? 'active' : ''}
                  onClick={() => set({ paymentMethod: m })}
                >
                  {paymentMethodLabel[m]}
                </button>
              ))}
            </div>
            {form.paymentMethod !== 'CASH' && (
              <label className="field">
                Payment tell ({paymentMethodLabel[form.paymentMethod]})
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.paymentPhone}
                  placeholder={form.customerPhone || '61xxxxxxx'}
                  onChange={(e) => set({ paymentPhone: e.target.value })}
                />
                <small className="muted">
                  {restaurant?.paymentModes?.[form.paymentMethod] === 'automatic'
                    ? 'Si toos ah ayaa loo xaqiijinayaa.'
                    : 'Manual: hubi lacagta taleefanka, kadib calaamadee “La qaaday”.'}
                </small>
              </label>
            )}
            <div className="segmented" role="group" aria-label="Xaaladda lacagta">
              <button
                type="button"
                aria-pressed={!form.paid}
                className={!form.paid ? 'active' : ''}
                onClick={() => set({ paid: false })}
              >
                Lama qaadin
              </button>
              <button
                type="button"
                aria-pressed={form.paid}
                className={form.paid ? 'active' : ''}
                onClick={() => set({ paid: true })}
              >
                La qaaday
              </button>
            </div>
          </fieldset>

          <label className="field">
            Faallo (Order comment)
            <textarea
              rows={2}
              maxLength={500}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>

          <dl className="take-totals">
            <div>
              <dt>Sub total</dt>
              <dd>{dollars(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery fee</dt>
              <dd>{dollars(totals.fee)}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>{totals.discount ? '−' + dollars(totals.discount) : dollars(0)}</dd>
            </div>
            <div className="take-vat">
              <dt>
                <label>
                  <input
                    type="checkbox"
                    checked={form.withVat}
                    onChange={(e) => set({ withVat: e.target.checked })}
                  />{' '}
                  VAT ({taxRate}%)
                </label>
              </dt>
              <dd>{dollars(totals.tax)}</dd>
            </div>
            <div className="take-total">
              <dt>Total</dt>
              <dd>{dollars(totals.total)}</dd>
            </div>
          </dl>
          {error && <Notice error={error} />}
          <div className="take-actions">
            <button type="button" className="take-cancel" onClick={reset} disabled={busy}>
              Cancel
            </button>
            <button className="take-save" disabled={busy || !lines.length}>
              <Check size={16} /> {busy ? 'Sug…' : 'Save'}
            </button>
            <button
              type="button"
              className="take-save-print"
              disabled={busy || !lines.length}
              onClick={(e) => {
                const f = (e.currentTarget as HTMLButtonElement).form;
                if (f && !f.reportValidity()) return;
                void save(true);
              }}
            >
              <Printer size={16} /> Save &amp; Print
            </button>
          </div>
        </form>
      </aside>

      {picking && (
        <ModifierPicker
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(options) => {
            add(picking, options);
            setPicking(null);
          }}
        />
      )}
      {printing && (
        <PrintOnce order={printing} restaurant={restaurant} done={() => setPrinting(null)} />
      )}
    </div>
  );
}
function ModifierPicker({
  item,
  onClose,
  onAdd,
}: {
  item: any;
  onClose: () => void;
  onAdd: (options: any[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => dialog.current?.showModal(), []);
  const groups = item.modifierGroups.map((g: any) => g.group);
  const problem = groups.find((g: any) => {
    const n = g.options.filter((o: any) => chosen.includes(o.id)).length;
    return n < Math.max(g.minSelect, g.isRequired ? 1 : 0) || n > g.maxSelect;
  });
  return (
    <dialog ref={dialog} className="modal" onCancel={onClose} aria-labelledby="picker-title">
      <div className="modal-heading">
        <h2 id="picker-title">{item.name}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Xir">
          <X size={20} />
        </button>
      </div>
      {groups.map((g: any) => (
        <fieldset className="picker-group" key={g.id}>
          <legend>
            {g.name}{' '}
            <small className="muted">
              {g.isRequired || g.minSelect
                ? `dooro ${Math.max(1, g.minSelect)}–${g.maxSelect}`
                : `ilaa ${g.maxSelect}`}
            </small>
          </legend>
          {g.options.map((o: any) => (
            <label className="check-row" key={o.id}>
              <input
                type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                name={g.id}
                checked={chosen.includes(o.id)}
                onChange={(e) =>
                  setChosen((old) => {
                    const others =
                      g.maxSelect === 1
                        ? old.filter((id) => !g.options.some((x: any) => x.id === id))
                        : old;
                    return e.target.checked
                      ? [...others, o.id]
                      : others.filter((id) => id !== o.id);
                  })
                }
              />
              {o.name}
              {Number(o.priceDelta) > 0 && (
                <span className="muted"> +{formatMoney(o.priceDelta)}</span>
              )}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="modal-footer">
        <button type="button" className="button outline" onClick={onClose}>
          Ka noqo
        </button>
        <button
          className="button"
          disabled={Boolean(problem)}
          onClick={() =>
            onAdd(groups.flatMap((g: any) => g.options.filter((o: any) => chosen.includes(o.id))))
          }
        >
          Ku dar <Plus size={16} />
        </button>
      </div>
    </dialog>
  );
}
