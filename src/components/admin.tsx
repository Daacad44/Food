'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes,
  Settings,
  LogOut,
  ArrowUpRight,
  Plus,
  Search,
  X,
  Check,
  RefreshCw,
  Printer,
  Download,
  Menu as MenuIcon,
  Table2,
  TrendingUp,
} from 'lucide-react';
import { api, useData, useStore } from './store';
import { Brand, Checkout, Loading, Notice, statusLabel } from './customer';
import { formatMoney, transitions } from '@/lib/domain';
const groups: { title: string; items: [href: string, label: string, roles: string[]][] }[] = [
  {
    title: 'GUUD',
    items: [
      ['/admin', 'Dashboard', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
      ['/admin/orders', 'Dalabyada tooska', ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT']],
      ['/admin/reports', 'Warbixinno', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
    ],
  },
  {
    title: 'MAQAAYADDA',
    items: [
      ['/admin/menu', 'Menu', ['OWNER', 'MANAGER']],
      ['/admin/categories', 'Qaybaha', ['OWNER', 'MANAGER']],
      ['/admin/modifiers', 'Modifiers', ['OWNER', 'MANAGER']],
      ['/admin/tables', 'Miisaska', ['OWNER', 'MANAGER', 'CASHIER']],
      ['/admin/coupons', 'Coupons', ['OWNER', 'MANAGER']],
      ['/admin/customers', 'Customers', ['OWNER', 'MANAGER']],
    ],
  },
  {
    title: 'HAWLGALKA',
    items: [
      ['/kitchen', 'Jikada', ['OWNER', 'MANAGER', 'CHEF']],
      ['/pos', 'POS', ['OWNER', 'MANAGER', 'CASHIER']],
      ['/admin/delivery', 'Delivery', ['OWNER', 'MANAGER']],
      ['/admin/delivery/zones', 'Delivery zones', ['OWNER', 'MANAGER']],
      ['/rider', 'Rider portal', ['OWNER', 'MANAGER', 'RIDER']],
      ['/admin/inventory', 'Kaydka', ['OWNER', 'MANAGER']],
      ['/admin/suppliers', 'Suppliers', ['OWNER', 'MANAGER']],
      ['/admin/purchases', 'Iibsiga', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
      ['/admin/staff', 'Shaqaalaha', ['OWNER']],
    ],
  },
  {
    title: 'GANACSIGA',
    items: [
      ['/admin/payments', 'Payments', ['OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER']],
      ['/admin/expenses', 'Expenses', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
      ['/admin/notifications', 'Notifications', ['OWNER', 'MANAGER']],
      ['/admin/reviews', 'Customer reviews', ['OWNER', 'MANAGER']],
      ['/admin/audit', 'Audit trail', ['OWNER', 'MANAGER']],
      ['/admin/settings', 'Settings', ['OWNER', 'MANAGER']],
    ],
  },
];
const timeZone = 'Africa/Mogadishu',
  weekdays = ['Axad', 'Isniin', 'Talaado', 'Arbaco', 'Khamiis', 'Jimco', 'Sabti'],
  weekdayShort = ['Axd', 'Isn', 'Tal', 'Arb', 'Kha', 'Jim', 'Sab'],
  months = ['Jan', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Lul', 'Ago', 'Seb', 'Okt', 'Nof', 'Dis'],
  orderTypes: Record<string, string> = {
    DELIVERY: 'Delivery',
    PICKUP: 'Pickup',
    DINE_IN: 'Dine-in',
  };
// YYYY-MM-DD in restaurant time, matching the day keys from admin/summary.
const localDate = (d: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
const shiftDate = (date: string, days: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};
// Order numbers look like BTN-MVM8Z12H-6B91; floor screens show the short suffix.
const shortNumber = (orderNumber: string) => '#' + orderNumber.split('-').pop();
const clock = (d: Date | string | number) =>
  new Date(d).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' });
function Wordmark() {
  return (
    <span className="wordmark">
      botan<span>.</span>
    </span>
  );
}
function useNow(interval: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
export function StaffShell({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, refreshUser } = useStore(),
    router = useRouter(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (path === '/admin' && user?.role === 'CHEF') router.replace('/kitchen');
    if (path === '/admin' && user?.role === 'RIDER') router.replace('/rider');
    if (path === '/admin' && user?.role === 'CASHIER') router.replace('/pos');
  }, [path, user, router]);
  if (!user || user.kind !== 'staff')
    return (
      <main className="staff-login">
        <Brand />
        <h1>Botan team portal</h1>
        <p>Gal akoonka shaqaalaha si aad u sii wadato.</p>
        <Link className="button" href="/login?staff=1">
          Staff sign in <ArrowUpRight size={17} />
        </Link>
        <Link href="/">← Customer website</Link>
      </main>
    );
  const visible = groups
      .map((g) => ({
        title: g.title,
        items: g.items.filter((i) => i[2].includes(user.role)),
      }))
      .filter((g) => g.items.length),
    title = groups.flatMap((g) => g.items).find((i) => i[0] === path)?.[1] || 'Botan workspace';
  return (
    <div className="staff-app">
      <aside className={'sidebar ' + (open ? 'is-open' : '')}>
        <Link href="/admin" className="sidebar-brand" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>
        <nav>
          {visible.map((g) => (
            <div className="nav-section" key={g.title}>
              <div className="nav-group">{g.title}</div>
              {g.items.map(([href, label]) => (
                <Link
                  key={href}
                  className={path === href ? 'active' : ''}
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            Customer website <ArrowUpRight size={14} />
          </Link>
          <div className="staff-profile">
            <div className="staff-avatar">{user.name.slice(0, 1)}</div>
            <div>
              <b>{user.name}</b>
              <small>{user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api('auth/logout', { method: 'POST', body: '{}' });
                await refreshUser();
                router.push('/login?staff=1');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div
        className={
          'staff-main ' +
          (path.startsWith('/kitchen') ? 'is-dark' : path === '/pos' ? 'is-flush' : '')
        }
      >
        <header className="staff-header">
          <button
            className="icon-button mobile-nav"
            aria-label="Open staff menu"
            onClick={() => setOpen(!open)}
          >
            <MenuIcon />
          </button>
          <b>{title}</b>
          <span className="staff-avatar small-avatar">{user.name[0]}</span>
        </header>
        <main className="staff-content">{children}</main>
      </div>
    </div>
  );
}
export function PageTitle({
  eyebrow = 'BOTAN WORKSPACE',
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
const liveStatus: Record<string, [string, string]> = {
  PENDING_APPROVAL: ['Cusub', 'new'],
  CONFIRMED: ['Cusub', 'new'],
  PREPARING: ['Diyaarin', 'preparing'],
  READY: ['Diyaar', 'ready'],
  OUT_FOR_DELIVERY: ['Jidka', 'road'],
};
export function Dashboard() {
  const { data, error } = useData('admin/summary', 15000),
    { data: orders } = useData<any[]>('admin/orders?limit=5', 10000),
    { user } = useStore();
  const today = localDate(),
    now = shiftDate(today, 0),
    amounts = new Map<string, number>((data?.days || []).map((d: any) => [d.date, d.amount])),
    week = Array.from({ length: 7 }, (_, n) => {
      const d = shiftDate(today, n - 6),
        date = d.toISOString().slice(0, 10);
      return { date, day: weekdayShort[d.getUTCDay()], amount: amounts.get(date) || 0 };
    }),
    peak = Math.max(1, ...week.map((d) => d.amount)),
    todaySales = week[6].amount,
    lastWeek = amounts.get(shiftDate(today, -7).toISOString().slice(0, 10)),
    change = lastWeek ? Math.round(((todaySales - lastWeek) / Math.abs(lastWeek)) * 100) : null;
  const kpis: [string, string, string, string][] = [
    [
      'Iibka maanta',
      data ? formatMoney(todaySales) : '—',
      change === null
        ? 'CASH · USD'
        : `${change >= 0 ? '+' : '−'}${Math.abs(change)}% vs. ${weekdays[now.getUTCDay()]} hore`,
      change !== null && change >= 0 ? 'up' : '',
    ],
    ['Dalabyo', data ? String(data.orderCount) : '—', 'Dhammaan', ''],
    ['Socda', data ? String(data.activeOrders) : '—', 'Hadda', data?.activeOrders ? 'hot' : ''],
    ['Celcelis', data ? formatMoney(data.averageOrder) : '—', 'Dalab kasta', ''],
  ];
  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <span className="mono-label">
            {weekdays[now.getUTCDay()]} {now.getUTCDate()} {months[now.getUTCMonth()]} · Muqdisho
          </span>
          <h1>Soo dhowow, {user?.name.split(' ')[0] || 'Botan'}.</h1>
        </div>
        <Link href="/pos" className="pill-button">
          + Dalab cusub
        </Link>
      </div>
      {error && <Notice error={error} />}
      <div className="kpi-row">
        {kpis.map(([label, value, note, tone]) => (
          <div className="kpi" key={label}>
            <span className="mono-label">{label}</span>
            <strong>{value}</strong>
            <small className={tone}>{note}</small>
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <section className="revenue-card">
          <div className="card-head">
            <h2>Dakhliga · 7 maalmood</h2>
            <span className="mono-label">Cash · USD</span>
          </div>
          <div className="revenue-bars">
            {week.map((d, n) => (
              <div key={d.date}>
                <span>${Math.round(d.amount)}</span>
                <span className="bar-track">
                  <i
                    className={n === 6 ? 'today' : ''}
                    style={{ height: `${(Math.max(0, d.amount) / peak) * 100}%` }}
                  />
                </span>
                <span>{d.day}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="live-card">
          <div className="card-head">
            <h2>Dalabyada tooska ah</h2>
            <Link href="/admin/orders">Dhammaan ↗</Link>
          </div>
          {orders?.map((o) => {
            const [label, tone] = liveStatus[o.status] || [statusLabel[o.status] || o.status, ''];
            return (
              <Link className="live-row" href={'/admin/orders/' + o.id} key={o.id}>
                <span className="mono" title={o.orderNumber}>
                  {shortNumber(o.orderNumber)}
                </span>
                <div>
                  <b>{o.table ? `Miis ${o.table.tableNumber}` : o.guestName}</b>
                  <small>
                    {orderTypes[o.type] || o.type} · {formatMoney(o.total)}
                    {o.channel === 'WHATSAPP' && ' · WhatsApp'}
                  </small>
                </div>
                <span className={'status-pill ' + tone}>{label}</span>
              </Link>
            );
          })}
          {orders && !orders.length && <p className="muted">Dalabyo weli ma jiraan.</p>}
        </section>
      </div>
    </div>
  );
}
function RevenueChart({ days }: { days: any[] }) {
  const recent = days.slice(-12),
    max = Math.max(1, ...recent.map((d) => Math.abs(d.amount)));
  return recent.length ? (
    <div className="chart">
      <div className="chart-axis">
        <span>{formatMoney(max)}</span>
        <span>{formatMoney(max / 2)}</span>
        <span>$0</span>
      </div>
      <div className="chart-bars">
        {recent.map((d) => (
          <div className="chart-column" key={d.date}>
            <b>{formatMoney(d.amount)}</b>
            <div
              style={{ height: `${Math.max(3, (Math.abs(d.amount) / max) * 150)}px` }}
              className={d.amount < 0 ? 'negative' : ''}
            />
            <small>{d.date.slice(5)}</small>
          </div>
        ))}
      </div>
    </div>
  ) : (
    <div className="empty chart-empty">
      <TrendingUp size={34} />
      <h3>Ready for a good first day.</h3>
      <p>Revenue appears after a payment is collected.</p>
    </div>
  );
}
export function OrdersTable({ orders }: { orders: any[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Status</th>
            <th>Total</th>
            <th>Payment</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <b>{o.orderNumber}</b>
                <small>
                  {new Date(o.createdAt).toLocaleString('en-GB', {
                    timeZone: 'Africa/Mogadishu',
                    hour: '2-digit',
                    minute: '2-digit',
                    day: '2-digit',
                    month: 'short',
                  })}
                </small>
              </td>
              <td>{o.guestName}</td>
              <td>{o.type.replace('_', ' ')}</td>
              <td>
                <span className={'badge ' + o.status}>{o.status.replaceAll('_', ' ')}</span>
              </td>
              <td>
                <b>{formatMoney(o.total)}</b>
              </td>
              <td>
                <span className={'payment-status ' + o.paymentStatus}>{o.paymentStatus}</span>
              </td>
              <td>
                <Link
                  href={'/admin/orders/' + o.id}
                  className="icon-button"
                  aria-label={'Open ' + o.orderNumber}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <div className="empty compact">No orders yet.</div>}
    </div>
  );
}
export function OrdersPage({ id }: { id?: string }) {
  const { data, error, refresh } = useData(id ? 'admin/orders/' + id : 'admin/orders', 8000),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    { toast } = useStore();
  return (
    <>
      <PageTitle
        title={id ? data?.orderNumber || 'Order details' : 'Live orders'}
        description="One source of truth, from checkout to the kitchen."
        action={
          <button className="button outline" onClick={() => void refresh()}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />
      {error && <Notice error={error} />} {!data && !error && <Loading />}
      {id && data ? (
        <OrderDetail order={data} refresh={refresh} />
      ) : (
        <div className="panel">
          <div className="panel-heading">
            <div className="tabs">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                All orders
              </button>
              <button
                className={filter === 'active' ? 'active' : ''}
                onClick={() => setFilter('active')}
              >
                In progress
              </button>
              <button
                className={filter === 'COMPLETED' ? 'active' : ''}
                onClick={() => setFilter('COMPLETED')}
              >
                Completed
              </button>
            </div>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Search orders"
                placeholder="Search order or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <OrdersTable
            orders={(data || []).filter(
              (o: any) =>
                (filter === 'all' ||
                  (filter === 'active' &&
                    !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)) ||
                  o.status === filter) &&
                `${o.orderNumber} ${o.guestName}`.toLowerCase().includes(search.toLowerCase()),
            )}
          />
        </div>
      )}
    </>
  );
}
function OrderDetail({ order, refresh }: { order: any; refresh: () => Promise<void> }) {
  const refundKeys = useRef<Record<string, string>>({});
  const refundPending = useRef(false);
  const { toast, user } = useStore(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const act = async (path: string, method: string, data: unknown) => {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, body: JSON.stringify(data) });
      await refresh();
      toast('Order updated');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="two-columns order-details">
      <div className="panel">
        <div className="panel-heading">
          <h2>Order items</h2>
          <span className={'badge ' + order.status}>{order.status.replaceAll('_', ' ')}</span>
        </div>
        {order.items.map((i: any) => (
          <div className="order-item" key={i.id}>
            <span className="item-count">{i.quantity}×</span>
            <div>
              <h3>{i.nameSnapshot}</h3>
              <small>{i.modifiers.map((m: any) => m.nameSnapshot).join(', ')}</small>
              {i.specialInstructions && <p className="note">{i.specialInstructions}</p>}
            </div>
            <b>{formatMoney(i.lineTotal)}</b>
          </div>
        ))}
        {[
          ['Subtotal', order.subtotal],
          ['Discount', -Number(order.discountAmount)],
          ['Tax', order.taxAmount],
          ['Delivery', order.deliveryFee],
          ['Total', order.total],
        ].map(([label, value]) => (
          <div className={'summary-row ' + (label === 'Total' ? 'total' : '')} key={label}>
            <span>{label}</span>
            <b>{formatMoney(value)}</b>
          </div>
        ))}
        <div className="receipt-actions">
          <button className="button outline" onClick={() => window.print()}>
            <Printer size={16} /> Print receipt
          </button>
        </div>
        <h3>Order history</h3>
        <div className="timeline">
          {order.statusEvents.map((e: any) => (
            <div key={e.id}>
              <span>
                <Check size={12} />
              </span>
              <div>
                <b>{e.toStatus.replaceAll('_', ' ')}</b>
                <small>{new Date(e.createdAt).toLocaleString()}</small>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="panel padded">
          <h2>Customer details</h2>
          <p>
            <b>{order.guestName}</b>
            {order.channel === 'WHATSAPP' && <span className="badge"> WhatsApp</span>}
          </p>
          <p>{order.guestPhone}</p>
          <p>
            {order.type} {order.table && `· Table ${order.table.tableNumber}`}
          </p>
          {order.deliveryAddress && <p>{order.deliveryAddress}</p>}
          {order.notes && <p className="note">{order.notes}</p>}
          <h3>Next step</h3>
          {error && <Notice error={error} />}
          <div className="action-stack">
            {(transitions[order.status] || [])
              .filter(
                (s) =>
                  !(order.type !== 'DELIVERY' && s === 'OUT_FOR_DELIVERY') &&
                  !(order.type === 'DELIVERY' && order.status === 'READY' && s === 'COMPLETED'),
              )
              .map((status) => (
                <button
                  disabled={busy || user.role === 'ACCOUNTANT'}
                  className={
                    'button ' + (['CANCELLED', 'REJECTED'].includes(status) ? 'outline danger' : '')
                  }
                  key={status}
                  onClick={() =>
                    void act('admin/orders/' + order.id + '/status', 'PATCH', { status })
                  }
                >
                  {statusLabel[status] || status.replaceAll('_', ' ')} <ArrowRightIcon />
                </button>
              ))}
          </div>
        </div>
        <div className="panel padded">
          <h2>Payments</h2>
          {order.payments.map((p: any) => (
            <div key={p.id}>
              <div className="summary-row">
                <b>{formatMoney(p.amount)}</b>
                <span className="badge">{p.status}</span>
              </div>
              <p className="muted">{p.method} · Cash is marked paid only after collection.</p>
              {['PENDING', 'UNPAID'].includes(p.status) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act('payments/' + p.id + '/capture', 'POST', {
                      amount: Number(f.get('cashAmount')),
                    });
                  }}
                >
                  <label className="field">
                    Cash received (split payments supported)
                    <input
                      name="cashAmount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={p.amount}
                      defaultValue={p.amount}
                      required
                    />
                  </label>
                  <button disabled={busy || user.role === 'ACCOUNTANT'} className="button full">
                    Confirm cash collected
                  </button>
                </form>
              )}
              {['PAID', 'PARTIALLY_REFUNDED'].includes(p.status) &&
                ['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(user.role) && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (refundPending.current) return;
                      refundPending.current = true;
                      const f = new FormData(e.currentTarget);
                      const intent = p.id + ':' + f.get('amount') + ':' + f.get('reason');
                      refundKeys.current[intent] ||= crypto.randomUUID();
                      try {
                        await api('payments/' + p.id + '/refund', {
                          method: 'POST',
                          headers: { 'Idempotency-Key': refundKeys.current[intent] },
                          body: JSON.stringify({
                            amount: Number(f.get('amount')),
                            reason: f.get('reason'),
                          }),
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        refundPending.current = false;
                      }
                    }}
                  >
                    <label className="field">
                      Refund amount
                      <input
                        type="number"
                        name="amount"
                        min="0.01"
                        step="0.01"
                        max={p.amount}
                        required
                      />
                    </label>
                    <label className="field">
                      Reason
                      <input name="reason" minLength={3} required />
                    </label>
                    <button className="button outline full">Record cash refund</button>
                  </form>
                )}
              {p.refunds.map((r: any) => (
                <p className="muted" key={r.id}>
                  Refund {formatMoney(r.amount)} · {r.reason}
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={16} />;
}
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  default?: any;
  relation?: string;
  min?: number;
};
export const resourceConfig: Record<
  string,
  { title: string; description: string; fields: Field[]; columns: string[] }
> = {
  menu: {
    title: 'The menu',
    description: 'Fresh dishes, thoughtful details. Keep your menu looking its best.',
    fields: [
      { name: 'name', label: 'Dish name', required: true },
      { name: 'slug', label: 'URL slug', required: true },
      { name: 'categoryId', label: 'Category', relation: 'categories', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'basePrice', label: 'Price (USD)', type: 'number', required: true, min: 0 },
      { name: 'imageUrl', label: 'Image path or HTTPS URL' },
      {
        name: 'preparationMinutes',
        label: 'Prep time (minutes)',
        type: 'number',
        default: 20,
        min: 1,
      },
      { name: 'isAvailable', label: 'Available to order', type: 'checkbox', default: true },
      { name: 'isFeatured', label: 'Featured on homepage', type: 'checkbox', default: false },
    ],
    columns: ['name', 'category', 'basePrice', 'isAvailable'],
  },
  categories: {
    title: 'Menu categories',
    description: 'A place for every craving.',
    fields: [
      { name: 'name', label: 'Category name', required: true },
      { name: 'slug', label: 'URL slug', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'sortOrder', label: 'Display order', type: 'number', default: 0 },
      { name: 'isActive', label: 'Active', type: 'checkbox', default: true },
    ],
    columns: ['name', 'slug', 'sortOrder', 'isActive'],
  },
  modifiers: {
    title: 'Make it their own',
    description: 'Modifier groups, options and dish assignments.',
    fields: [
      { name: 'name', label: 'Group name', required: true },
      { name: 'minSelect', label: 'Minimum choices', type: 'number', default: 0, min: 0 },
      { name: 'maxSelect', label: 'Maximum choices', type: 'number', default: 2, min: 1 },
      { name: 'isRequired', label: 'Required group', type: 'checkbox', default: false },
    ],
    columns: ['name', 'minSelect', 'maxSelect', 'isRequired'],
  },
  zones: {
    title: 'Delivery neighbourhoods',
    description: 'Set delivery fees and estimates for every area.',
    fields: [
      { name: 'name', label: 'Neighbourhood', required: true },
      { name: 'deliveryFee', label: 'Delivery fee (USD)', type: 'number', min: 0, required: true },
      { name: 'minimumOrder', label: 'Minimum order', type: 'number', default: 0, min: 0 },
      { name: 'etaMinutes', label: 'Estimated minutes', type: 'number', default: 30, min: 1 },
      { name: 'isActive', label: 'Active', type: 'checkbox', default: true },
    ],
    columns: ['name', 'deliveryFee', 'minimumOrder', 'etaMinutes', 'isActive'],
  },
  tables: {
    title: 'A seat for everyone',
    description: 'Manage your dining room.',
    fields: [
      { name: 'tableNumber', label: 'Table number', required: true },
      { name: 'capacity', label: 'Seats', type: 'number', min: 1, default: 4 },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'DISABLED'],
        default: 'AVAILABLE',
      },
    ],
    columns: ['tableNumber', 'capacity', 'status'],
  },
  inventory: {
    title: 'The pantry',
    description: 'Track ingredients, stock levels and recipe consumption.',
    fields: [
      { name: 'name', label: 'Ingredient name', required: true },
      { name: 'sku', label: 'SKU' },
      {
        name: 'unit',
        label: 'Unit',
        type: 'select',
        options: ['PIECE', 'GRAM', 'KILOGRAM', 'MILLILITER', 'LITER'],
        default: 'PIECE',
      },
      { name: 'reorderLevel', label: 'Low stock threshold', type: 'number', default: 0, min: 0 },
      { name: 'averageUnitCost', label: 'Average unit cost', type: 'number', default: 0, min: 0 },
      { name: 'isActive', label: 'Active', type: 'checkbox', default: true },
    ],
    columns: ['name', 'unit', 'quantityOnHand', 'reorderLevel', 'averageUnitCost'],
  },
  suppliers: {
    title: 'Good ingredients. Good partners.',
    description: 'Keep your suppliers close.',
    fields: [
      { name: 'name', label: 'Supplier name', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'address', label: 'Address', type: 'textarea' },
    ],
    columns: ['name', 'phone', 'email', 'address'],
  },
  coupons: {
    title: 'A little treat',
    description: 'Create offers that bring people back.',
    fields: [
      { name: 'code', label: 'Coupon code (uppercase)', required: true },
      {
        name: 'type',
        label: 'Discount type',
        type: 'select',
        options: ['PERCENTAGE', 'FIXED'],
        default: 'PERCENTAGE',
      },
      { name: 'value', label: 'Value', type: 'number', min: 0, required: true },
      { name: 'minSpend', label: 'Minimum spend', type: 'number', default: 0, min: 0 },
      { name: 'maxDiscount', label: 'Maximum discount (optional)', type: 'number', min: 0 },
      { name: 'usageLimit', label: 'Usage limit (optional)', type: 'number', min: 1 },
      { name: 'startsAt', label: 'Starts at', type: 'datetime-local' },
      { name: 'endsAt', label: 'Ends at', type: 'datetime-local' },
      { name: 'isActive', label: 'Active', type: 'checkbox', default: true },
    ],
    columns: ['code', 'type', 'value', 'usedCount', 'usageLimit', 'isActive'],
  },
  expenses: {
    title: 'Every dollar, accounted for',
    description: 'Record the costs of running a good kitchen.',
    fields: [
      {
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['RENT', 'UTILITIES', 'SALARY', 'MAINTENANCE', 'MARKETING', 'TRANSPORT', 'OTHER'],
        default: 'OTHER',
      },
      { name: 'description', label: 'Description', required: true },
      { name: 'amount', label: 'Amount (USD)', type: 'number', min: 0.01, required: true },
      { name: 'incurredAt', label: 'Date', type: 'datetime-local', required: true },
    ],
    columns: ['description', 'category', 'amount', 'incurredAt'],
  },
  staff: {
    title: 'The people behind Botan',
    description: 'Role-based access. Individual accounts. A team you trust.',
    fields: [
      { name: 'fullName', label: 'Full name', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone' },
      { name: 'password', label: 'New password (12+ characters)', type: 'password' },
      {
        name: 'role',
        label: 'Role',
        type: 'select',
        options: ['OWNER', 'MANAGER', 'CASHIER', 'CHEF', 'RIDER', 'ACCOUNTANT'],
        default: 'CHEF',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['ACTIVE', 'SUSPENDED'],
        default: 'ACTIVE',
      },
    ],
    columns: ['fullName', 'email', 'role', 'status'],
  },
};
function display(value: any, key = '') {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean')
    return (
      <span className={'badge ' + (value ? 'CONFIRMED' : 'CANCELLED')}>
        {value ? 'Active' : 'Inactive'}
      </span>
    );
  if (typeof value === 'object') return value.name || value.fullName || JSON.stringify(value);
  if (/Price|Fee|Cost|amount/.test(key)) return formatMoney(value);
  if (key.endsWith('At')) return new Date(value).toLocaleDateString();
  if (['status', 'role'].includes(key))
    return <span className={'badge ' + value}>{String(value).replaceAll('_', ' ')}</span>;
  return String(value);
}
export function DataTable({
  rows,
  columns,
  actions,
}: {
  rows: any[];
  columns: string[];
  actions?: (row: any) => React.ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}</th>
            ))}
            {actions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, n) => (
            <tr key={row.id || n}>
              {columns.map((c) => (
                <td key={c}>{display(row[c], c)}</td>
              ))}
              {actions && (
                <td>
                  <div className="row-actions">{actions(row)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="empty compact">
          <Boxes size={28} />
          <p>Nothing here yet. Add your first record.</p>
        </div>
      )}
    </div>
  );
}
export function ResourcePage({ resource }: { resource: string }) {
  const config = resourceConfig[resource],
    { user, toast } = useStore(),
    { data, error, refresh } = useData<any[]>('admin/resources/' + resource),
    [editing, setEditing] = useState<any>(undefined),
    [search, setSearch] = useState('');
  return (
    <>
      <PageTitle
        title={config.title}
        description={config.description}
        action={
          <button className="button" onClick={() => setEditing(null)}>
            <Plus size={17} /> Add{' '}
            {resource === 'menu' ? 'dish' : resource === 'staff' ? 'team member' : 'new'}
          </button>
        }
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <div className="panel-heading">
          <span className="muted">{data?.length || 0} records</span>
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="Search…"
              aria-label="Search records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <DataTable
          rows={(data || []).filter((row) =>
            JSON.stringify(row).toLowerCase().includes(search.toLowerCase()),
          )}
          columns={config.columns}
          actions={(row) => (
            <>
              <button className="small-button" onClick={() => setEditing(row)}>
                Edit
              </button>
              {resource !== 'staff' && (
                <button
                  className="small-button danger"
                  onClick={async () => {
                    if (
                      !window.confirm('Delete this record? Related records may prevent deletion.')
                    )
                      return;
                    try {
                      await api(`admin/resources/${resource}/${row.id}`, {
                        method: 'DELETE',
                        body: '{}',
                      });
                      await refresh();
                      toast('Record deleted');
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Delete
                </button>
              )}
            </>
          )}
        />
      </div>
      {['inventory', 'menu', 'modifiers'].includes(resource) && (
        <ResourceExtras resource={resource} refresh={refresh} />
      )}{' '}
      {editing !== undefined && (
        <EditModal
          title={editing ? 'Edit record' : 'Add record'}
          fields={config.fields}
          initial={editing}
          endpoint={'admin/resources/' + resource + (editing ? '/' + editing.id : '')}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await refresh();
          }}
        />
      )}
    </>
  );
}
export function EditModal({
  title,
  fields,
  initial,
  endpoint,
  onClose,
  onSaved,
  method,
}: {
  title: string;
  fields: Field[];
  initial: any;
  endpoint: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  method?: string;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    { toast } = useStore();
  const { data: categories } = useData<any[]>(
      fields.some((f) => f.relation === 'categories') ? 'admin/resources/categories' : null,
    ),
    { data: inventory } = useData<any[]>(
      fields.some((f) => f.relation === 'inventory') ? 'admin/resources/inventory' : null,
    ),
    { data: menu } = useData<any[]>(
      fields.some((f) => f.relation === 'menu') ? 'admin/resources/menu' : null,
    ),
    { data: modifiers } = useData<any[]>(
      fields.some((f) => f.relation === 'modifiers') ? 'admin/resources/modifiers' : null,
    ),
    { data: suppliers } = useData<any[]>(
      fields.some((f) => f.relation === 'suppliers') ? 'admin/resources/suppliers' : null,
    );
  const relations: Record<string, any[]> = {
    categories: categories || [],
    inventory: inventory || [],
    menu: menu || [],
    modifiers: modifiers || [],
    suppliers: suppliers || [],
  };
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget),
      data: Record<string, any> = {};
    for (const field of fields) {
      const val = form.get(field.name);
      if (field.type === 'checkbox') data[field.name] = val === 'on';
      else if (val !== null && val !== '') {
        data[field.name] =
          field.type === 'number'
            ? Number(val)
            : field.type === 'datetime-local'
              ? new Date(String(val)).toISOString()
              : val;
      } else if (field.name === 'password') continue;
      else if (field.type === 'number' || field.type === 'datetime-local') data[field.name] = null;
      else if (field.required) data[field.name] = '';
    }
    try {
      await api(endpoint, {
        method: method || (initial ? 'PATCH' : 'POST'),
        body: JSON.stringify(data),
      });
      toast('Saved successfully');
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog ref={dialog} className="modal" onCancel={onClose} aria-labelledby="modal-title">
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          {fields.map((field) => {
            let value = initial?.[field.name] ?? field.default ?? '';
            if (field.type === 'datetime-local' && value)
              value = new Date(
                new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16);
            return (
              <label
                key={field.name}
                className={'field ' + (field.type === 'textarea' ? 'span-two' : '')}
              >
                {field.type === 'checkbox' ? (
                  <span className="check-row">
                    <input type="checkbox" name={field.name} defaultChecked={!!value} />
                    {field.label}
                  </span>
                ) : (
                  <>
                    {field.label}
                    {field.type === 'textarea' ? (
                      <textarea
                        aria-label={field.label}
                        name={field.name}
                        defaultValue={value}
                        maxLength={500}
                      />
                    ) : field.relation || field.type === 'select' ? (
                      <select
                        aria-label={field.label}
                        key={field.name + (field.relation ? relations[field.relation].length : 0)}
                        name={field.name}
                        defaultValue={value}
                        required={field.required}
                      >
                        <option value="">Choose…</option>
                        {field.relation
                          ? relations[field.relation].map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.name}
                              </option>
                            ))
                          : field.options?.map((o) => (
                              <option value={o} key={o}>
                                {o}
                              </option>
                            ))}
                      </select>
                    ) : (
                      <input
                        aria-label={field.label}
                        name={field.name}
                        type={field.type || 'text'}
                        defaultValue={value}
                        required={field.required}
                        min={field.min}
                        minLength={field.type === 'password' ? 12 : undefined}
                        maxLength={field.type === 'password' ? 72 : 500}
                        step={field.type === 'number' ? '0.001' : undefined}
                      />
                    )}
                  </>
                )}
              </label>
            );
          })}
        </div>
        {error && <Notice error={error} />}
        <div className="modal-footer">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'} <Check size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
function ResourceExtras({ resource, refresh }: { resource: string; refresh: () => Promise<void> }) {
  const [action, setAction] = useState('');
  const actions: Record<string, { label: string; endpoint: string; fields: Field[] }[]> = {
    inventory: [
      {
        label: 'Record stock movement',
        endpoint: 'admin/inventory/movements',
        fields: [
          { name: 'inventoryItemId', label: 'Ingredient', relation: 'inventory', required: true },
          {
            name: 'type',
            label: 'Movement',
            type: 'select',
            options: ['PURCHASE', 'WASTE', 'ADJUSTMENT', 'RETURN'],
            default: 'ADJUSTMENT',
          },
          {
            name: 'quantityDelta',
            label: 'Quantity change (negative to reduce)',
            type: 'number',
            required: true,
          },
          { name: 'notes', label: 'Reason', required: true },
        ],
      },
    ],
    menu: [
      {
        label: 'Set recipe ingredient',
        endpoint: 'admin/recipes',
        fields: [
          { name: 'menuItemId', label: 'Dish', relation: 'menu', required: true },
          { name: 'inventoryItemId', label: 'Ingredient', relation: 'inventory', required: true },
          {
            name: 'quantity',
            label: 'Quantity per serving',
            type: 'number',
            required: true,
            min: 0.001,
          },
        ],
      },
      {
        label: 'Assign modifier group',
        endpoint: 'admin/menu-modifiers',
        fields: [
          { name: 'menuItemId', label: 'Dish', relation: 'menu', required: true },
          { name: 'groupId', label: 'Modifier group', relation: 'modifiers', required: true },
        ],
      },
    ],
    modifiers: [
      {
        label: 'Add modifier option',
        endpoint: 'admin/modifier-options',
        fields: [
          { name: 'groupId', label: 'Group', relation: 'modifiers', required: true },
          { name: 'name', label: 'Option name', required: true },
          { name: 'priceDelta', label: 'Extra price', type: 'number', required: true, min: 0 },
          { name: 'isAvailable', label: 'Available', type: 'checkbox', default: true },
        ],
      },
    ],
  };
  const selected = actions[resource].find((a) => a.endpoint === action);
  return (
    <div className="panel padded">
      <h2>{resource === 'inventory' ? 'Stock ledger' : 'Connections & options'}</h2>
      <p className="muted">
        {resource === 'inventory'
          ? 'Stock is deducted once when an order is confirmed. Cancellations restore it through the ledger.'
          : 'Connect dishes to recipes and customisations.'}
      </p>
      <div className="row-actions">
        {actions[resource].map((a) => (
          <button className="button outline" key={a.endpoint} onClick={() => setAction(a.endpoint)}>
            <Plus size={15} />
            {a.label}
          </button>
        ))}
      </div>
      {resource === 'inventory' && <Ledger />}
      {resource === 'modifiers' && <ModifierList />}
      {resource === 'menu' && <RecipeList />}
      {selected && (
        <EditModal
          title={selected.label}
          fields={selected.fields}
          initial={null}
          endpoint={selected.endpoint}
          onClose={() => setAction('')}
          onSaved={async () => {
            setAction('');
            await refresh();
          }}
        />
      )}
    </div>
  );
}
function Ledger() {
  const { data } = useData<any[]>('admin/inventory/movements', 10000);
  return (
    <DataTable
      rows={(data || []).map((r) => ({ ...r, ingredient: r.item.name }))}
      columns={['ingredient', 'type', 'quantityDelta', 'notes', 'createdAt']}
    />
  );
}
function ModifierList() {
  const { data } = useData<any[]>('admin/resources/modifiers', 8000);
  return (
    <>
      {data?.map((g) => (
        <div className="connection-row" key={g.id}>
          <b>{g.name}</b>
          <span>
            {g.options.map((o: any) => `${o.name} (+${formatMoney(o.priceDelta)})`).join(' · ') ||
              'No options yet'}
          </span>
        </div>
      ))}
    </>
  );
}
function RecipeList() {
  const { data } = useData<any[]>('admin/resources/menu', 8000);
  return (
    <>
      {data
        ?.filter((m) => m.recipes.length)
        .map((m) => (
          <div className="connection-row" key={m.id}>
            <b>{m.name}</b>
            <span>
              {m.recipes
                .map((r: any) => `${r.quantity} ${r.inventoryItem.unit} ${r.inventoryItem.name}`)
                .join(' · ')}
            </span>
          </div>
        ))}
    </>
  );
}
const kitchenColumns = {
  live: [
    ['CONFIRMED', 'Cusub', 'new'],
    ['PREPARING', 'Diyaarin', 'preparing'],
    ['READY', 'Diyaar', 'ready'],
  ],
  history: [['COMPLETED', 'La dhammeeyey', 'done']],
} as const;
const elapsed = (from: string, now: number) => {
  const seconds = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
export function Kitchen() {
  const { data, error, refresh } = useData<any[]>('kitchen/orders', 4000),
    { toast } = useStore(),
    [tab, setTab] = useState<'live' | 'history'>('live'),
    [sound, setSound] = useState(false),
    known = useRef<Set<string>>(new Set()),
    now = useNow(1000);
  useEffect(() => {
    if (!data) return;
    const added = data.some((o) => !known.current.has(o.id) && o.status === 'CONFIRMED');
    if (known.current.size && added && sound) {
      const ctx = new AudioContext(),
        osc = ctx.createOscillator();
      osc.connect(ctx.destination);
      osc.frequency.value = 700;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
      osc.onended = () => void ctx.close();
    }
    known.current = new Set(data.map((o) => o.id));
  }, [data, sound]);
  async function move(o: any, status: string) {
    try {
      await api('kitchen/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <div className="kds">
      <div className="kds-bar">
        <div>
          <Wordmark />
          <h1 className="mono-label">Jikada · {clock(now)}</h1>
        </div>
        <div>
          <button className="ghost-pill" aria-pressed={sound} onClick={() => setSound(!sound)}>
            {sound ? '🔈 Codka: daaran' : '🔇 Codka: demsan'}
          </button>
          <button
            className="ghost-pill"
            aria-pressed={tab === 'history'}
            onClick={() => setTab(tab === 'live' ? 'history' : 'live')}
          >
            {tab === 'live' ? 'Taariikh' : '← Tooska'}
          </button>
          <span className={'connection ' + (error ? 'offline' : '')}>
            <i /> {error ? 'Xiriir la’aan' : 'Ku xiran'}
          </span>
        </div>
      </div>
      <div className={'kds-board ' + tab}>
        {kitchenColumns[tab].map(([status, title, tone]) => {
          const tickets = data?.filter((o) => o.status === status) || [];
          return (
            <section className={'kds-column ' + tone} key={status}>
              <h2>
                {title} <span>{tickets.length}</span>
              </h2>
              <div className="kds-tickets">
                {tickets.map((o) => (
                  <article className={'kds-ticket ' + tone} key={o.id}>
                    <div className="kds-ticket-head">
                      <b title={o.orderNumber}>{shortNumber(o.orderNumber)}</b>
                      <span>
                        {status === 'COMPLETED' ? clock(o.createdAt) : elapsed(o.createdAt, now)}
                      </span>
                    </div>
                    <span className="kds-ticket-type">
                      {o.table ? `Miis ${o.table.tableNumber}` : orderTypes[o.type] || o.type} ·{' '}
                      {clock(o.createdAt)}
                    </span>
                    <ul>
                      {o.items.map((i: any) => (
                        <li key={i.id}>
                          {i.quantity}× {i.nameSnapshot}
                          {i.modifiers?.length > 0 && (
                            <small>{i.modifiers.map((m: any) => m.nameSnapshot).join(', ')}</small>
                          )}
                          {i.specialInstructions && (
                            <p className="kds-note">“{i.specialInstructions}”</p>
                          )}
                        </li>
                      ))}
                    </ul>
                    {o.notes && <p className="kds-note">“{o.notes}”</p>}
                    {status === 'CONFIRMED' && (
                      <button onClick={() => void move(o, 'PREPARING')}>Bilow diyaarinta</button>
                    )}
                    {status === 'PREPARING' && (
                      <button onClick={() => void move(o, 'READY')}>Diyaar</button>
                    )}
                    {status === 'READY' && <span className="kds-waiting">Sugaya qaadis</span>}
                  </article>
                ))}
                {data && !tickets.length && <p className="kds-empty">Ticket ma jiro.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
const posSections = [
  ['/pos', 'Terminal', 'terminal'],
  ['/pos/tables', 'Miisaska', 'tables'],
  ['/pos/bills', 'Active bills', 'bills'],
  ['/pos/payments', 'Payments', 'payments'],
  ['/pos/shifts', 'Shifts', 'shifts'],
] as const;
export function Pos({ section }: { section: string }) {
  const { data: items, error } = useData<any[]>(section === 'terminal' ? 'menu/items' : null),
    { data: tables } = useData<any[]>(section === 'tables' ? 'pos/tables' : null),
    { data: orders } = useData<any[]>(section === 'bills' ? 'pos/orders' : null),
    { data: shifts } = useData<any[]>(section === 'terminal' ? 'pos/shifts' : null),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [type, setType] = useState('DINE_IN'),
    [checkout, setCheckout] = useState(false),
    { cart, add, quantity, clear, user } = useStore();
  const sections = (
    <nav className="pos-sections">
      {posSections.map(([href, label, key]) => (
        <Link key={href} href={href} className={section === key ? 'active' : ''}>
          {label}
        </Link>
      ))}
    </nav>
  );
  if (section !== 'terminal')
    return (
      <>
        {sections}
        {section === 'tables' ? (
          <>
            <PageTitle title="Miisaska" description="QR codes and open bills for every table." />
            <div className="tables-grid">
              {tables?.map((t) => (
                <div className={'table-card ' + t.status} key={t.id}>
                  <Table2 size={35} />
                  <h2>Table {t.tableNumber}</h2>
                  <p>{t.capacity} seats</p>
                  <img
                    className="table-qr"
                    src={'/api/v1/pos/tables/' + t.id + '/qr'}
                    alt={'QR code for table ' + t.tableNumber}
                  />
                  <a
                    className="text-link"
                    href={'/api/v1/pos/tables/' + t.id + '/qr'}
                    target="_blank"
                  >
                    Open printable QR
                  </a>
                  <span className={'badge ' + t.status}>{t.status}</span>
                  {t.orders.map((o: any) => (
                    <Link href={'/admin/orders/' + o.id} key={o.id}>
                      {o.orderNumber} · {formatMoney(o.total)}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : section === 'bills' ? (
          <>
            <PageTitle title="Active bills" description="Open orders waiting to be closed." />
            <div className="panel">
              <OrdersTable
                orders={(orders || []).filter(
                  (o) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status),
                )}
              />
            </div>
          </>
        ) : section === 'payments' ? (
          <Payments />
        ) : (
          <Shifts />
        )}
      </>
    );
  if (checkout)
    return (
      <div className="pos-checkout">
        <button className="text-link" onClick={() => setCheckout(false)}>
          ← Back to terminal
        </button>
        <Checkout pos initialType={type} />
      </div>
    );
  const categories = [...new Set((items || []).map((i) => i.category?.name).filter(Boolean))],
    shift = shifts?.find((s) => s.status === 'OPEN' && s.cashierId === user.id),
    count = cart.reduce((s, i) => s + i.quantity, 0),
    subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return (
    <div className="pos">
      <div className="pos-menu">
        {sections}
        <div className="pos-toolbar">
          <div className="pill-row">
            {['', ...categories].map((c) => (
              <button
                key={c}
                className={'pill ' + (category === c ? 'active' : '')}
                onClick={() => setCategory(c)}
              >
                {c || 'Dhammaan'}
              </button>
            ))}
            <label className="pill pill-search">
              <Search size={16} />
              <input
                placeholder="Raadi"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search POS menu"
              />
            </label>
          </div>
          {shift ? (
            <span className="mono-label">
              Shift · furan {clock(shift.openedAt)} · {shift.cashier.fullName.split(' ')[0]}
            </span>
          ) : (
            <Link className="mono-label" href="/pos/shifts">
              Shift · xiran ↗
            </Link>
          )}
        </div>
        {error && <Notice error={error} />}
        <div className="pos-tiles">
          {items
            ?.filter(
              (i) =>
                (!category || i.category?.name === category) &&
                i.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((i) => {
              const inBill = cart
                  .filter((l) => l.menuItemId === i.id)
                  .reduce((s, l) => s + l.quantity, 0),
                body = (
                  <>
                    <span className="pos-tile-top">
                      <span>{i.category?.name}</span>
                      <span>{!i.isAvailable ? 'Dhammaaday' : inBill ? '×' + inBill : ''}</span>
                    </span>
                    <span className="pos-tile-name">
                      <b>{i.name}</b>
                      <span>{formatMoney(i.basePrice)}</span>
                    </span>
                  </>
                ),
                className = 'pos-tile ' + (inBill ? 'in-bill' : '');
              return i.modifierGroups?.length && i.isAvailable ? (
                <Link className={className} href={'/menu/' + i.slug} key={i.id}>
                  {body}
                </Link>
              ) : (
                <button
                  className={className}
                  key={i.id}
                  disabled={!i.isAvailable}
                  aria-label={'Add ' + i.name}
                  onClick={() =>
                    add({
                      key: i.id,
                      menuItemId: i.id,
                      name: i.name,
                      price: Number(i.basePrice),
                      imageUrl: i.imageUrl,
                      quantity: 1,
                      modifierOptionIds: [],
                      modifierNames: [],
                      specialInstructions: '',
                    })
                  }
                >
                  {body}
                </button>
              );
            })}
        </div>
      </div>
      <aside className="pos-bill">
        <div className="segmented" role="group" aria-label="Order type">
          {Object.entries(orderTypes)
            .reverse()
            .map(([value, label]) => (
              <button
                key={value}
                className={type === value ? 'active' : ''}
                aria-pressed={type === value}
                onClick={() => setType(value)}
              >
                {label}
              </button>
            ))}
        </div>
        <div className="pos-bill-head">
          <h2>Biilka</h2>
          <span className="mono-label">{count} saxan</span>
        </div>
        <div className="pos-bill-lines">
          {cart.map((l) => (
            <div className="pos-bill-line" key={l.key}>
              <span className="qty">
                <button aria-label="Remove one" onClick={() => quantity(l.key, l.quantity - 1)}>
                  −
                </button>
                {l.quantity}
                <button aria-label="Add one" onClick={() => quantity(l.key, l.quantity + 1)}>
                  +
                </button>
              </span>
              <span>
                {l.name}
                {l.modifierNames.length > 0 && <small>{l.modifierNames.join(', ')}</small>}
              </span>
              <span className="mono">{formatMoney(l.price * l.quantity)}</span>
            </div>
          ))}
          {!cart.length && <p className="pos-bill-empty">Dooro saxan si aad u bilowdo biil.</p>}
        </div>
        <div className="pos-bill-total">
          <span>Wadarta hoose</span>
          <strong>{formatMoney(subtotal)}</strong>
        </div>
        <div className="pos-bill-actions">
          <button disabled={!cart.length} onClick={clear}>
            Nadiifi
          </button>
          <button className="primary" disabled={!cart.length} onClick={() => setCheckout(true)}>
            Sii wad checkout
          </button>
        </div>
      </aside>
    </div>
  );
}
function Shifts() {
  const { data, error, refresh } = useData<any[]>('pos/shifts'),
    [dialog, setDialog] = useState<any>(undefined);
  return (
    <>
      <PageTitle
        title="Cashier shifts"
        description="Count cash at opening and closing. Compare expected and actual balances."
        action={
          <button className="button" onClick={() => setDialog(null)}>
            <Plus size={16} /> Open shift
          </button>
        }
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable
          rows={(data || []).map((s) => ({
            ...s,
            cashier: s.cashier.fullName,
            difference:
              s.expectedCash === null
                ? '—'
                : formatMoney(Number(s.actualClosingCash) - Number(s.expectedCash)),
          }))}
          columns={[
            'cashier',
            'status',
            'openingCash',
            'expectedCash',
            'actualClosingCash',
            'difference',
            'openedAt',
          ]}
          actions={(s) =>
            s.status === 'OPEN' && (
              <button className="small-button" onClick={() => setDialog(s)}>
                Close shift
              </button>
            )
          }
        />
      </div>
      {dialog !== undefined && (
        <EditModal
          title={dialog ? 'Close shift' : 'Open shift'}
          fields={[
            {
              name: dialog ? 'actualClosingCash' : 'openingCash',
              label: dialog ? 'Counted closing cash (USD)' : 'Opening cash (USD)',
              type: 'number',
              min: 0,
              required: true,
            },
          ]}
          initial={null}
          endpoint={dialog ? 'pos/shifts/' + dialog.id + '/close' : 'pos/shifts'}
          onClose={() => setDialog(undefined)}
          onSaved={async () => {
            setDialog(undefined);
            await refresh();
          }}
        />
      )}
    </>
  );
}
export function Payments() {
  const { data, error, refresh } = useData<any[]>('admin/payments', 10000),
    { toast, user } = useStore();
  return (
    <>
      <PageTitle
        title="Payments & receipts"
        description="Record cash only after collection. Refunds stay attached to the original payment."
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable
          rows={(data || []).map((p) => ({
            ...p,
            order: p.order.orderNumber,
            customer: p.order.guestName,
          }))}
          columns={['order', 'customer', 'method', 'amount', 'status', 'paidAt']}
          actions={(p) => (
            <>
              <Link className="small-button" href={'/admin/orders/' + p.orderId}>
                Details
              </Link>
              {['PENDING', 'UNPAID'].includes(p.status) && user.role !== 'ACCOUNTANT' && (
                <button
                  className="small-button"
                  onClick={async () => {
                    try {
                      await api('payments/' + p.id + '/capture', { method: 'POST', body: '{}' });
                      await refresh();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Cash collected
                </button>
              )}
            </>
          )}
        />
      </div>
    </>
  );
}
export function Reports() {
  const { data, error } = useData('admin/summary');
  function exportCsv() {
    if (!data) return;
    const lines = ['date,net_cash_revenue', ...data.days.map((d: any) => `${d.date},${d.amount}`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'botan-revenue.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageTitle
        title="A clearer picture of Botan"
        description="Cash captures, refunds, expenses and purchases. All amounts in USD."
        action={
          <button className="button outline" onClick={exportCsv}>
            <Download size={16} /> Export revenue CSV
          </button>
        }
      />
      {error && <Notice error={error} />}
      <div className="stats-grid">
        {[
          ['Captured', data?.captured],
          ['Refunded', data?.refunded],
          ['Net sales', data?.netSales],
          ['Expenses', data?.expenses],
          ['Received purchases', data?.purchases],
          ['Cash after outflows', data?.cashAfterExpenses],
        ].map(([title, value]) => (
          <div className="stat-card" key={title}>
            <span>{title}</span>
            <strong>{value === undefined ? '—' : formatMoney(value)}</strong>
          </div>
        ))}
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h2>Daily net revenue</h2>
          <span className="badge">Africa/Mogadishu</span>
        </div>
        <RevenueChart days={data?.days || []} />
      </div>
      <div className="notice neutral">
        Cash after outflows = captured cash − refunds − recorded expenses − received purchases. This
        is a cash view, not an audited profit statement. Inventory consumption estimate:{' '}
        {formatMoney(data?.inventoryCostEstimate || 0)}.
      </div>
    </>
  );
}
export function Purchases() {
  const { data, error, refresh } = useData<any[]>('admin/purchases'),
    { data: suppliers } = useData<any[]>('admin/resources/suppliers'),
    { data: inventory } = useData<any[]>('admin/resources/inventory'),
    { toast } = useStore(),
    [open, setOpen] = useState(false),
    [lines, setLines] = useState([{ inventoryItemId: '', quantity: 1, unitCost: 0 }]),
    [err, setErr] = useState('');
  return (
    <>
      <PageTitle
        title="Keep the kitchen stocked"
        description="Create purchase orders, then receive them once. Stock updates atomically."
        action={
          <button className="button" onClick={() => setOpen(!open)}>
            <Plus size={16} /> New purchase
          </button>
        }
      />
      {error && <Notice error={error} />}{' '}
      {open && (
        <form
          className="panel padded"
          onSubmit={async (e) => {
            e.preventDefault();
            const el = e.currentTarget,
              f = new FormData(el);
            try {
              await api('admin/purchases', {
                method: 'POST',
                body: JSON.stringify({
                  supplierId: f.get('supplierId'),
                  reference: f.get('reference'),
                  lines,
                }),
              });
              setOpen(false);
              await refresh();
              toast('Purchase order created');
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          <h2>New purchase order</h2>
          <div className="form-grid">
            <label className="field">
              Supplier
              <select name="supplierId" required>
                <option value="">Choose…</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Reference
              <input name="reference" required minLength={3} />
            </label>
          </div>
          {lines.map((line, n) => (
            <div className="purchase-line" key={n}>
              <select
                aria-label="Ingredient"
                value={line.inventoryItemId}
                required
                onChange={(e) =>
                  setLines((old) =>
                    old.map((l, i) => (i === n ? { ...l, inventoryItemId: e.target.value } : l)),
                  )
                }
              >
                <option value="">Ingredient</option>
                {inventory?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                aria-label="Quantity"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(e) =>
                  setLines((old) =>
                    old.map((l, i) => (i === n ? { ...l, quantity: Number(e.target.value) } : l)),
                  )
                }
              />
              <input
                type="number"
                aria-label="Unit cost"
                min="0"
                step="0.01"
                value={line.unitCost}
                onChange={(e) =>
                  setLines((old) =>
                    old.map((l, i) => (i === n ? { ...l, unitCost: Number(e.target.value) } : l)),
                  )
                }
              />
              <button
                className="icon-button"
                type="button"
                aria-label="Remove line"
                onClick={() => setLines((old) => old.filter((_, i) => i !== n))}
              >
                <X size={17} />
              </button>
            </div>
          ))}
          <div className="row-actions">
            <button
              type="button"
              className="button outline"
              onClick={() =>
                setLines((old) => [...old, { inventoryItemId: '', quantity: 1, unitCost: 0 }])
              }
            >
              Add line
            </button>
            <button className="button">Save purchase order</button>
          </div>
          {err && <Notice error={err} />}
        </form>
      )}
      <div className="panel">
        <DataTable
          rows={(data || []).map((p) => ({ ...p, supplier: p.supplier.name }))}
          columns={['reference', 'supplier', 'status', 'total', 'orderedAt', 'receivedAt']}
          actions={(p) =>
            p.status === 'ORDERED' && (
              <button
                className="small-button"
                onClick={async () => {
                  try {
                    await api('admin/purchases/' + p.id + '/receive', {
                      method: 'POST',
                      body: '{}',
                    });
                    await refresh();
                    toast('Stock received');
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                Receive stock
              </button>
            )
          }
        />
      </div>
    </>
  );
}
export function Delivery() {
  const { data, error, refresh } = useData<any[]>('admin/deliveries', 7000),
    { data: riders } = useData<any[]>('admin/delivery/riders'),
    { toast } = useStore();
  return (
    <>
      <PageTitle
        title="Good food, on the move"
        description="Assign the right rider and follow each delivery."
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable
          rows={(data || []).map((d) => ({
            ...d,
            orderNumber: d.order.orderNumber,
            customer: d.order.guestName,
            address: d.order.deliveryAddress,
            rider: d.rider?.fullName || 'Unassigned',
          }))}
          columns={['orderNumber', 'customer', 'address', 'status', 'rider']}
          actions={(d) =>
            ['PENDING', 'ASSIGNED'].includes(d.status) && (
              <select
                aria-label="Assign rider"
                value={d.riderId || ''}
                onChange={async (e) => {
                  try {
                    await api('admin/deliveries/' + d.id, {
                      method: 'PATCH',
                      body: JSON.stringify({ riderId: e.target.value }),
                    });
                    await refresh();
                    toast('Rider assigned');
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                <option value="">Assign rider…</option>
                {riders?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName}
                  </option>
                ))}
              </select>
            )
          }
        />
      </div>
    </>
  );
}
const riderState: Record<string, string> = {
  READY: 'Diyaar',
  OUT_FOR_DELIVERY: 'Jidka',
  COMPLETED: 'La keenay',
  CANCELLED: 'La joojiyey',
  REJECTED: 'La diiday',
};
export function Rider({ section }: { section: string }) {
  const { data, error, refresh } = useData<any[]>('rider/orders', 5000),
    { user, toast } = useStore(),
    [openId, setOpenId] = useState(''),
    [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const move = (o: any, status: string, proofNote?: string) =>
    api('rider/orders/' + o.id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status, proofNote }),
    });
  const history = section === 'history',
    rides = (data || []).filter(
      (o) => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status) === history,
    ),
    open = section !== 'profile' && rides.find((o) => o.id === openId),
    next = history ? undefined : rides.find((o) => o.status === 'OUT_FOR_DELIVERY') || rides[0];
  if (open) {
    const pickedUp = open.statusEvents?.find((e: any) => e.toStatus === 'OUT_FOR_DELIVERY'),
      unpaid = open.paymentStatus !== 'PAID';
    return (
      <div className="rider rider-detail">
        <button className="rider-back" onClick={() => setOpenId('')}>
          ← Dalabyada
        </button>
        <div className="rider-detail-head">
          <span className="mono-label">
            {shortNumber(open.orderNumber)} ·{' '}
            {pickedUp
              ? `La qaaday ${clock(pickedUp.createdAt)}`
              : riderState[open.status] || statusLabel[open.status] || open.status}
          </span>
          <h1>{open.guestName}</h1>
          <p>{open.deliveryAddress}</p>
        </div>
        <div className="rider-stats">
          <div>
            <span className="mono-label">{unpaid ? 'Qaado cash' : 'La bixiyay'}</span>
            <strong>{formatMoney(open.total)}</strong>
          </div>
          <div>
            <span className="mono-label">Saxan</span>
            <strong>{open.items.reduce((s: number, i: any) => s + i.quantity, 0)}</strong>
          </div>
        </div>
        <ul className="rider-items">
          {open.items.map((i: any) => (
            <li key={i.id}>
              {i.quantity}× {i.nameSnapshot}
            </li>
          ))}
        </ul>
        {open.status === 'READY' && (
          <button
            className="rider-primary"
            disabled={busy}
            onClick={() => void run(() => move(open, 'OUT_FOR_DELIVERY'))}
          >
            Xaqiiji qaadashada
          </button>
        )}
        {open.status === 'OUT_FOR_DELIVERY' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const proofNote = String(new FormData(e.currentTarget).get('proofNote'));
              void run(async () => {
                if (unpaid)
                  await api('payments/' + open.payments[0].id + '/capture', {
                    method: 'POST',
                    body: '{}',
                  });
                await move(open, 'COMPLETED', proofNote);
                setOpenId('');
              });
            }}
          >
            <label className="rider-proof">
              <span className="mono-label">Caddayn gaarsiin</span>
              <textarea
                name="proofNote"
                placeholder="Qoraal: e.g. albaabka la siiyay…"
                minLength={3}
                maxLength={500}
                required
              />
            </label>
            <button className="rider-primary" disabled={busy}>
              {unpaid ? 'La keenay · cash la qaaday' : 'La keenay'}
            </button>
          </form>
        )}
        <a className="rider-call" href={'tel:' + open.guestPhone.replace(/[^+\d]/g, '')}>
          Wac macmiilka
        </a>
      </div>
    );
  }
  return (
    <div className="rider">
      <div className="rider-top">
        <Wordmark />
        <span className="mono-label">{user.name.split(' ')[0]} · Rider</span>
      </div>
      <h1>
        {section === 'profile' ? (
          user.name
        ) : (
          <>
            {rides.length} dalab
            <br />
            {history ? 'la keenay.' : 'adiga.'}
          </>
        )}
      </h1>
      <nav className="pill-row">
        {[
          ['/rider', 'Loo qoondeeyay', 'assigned'],
          ['/rider/history', 'Taariikh', 'history'],
          ['/rider/profile', 'Profile', 'profile'],
        ].map(([href, label, key]) => (
          <Link key={href} href={href} className={'pill ' + (section === key ? 'active' : '')}>
            {label}
          </Link>
        ))}
      </nav>
      {error && <Notice error={error} />}
      {section === 'profile' ? (
        <div className="rider-card">
          <span className="mono-label">{user.role}</span>
          <p>Contact your manager to update your profile or delivery assignments.</p>
        </div>
      ) : (
        <>
          {rides.map((o) => (
            <button
              className={'rider-card ' + (o === next ? 'is-next' : '')}
              key={o.id}
              onClick={() => setOpenId(o.id)}
            >
              <span className="rider-card-top">
                <span title={o.orderNumber}>{shortNumber(o.orderNumber)}</span>
                <span>{riderState[o.status] || 'Sugaya'}</span>
              </span>
              <b>{o.guestName}</b>
              <span className="rider-card-bottom">
                <span>{o.deliveryAddress}</span>
                <b>{o.paymentStatus === 'PAID' ? 'La bixiyay' : formatMoney(o.total)}</b>
              </span>
            </button>
          ))}
          {data && !rides.length && (
            <p className="muted">
              {history ? 'Weli dalab lama keenin.' : 'Dalab laguu ma qoondeyn.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function SettingsPage() {
  const { data, error, refresh } = useData('restaurant'),
    { toast } = useStore(),
    [err, setErr] = useState('');
  if (!data) return error ? <Notice error={error} /> : <Loading />;
  return (
    <>
      <PageTitle
        title="The details that make Botan"
        description="Restaurant settings, opening hours and ordering availability."
      />
      <form
        className="panel padded"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            body: Record<string, any> = {};
          for (const key of ['name', 'phone', 'address']) body[key] = f.get(key);
          for (const key of ['taxRate', 'minimumOrder', 'averagePrepMinutes'])
            body[key] = Number(f.get(key));
          for (const key of [
            'isAcceptingOrders',
            'deliveryEnabled',
            'pickupEnabled',
            'dineInEnabled',
            'guestCheckoutEnabled',
          ])
            body[key] = f.get(key) === 'on';
          body.hours = data.hours.map((h: any) => ({
            dayOfWeek: h.dayOfWeek,
            opensAt: f.get(`open-${h.dayOfWeek}`),
            closesAt: f.get(`close-${h.dayOfWeek}`),
            isClosed: f.get(`closed-${h.dayOfWeek}`) === 'on',
          }));
          try {
            await api('admin/restaurant/settings', { method: 'PATCH', body: JSON.stringify(body) });
            await refresh();
            toast('Settings saved');
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        <div className="form-grid">
          {['name', 'phone', 'address'].map((key) => (
            <label className="field" key={key}>
              {key}
              <input name={key} defaultValue={data[key] || ''} required={key === 'name'} />
            </label>
          ))}
          {['taxRate', 'minimumOrder', 'averagePrepMinutes'].map((key) => (
            <label className="field" key={key}>
              {key.replace(/([A-Z])/g, ' $1')}
              <input
                type="number"
                step="0.01"
                name={key}
                min="0"
                max={key === 'taxRate' ? 100 : 10000}
                defaultValue={data.settings[key]}
              />
            </label>
          ))}
          {[
            'isAcceptingOrders',
            'deliveryEnabled',
            'pickupEnabled',
            'dineInEnabled',
            'guestCheckoutEnabled',
          ].map((key) => (
            <label className="check-row" key={key}>
              <input
                type="checkbox"
                name={key}
                defaultChecked={key === 'isAcceptingOrders' ? data[key] : data.settings[key]}
              />
              {key.replace(/([A-Z])/g, ' $1')}
            </label>
          ))}
        </div>
        <h2>Opening hours</h2>
        <p className="muted">
          Africa/Mogadishu · Closing earlier than opening means the shift ends the following day.
        </p>
        {data.hours
          .sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
          .map((h: any) => (
            <div className="hours-row" key={h.dayOfWeek}>
              <b>
                {
                  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                    h.dayOfWeek
                  ]
                }
              </b>
              <input
                aria-label={'Opening ' + h.dayOfWeek}
                name={'open-' + h.dayOfWeek}
                type="time"
                required
                defaultValue={h.opensAt}
              />
              <span>to</span>
              <input
                aria-label={'Closing ' + h.dayOfWeek}
                name={'close-' + h.dayOfWeek}
                type="time"
                required
                defaultValue={h.closesAt}
              />
              <label>
                <input type="checkbox" name={'closed-' + h.dayOfWeek} defaultChecked={h.isClosed} />{' '}
                Closed
              </label>
            </div>
          ))}
        {err && <Notice error={err} />}
        <button className="button">
          Save restaurant settings <Check size={17} />
        </button>
      </form>
      <DaljirConnectPanel />
    </>
  );
}

const SYNC_BADGE: Record<string, string> = {
  SENT: 'PAID',
  PENDING: 'PENDING',
  FAILED: 'CANCELLED',
};

/** WhatsApp ordering through DaljirConnect: connection state, menu sync and the last pushes. */
function DaljirConnectPanel() {
  const { data, error, refresh } = useData<any>('admin/integrations/daljirconnect', 15000),
    { toast } = useStore(),
    [busy, setBusy] = useState(false);
  if (error) return <Notice error={error} />;
  if (!data) return <Loading />;
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api('admin/integrations/daljirconnect/sync', { method: 'POST' });
      await refresh();
      toast(r.failed ? 'Menu sync failed — see below' : 'Menu sent to DaljirConnect');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const result = data.menu.lastResult as Record<string, number> | null;
  return (
    <section className="panel" aria-labelledby="daljir-heading">
      <div className="panel-heading">
        <div>
          <h2 id="daljir-heading">WhatsApp ordering · DaljirConnect</h2>
          <p>
            Orders the WhatsApp assistant takes arrive here for approval; every status change and
            payment is sent back to the customer. The menu is synced automatically.
          </p>
        </div>
        <span className={'badge ' + (data.configured ? 'PAID' : 'PENDING')}>
          {data.configured ? 'Connected' : 'Not configured'}
        </span>
      </div>
      <div className="padded" style={{ padding: 24 }}>
        {!data.configured ? (
          <p className="muted">
            Set <code>DALJIRCONNECT_URL</code>, <code>DALJIRCONNECT_API_KEY</code> and{' '}
            <code>DALJIRCONNECT_WEBHOOK_SECRET</code> in the server environment, then in
            DaljirConnect (Settings → POS &amp; integrations) add this address for orders:
          </p>
        ) : (
          <p className="muted">
            {data.connectHost} · {data.whatsappOrders30d} WhatsApp orders in 30 days
            {data.pending ? ` · ${data.pending} waiting to send` : ''}
            {!data.webhookSecretSet && ' · webhook secret missing: orders cannot arrive'}
          </p>
        )}
        <p>
          Orders address: <code>{data.webhookUrl}</code>
        </p>
        <p className="muted">
          Menu: {data.menu.items} items ·{' '}
          {data.menu.lastSyncAt
            ? `last synced ${new Date(data.menu.lastSyncAt).toLocaleString()}` +
              (result ? ` (${result.created ?? 0} added, ${result.updated ?? 0} updated)` : '')
            : 'never synced'}
        </p>
        <button
          className="button small"
          type="button"
          disabled={!data.configured || busy}
          onClick={sync}
        >
          {busy ? 'Syncing…' : 'Sync menu now'}
        </button>
        {data.recent.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>What</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((e: any) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleTimeString()}</td>
                    <td>
                      {e.kind === 'menu'
                        ? 'Menu'
                        : e.kind === 'drivers'
                          ? 'Riders'
                          : `Order ${e.orderNumber ?? '(rejected)'}`}
                    </td>
                    <td>
                      <span className={'badge ' + (SYNC_BADGE[e.status] || '')}>{e.status}</span>
                      {e.lastError && <small className="muted"> {e.lastError}</small>}
                      {e.attempts > 1 && <small className="muted"> · {e.attempts} tries</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
export function SimpleList({ kind }: { kind: string }) {
  const path =
      kind === 'audit'
        ? 'admin/audit-logs'
        : kind === 'notifications'
          ? 'admin/notifications'
          : 'admin/customers',
    { data, error } = useData<any[]>(path);
  const columns =
    kind === 'audit'
      ? ['action', 'entityType', 'entityId', 'createdAt']
      : kind === 'notifications'
        ? ['body', 'channel', 'status', 'createdAt']
        : ['fullName', 'phone', 'email', 'createdAt'];
  return (
    <>
      <PageTitle
        title={
          kind === 'audit'
            ? 'An accountable kitchen'
            : kind === 'notifications'
              ? 'From the Botan kitchen'
              : 'The people at our table'
        }
        description={
          kind === 'audit'
            ? 'A record of sensitive staff actions.'
            : kind === 'notifications'
              ? 'Durable in-app events. Email, SMS and WhatsApp providers are not configured.'
              : 'Customer contact information is restricted to restaurant managers.'
        }
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable rows={data || []} columns={columns} />
      </div>
    </>
  );
}

export function ReviewsPage() {
  const { data, error, refresh } = useData<any[]>('admin/reviews'),
    { toast } = useStore();
  return (
    <>
      <PageTitle
        title="Words from our table"
        description="Only genuine completed-order reviews can be submitted. Publish approved feedback to the customer website."
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable
          rows={(data || []).map((r) => ({
            ...r,
            customer: r.customer?.fullName,
            order: r.order.orderNumber,
          }))}
          columns={['customer', 'order', 'rating', 'comment', 'isPublished', 'createdAt']}
          actions={(r) => (
            <button
              className="small-button"
              onClick={async () => {
                try {
                  await api('admin/reviews/' + r.id, {
                    method: 'PATCH',
                    body: JSON.stringify({ isPublished: !r.isPublished }),
                  });
                  await refresh();
                  toast('Review updated');
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              {r.isPublished ? 'Unpublish' : 'Publish'}
            </button>
          )}
        />
      </div>
    </>
  );
}
