'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Users,
  Boxes,
  Truck,
  Wallet,
  Settings,
  ClipboardList,
  ChefHat,
  LogOut,
  ArrowUpRight,
  Plus,
  Search,
  X,
  Check,
  Clock,
  RefreshCw,
  Printer,
  Download,
  Menu as MenuIcon,
  Leaf,
  Table2,
  Bell,
  Tag,
  Store,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { api, useData, useStore } from './store';
import { Brand, Checkout, FoodCard, Loading, Notice, statusLabel } from './customer';
import { formatMoney, transitions } from '@/lib/domain';
const links = [
  ['OVERVIEW', '/admin', 'Dashboard', LayoutDashboard, ['OWNER', 'MANAGER', 'ACCOUNTANT']],
  ['', '/admin/orders', 'Live orders', ShoppingBag, ['OWNER', 'MANAGER', 'CASHIER', 'ACCOUNTANT']],
  ['RESTAURANT', '/admin/menu', 'Menu items', UtensilsCrossed, ['OWNER', 'MANAGER']],
  ['', '/admin/categories', 'Categories', ClipboardList, ['OWNER', 'MANAGER']],
  ['', '/admin/modifiers', 'Modifiers', Plus, ['OWNER', 'MANAGER']],
  ['', '/admin/customers', 'Customers', Users, ['OWNER', 'MANAGER']],
  ['', '/admin/tables', 'Tables', Table2, ['OWNER', 'MANAGER', 'CASHIER']],
  ['', '/admin/coupons', 'Offers & coupons', Tag, ['OWNER', 'MANAGER']],
  ['OPERATIONS', '/kitchen', 'Kitchen display', ChefHat, ['OWNER', 'MANAGER', 'CHEF']],
  ['', '/pos', 'Cashier / POS', Store, ['OWNER', 'MANAGER', 'CASHIER']],
  ['', '/admin/delivery', 'Delivery', Truck, ['OWNER', 'MANAGER']],
  ['', '/admin/delivery/zones', 'Delivery zones', MapIcon, ['OWNER', 'MANAGER']],
  ['', '/rider', 'Rider portal', Truck, ['OWNER', 'MANAGER', 'RIDER']],
  ['', '/admin/inventory', 'Inventory', Boxes, ['OWNER', 'MANAGER']],
  ['', '/admin/suppliers', 'Suppliers', Users, ['OWNER', 'MANAGER']],
  ['', '/admin/purchases', 'Purchases', ClipboardList, ['OWNER', 'MANAGER', 'ACCOUNTANT']],
  [
    'BUSINESS',
    '/admin/payments',
    'Payments',
    Wallet,
    ['OWNER', 'MANAGER', 'ACCOUNTANT', 'CASHIER'],
  ],
  ['', '/admin/expenses', 'Expenses', Wallet, ['OWNER', 'MANAGER', 'ACCOUNTANT']],
  ['', '/admin/reports', 'Finance & reports', TrendingUp, ['OWNER', 'MANAGER', 'ACCOUNTANT']],
  ['', '/admin/staff', 'Team & access', ShieldCheck, ['OWNER']],
  ['', '/admin/notifications', 'Notifications', Bell, ['OWNER', 'MANAGER']],
  ['', '/admin/reviews', 'Customer reviews', Users, ['OWNER', 'MANAGER']],
  ['', '/admin/audit', 'Audit trail', ClipboardList, ['OWNER', 'MANAGER']],
  ['', '/admin/settings', 'Settings', Settings, ['OWNER', 'MANAGER']],
] as const;
function MapIcon({ size = 18 }: { size?: number }) {
  return <Truck size={size} />;
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
  const title = links.find((l) => l[1] === path)?.[2] || 'Botan workspace';
  return (
    <div className="staff-app">
      <aside className={'sidebar ' + (open ? 'is-open' : '')}>
        <Brand light />
        <div className="workspace-label">
          <span className="status-dot" /> BOTAN WORKSPACE <small>Single restaurant</small>
        </div>
        <nav>
          {links
            .filter((l) => (l[4] as readonly string[]).includes(user.role))
            .map(([group, href, label, Icon]) => (
              <div key={href}>
                {group && <div className="nav-group">{group}</div>}
                <Link
                  className={path === href ? 'active' : ''}
                  href={href}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {path === href && <span className="nav-active-dot" />}
                </Link>
              </div>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ArrowUpRight size={16} /> Customer website
          </Link>
          <div className="staff-profile">
            <div className="staff-avatar">{user.name.slice(0, 1)}</div>
            <div>
              <b>{user.name}</b>
              <small>{user.role.toLowerCase()}</small>
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
      <div className="staff-main">
        <header className="staff-header">
          <div>
            <button
              className="icon-button mobile-nav"
              aria-label="Open staff menu"
              onClick={() => setOpen(!open)}
            >
              <MenuIcon />
            </button>
            <span>
              Workspace <span className="breadcrumb-separator">/</span> <b>{title}</b>
            </span>
          </div>
          <div>
            <span className="live-label">
              <span className="status-dot" /> Connected workspace
            </span>
            <span className="staff-avatar small-avatar">{user.name[0]}</span>
          </div>
        </header>
        <main className="staff-content">{children}</main>
        <div className="staff-footer">
          BOTAN RESTAURANT <span>Made with care · Africa/Mogadishu</span>
        </div>
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
export function Dashboard() {
  const { data, error } = useData('admin/summary', 15000),
    { data: orders } = useData<any[]>('admin/orders?limit=6', 10000),
    { user } = useStore();
  return (
    <>
      <PageTitle
        eyebrow="A FRESH LOOK AT YOUR RESTAURANT"
        title={`Soo dhowow, ${user?.name.split(' ')[0] || 'Botan'}.`}
        description="Here’s what’s happening at Botan. Let’s make it a good day."
        action={
          <Link href="/pos" className="button">
            <Plus size={17} /> New order
          </Link>
        }
      />
      {error && <Notice error={error} />}
      <div className="stats-grid">
        {[
          ['Net sales', data?.netSales, Wallet, true],
          ['Total orders', data?.orderCount, ShoppingBag, false],
          ['In progress', data?.activeOrders, Clock, false],
          ['Average order', data?.averageOrder, TrendingUp, true],
        ].map(([label, value, Icon, currency]: any) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{value === undefined ? '—' : currency ? formatMoney(value) : value}</strong>
            <small>All recorded orders · USD</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Revenue overview</h2>
              <p>Captures less refunds · Mogadishu dates</p>
            </div>
            <span className="badge">Cash payments</span>
          </div>
          <RevenueChart days={data?.days || []} />
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Table favourites</h2>
              <p>Most ordered dishes</p>
            </div>
            <FlameIcon />
          </div>
          {data?.topItems?.length ? (
            data.topItems.map((i: any, n: number) => (
              <div className="top-item" key={i.name}>
                <span className="rank">0{n + 1}</span>
                <span>{i.name}</span>
                <b>
                  {i.quantity}
                  <small> sold</small>
                </b>
              </div>
            ))
          ) : (
            <div className="empty compact">
              <UtensilsCrossed size={30} />
              <p>Your first orders will appear here.</p>
            </div>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p>Fresh from your customers</p>
          </div>
          <Link href="/admin/orders" className="text-link">
            View all orders <ArrowUpRight size={15} />
          </Link>
        </div>
        <OrdersTable orders={orders || []} />
      </div>
      <div className="workspace-banner">
        <span>
          <Leaf size={24} />
        </span>
        <div>
          <h3>A little care goes a long way.</h3>
          <p>Keep your menu fresh, your kitchen moving, and your customers smiling.</p>
        </div>
        <Link href="/admin/menu">
          Manage menu <ArrowUpRight size={18} />
        </Link>
      </div>
    </>
  );
}
function FlameIcon() {
  return <ChefHat size={22} />;
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
export function Kitchen() {
  const { data, error, refresh } = useData<any[]>('kitchen/orders', 4000),
    { toast } = useStore(),
    [tab, setTab] = useState('live'),
    [sound, setSound] = useState(false),
    known = useRef<Set<string>>(new Set());
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
    <>
      <PageTitle
        eyebrow="THE HEART OF BOTAN"
        title="Kitchen display"
        description="Fresh tickets. Clear priorities. Good food, on time."
        action={
          <button className="button outline" onClick={() => setSound(!sound)}>
            <Bell size={16} /> Sound {sound ? 'on' : 'off'}
          </button>
        }
      />
      {error && <Notice error={error} />}
      <div className="tabs spaced">
        <button className={tab === 'live' ? 'active' : ''} onClick={() => setTab('live')}>
          Live kitchen
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Completed history
        </button>
        <span className="muted">Refreshes every 4 seconds</span>
      </div>
      <div className="kitchen-board">
        {(tab === 'live' ? ['CONFIRMED', 'PREPARING', 'READY'] : ['COMPLETED']).map((status) => (
          <div className="kitchen-column" key={status}>
            <h2>
              <span className={'status-dot ' + status} />
              {status === 'CONFIRMED'
                ? 'New orders'
                : status === 'PREPARING'
                  ? 'Preparing'
                  : status === 'READY'
                    ? 'Ready to serve'
                    : 'Completed'}
              <b>{data?.filter((o) => o.status === status).length || 0}</b>
            </h2>
            {data
              ?.filter((o) => o.status === status)
              .map((o) => (
                <article className="ticket" key={o.id}>
                  <div className="ticket-heading">
                    <b>{o.orderNumber}</b>
                    <span>
                      <Clock size={13} />
                      {Math.max(
                        0,
                        Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000),
                      )}
                      m
                    </span>
                  </div>
                  <div className="ticket-type">
                    {o.type} {o.table && `· Table ${o.table.tableNumber}`}
                  </div>
                  {o.items.map((i: any) => (
                    <div className="ticket-line" key={i.id}>
                      <strong>{i.quantity}×</strong>
                      <div>
                        <b>{i.nameSnapshot}</b>
                        {i.modifiers?.length > 0 && (
                          <small>{i.modifiers.map((m: any) => m.nameSnapshot).join(', ')}</small>
                        )}
                        {i.specialInstructions && <p className="note">{i.specialInstructions}</p>}
                      </div>
                    </div>
                  ))}
                  {o.notes && <p className="note">{o.notes}</p>}
                  {status === 'CONFIRMED' && (
                    <button className="button full" onClick={() => void move(o, 'PREPARING')}>
                      <ChefHat size={16} /> Start preparing
                    </button>
                  )}
                  {status === 'PREPARING' && (
                    <button className="button full" onClick={() => void move(o, 'READY')}>
                      <Check size={16} /> Mark ready
                    </button>
                  )}
                  {status === 'READY' && (
                    <div className="ready-note">
                      <Check size={15} /> Waiting for pickup / rider
                    </div>
                  )}
                </article>
              ))}
            {!data?.some((o) => o.status === status) && (
              <div className="empty compact">All clear here.</div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
export function Pos({ section }: { section: string }) {
  const { data: items, error } = useData<any[]>(section === 'terminal' ? 'menu/items' : null),
    { data: tables, refresh } = useData<any[]>(section === 'tables' ? 'pos/tables' : null),
    { data: orders } = useData<any[]>(section === 'bills' ? 'pos/orders' : null),
    [search, setSearch] = useState(''),
    [checkout, setCheckout] = useState(false),
    { cart, quantity } = useStore();
  return (
    <>
      <PageTitle
        title="The Botan counter"
        description="Good service starts here. Dine-in, pickup and delivery."
      />
      <div className="tabs spaced">
        {[
          ['/pos', 'Terminal'],
          ['/pos/tables', 'Tables'],
          ['/pos/bills', 'Active bills'],
          ['/pos/payments', 'Payments'],
          ['/pos/shifts', 'Shifts'],
        ].map(([href, label]) => (
          <Link key={href} href={href}>
            {label}
          </Link>
        ))}
      </div>
      {section === 'terminal' ? (
        checkout ? (
          <>
            <button className="text-link" onClick={() => setCheckout(false)}>
              ← Back to terminal
            </button>
            <Checkout pos />
          </>
        ) : (
          <div className="pos-layout">
            <div>
              <label className="search-field">
                <Search size={17} />
                <input
                  placeholder="Search the menu"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search POS menu"
                />
              </label>
              {error && <Notice error={error} />}
              <div className="food-grid pos-grid">
                {items
                  ?.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
                  .map((i) => (
                    <FoodCard item={i} key={i.id} />
                  ))}
              </div>
            </div>
            <div className="summary-card">
              <h2>Current bill</h2>
              {cart.map((i) => (
                <div className="pos-cart-line" key={i.key}>
                  <b>{i.name}</b>
                  <div>
                    <QuantitySmall value={i.quantity} onChange={(n) => quantity(i.key, n)} />
                    <span>{formatMoney(i.price * i.quantity)}</span>
                  </div>
                </div>
              ))}
              {cart.length === 0 && <p className="muted">Choose a dish to start a bill.</p>}
              <div className="summary-row total">
                <span>Subtotal</span>
                <b>{formatMoney(cart.reduce((s, i) => s + i.price * i.quantity, 0))}</b>
              </div>
              <button
                className="button full"
                disabled={!cart.length}
                onClick={() => setCheckout(true)}
              >
                Checkout <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
        )
      ) : section === 'tables' ? (
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
              <a className="text-link" href={'/api/v1/pos/tables/' + t.id + '/qr'} target="_blank">
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
      ) : section === 'bills' ? (
        <div className="panel">
          <OrdersTable
            orders={(orders || []).filter(
              (o) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status),
            )}
          />
        </div>
      ) : section === 'payments' ? (
        <Payments />
      ) : (
        <Shifts />
      )}
    </>
  );
}
function QuantitySmall({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="quantity">
      <button onClick={() => onChange(value - 1)} aria-label="Remove one">
        −
      </button>
      <b>{value}</b>
      <button onClick={() => onChange(value + 1)} aria-label="Add one">
        +
      </button>
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
export function Rider({ section }: { section: string }) {
  const { data, error, refresh } = useData<any[]>('rider/orders', 5000),
    { user, toast } = useStore();
  async function move(o: any, status: string, proofNote?: string) {
    try {
      await api('rider/orders/' + o.id + '/status', {
        method: 'PATCH',
        body: JSON.stringify({ status, proofNote }),
      });
      await refresh();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        title={section === 'profile' ? user.name : 'Your next good delivery'}
        description="Only assigned deliveries are visible to rider accounts."
      />
      <div className="tabs spaced">
        <Link href="/rider">Assigned orders</Link>
        <Link href="/rider/history">Delivery history</Link>
        <Link href="/rider/profile">Profile</Link>
      </div>
      {error && <Notice error={error} />}{' '}
      {section === 'profile' ? (
        <div className="panel padded">
          <h2>{user.name}</h2>
          <p>Role: {user.role}</p>
          <p>Contact your manager to update your profile or delivery assignments.</p>
        </div>
      ) : (
        <div className="rider-grid">
          {data
            ?.filter((o) =>
              section === 'history'
                ? ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status)
                : !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status),
            )
            .map((o) => (
              <div className="panel padded" key={o.id}>
                <div className="section-heading">
                  <h3>{o.orderNumber}</h3>
                  <span className={'badge ' + o.status}>{o.status.replaceAll('_', ' ')}</span>
                </div>
                <h2>{o.guestName}</h2>
                <p>{o.deliveryAddress}</p>
                <p>
                  <a className="text-link" href={'tel:' + o.guestPhone.replace(/[^+\d]/g, '')}>
                    {o.guestPhone}
                  </a>
                </p>
                <p>{o.items.map((i: any) => `${i.quantity} × ${i.nameSnapshot}`).join(', ')}</p>
                <div className="summary-row">
                  <span>Collect cash</span>
                  <b>{o.paymentStatus === 'PAID' ? 'Paid' : formatMoney(o.total)}</b>
                </div>
                {o.status === 'READY' && (
                  <button className="button full" onClick={() => void move(o, 'OUT_FOR_DELIVERY')}>
                    Confirm pickup <Truck size={17} />
                  </button>
                )}
                {o.status === 'OUT_FOR_DELIVERY' && (
                  <>
                    {o.paymentStatus !== 'PAID' && (
                      <button
                        className="button outline full"
                        onClick={async () => {
                          try {
                            await api('payments/' + o.payments[0].id + '/capture', {
                              method: 'POST',
                              body: '{}',
                            });
                            await refresh();
                          } catch (e) {
                            toast((e as Error).message);
                          }
                        }}
                      >
                        Confirm cash received
                      </button>
                    )}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void move(o, 'COMPLETED', String(f.get('proofNote')));
                      }}
                    >
                      <label className="field">
                        Delivery confirmation note
                        <input
                          name="proofNote"
                          placeholder="Handed to customer at front door"
                          minLength={3}
                          maxLength={500}
                          required
                        />
                      </label>
                      <button className="button full">
                        Confirm delivered <Check size={17} />
                      </button>
                    </form>
                  </>
                )}
              </div>
            ))}
        </div>
      )}
    </>
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
    </>
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
