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
  TrendingUp,
} from 'lucide-react';
import { api, useData, useStore } from './store';
import { NewRiderDialog, DeliveryCompletion } from './delivery-controls';
import { ForcePasswordChange } from './users';
import { Loading, Notice, Wordmark, landing, roleLabel, viewLabel } from './shared';
import { formatMoney, orderView, paymentMethodLabel } from '@/lib/domain';
const groups: { title: string; items: [href: string, label: string, roles: string[]][] }[] = [
  {
    title: 'DALABYADA',
    items: [
      ['/admin/orders/new', 'Dalab cusub', ['OWNER', 'MANAGER', 'OPERATOR']],
      ['/admin/orders', 'Dalabyada', ['OWNER', 'MANAGER', 'OPERATOR', 'ACCOUNTANT']],
      ['/admin/delivery', 'Darawallada', ['OWNER', 'MANAGER']],
      ['/rider', 'Rider portal', ['RIDER']],
    ],
  },
  {
    title: 'GUUD',
    items: [
      ['/admin', 'Dashboard', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
      ['/admin/reports', 'Warbixinno', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
    ],
  },
  {
    title: 'MENU',
    items: [
      ['/admin/menu', 'Menu', ['OWNER', 'MANAGER']],
      ['/admin/categories', 'Qaybaha', ['OWNER', 'MANAGER']],
      ['/admin/modifiers', 'Modifiers', ['OWNER', 'MANAGER']],
      ['/admin/delivery/zones', 'Xaafadaha (zones)', ['OWNER', 'MANAGER']],
    ],
  },
  {
    title: 'KAYDKA',
    items: [
      ['/admin/inventory', 'Kaydka', ['OWNER', 'MANAGER']],
      ['/admin/suppliers', 'Suppliers', ['OWNER', 'MANAGER']],
      ['/admin/purchases', 'Iibsiga', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
    ],
  },
  {
    title: 'MAALIYADDA',
    items: [
      ['/admin/payments', 'Payments', ['OWNER', 'MANAGER', 'ACCOUNTANT', 'OPERATOR']],
      ['/admin/expenses', 'Expenses', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
    ],
  },
  {
    title: 'MAAMULKA',
    items: [
      ['/admin/users', 'Isticmaalayaasha', ['OWNER', 'MANAGER']],
      ['/admin/notifications', 'Notifications', ['OWNER', 'MANAGER']],
      ['/admin/audit', 'Audit trail', ['OWNER', 'MANAGER']],
      ['/admin/settings', 'Settings', ['OWNER', 'MANAGER']],
    ],
  },
];
const timeZone = 'Africa/Mogadishu',
  weekdays = ['Axad', 'Isniin', 'Talaado', 'Arbaco', 'Khamiis', 'Jimco', 'Sabti'],
  weekdayShort = ['Axd', 'Isn', 'Tal', 'Arb', 'Kha', 'Jim', 'Sab'],
  months = ['Jan', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Lul', 'Ago', 'Seb', 'Okt', 'Nof', 'Dis'];
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
export function StaffShell({ path, children }: { path: string; children: React.ReactNode }) {
  const { user, ready, refreshUser } = useStore(),
    router = useRouter(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (ready && (!user || user.kind !== 'staff')) router.replace('/login');
    if (path === '/admin' && user && !['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(user.role))
      router.replace(landing(user.role));
  }, [path, user, ready, router]);
  if (!user || user.kind !== 'staff') return <Loading />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  const visible = groups
      .map((g) => ({
        title: g.title,
        items: g.items.filter((i) => i[2].includes(user.role)),
      }))
      .filter((g) => g.items.length),
    title =
      groups.flatMap((g) => g.items).find((i) => i[0] === path)?.[1] ||
      (path === '/account'
        ? 'Akoonkayga'
        : path.startsWith('/admin/users/')
          ? 'Isticmaale'
          : 'Botan');
  return (
    <div className="staff-app">
      <aside className={'sidebar ' + (open ? 'is-open' : '')}>
        <Link href={landing(user.role)} className="sidebar-brand" onClick={() => setOpen(false)}>
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
          <div className="staff-profile">
            <Link
              href="/account"
              className="staff-profile-link"
              title="Akoonkayga"
              onClick={() => setOpen(false)}
            >
              <span className="staff-avatar">{user.name.slice(0, 1)}</span>
              <span>
                <b>{user.name}</b>
                <small>{roleLabel[user.role] || user.role}</small>
              </span>
            </Link>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={async () => {
                await api('auth/logout', { method: 'POST', body: '{}' });
                await refreshUser();
                router.push('/login');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className={'staff-main ' + (path === '/admin/orders/new' ? 'is-flush' : '')}>
        <header className="staff-header">
          <button
            className="icon-button mobile-nav"
            aria-label="Open staff menu"
            onClick={() => setOpen(!open)}
          >
            <MenuIcon />
          </button>
          <b>{title}</b>
          <Link href="/account" className="staff-avatar small-avatar" aria-label="Akoonkayga">
            {user.name[0]}
          </Link>
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
export function Dashboard() {
  const { data, error } = useData('admin/summary', 15000),
    { data: recent } = useData<any>('admin/orders?limit=6', 10000),
    orders: any[] | undefined = recent?.orders,
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
    [
      'Socda',
      data ? String(data.activeOrders) : '—',
      'Pending + assigned',
      data?.activeOrders ? 'hot' : '',
    ],
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
        <Link href="/admin/orders/new" className="pill-button">
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
            const [label, tone] = viewLabel[orderView(o.status)];
            return (
              <Link className="live-row" href={'/admin/orders/' + o.id} key={o.id}>
                <span className="mono" title={o.orderNumber}>
                  {shortNumber(o.orderNumber)}
                </span>
                <div>
                  <b>{o.guestName}</b>
                  <small>
                    {o.deliveryAddress} · {formatMoney(o.total)}
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
  const { data: riders, error, refresh } = useData<any[]>('admin/delivery/riders', 15000),
    [adding, setAdding] = useState(false),
    { toast } = useStore();
  return (
    <>
      <PageTitle
        title="Darawallada"
        description="Darawallada firfircoon iyo inta dalab ee hadda jidka ugu jira. Darawal waxaa laga qoondeeyaa dalabka."
        action={
          <button className="button" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Ku dar darawal
          </button>
        }
      />
      {adding && (
        <NewRiderDialog
          onClose={() => setAdding(false)}
          onCreated={async () => {
            await refresh();
            setAdding(false);
            toast('Darawalka waa la kaydiyey');
          }}
        />
      )}
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable
          rows={(riders || []).map((r) => ({ ...r, onTheRoad: r.activeOrders }))}
          columns={['fullName', 'phone', 'email', 'onTheRoad']}
        />
      </div>
      <p className="muted">
        Si aad u hakiso darawal ama u beddesho password-kiisa, fur{' '}
        <Link href="/admin/users">Isticmaalayaasha</Link>.
      </p>
    </>
  );
}
const riderState: Record<string, string> = {
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
  const history = section === 'history',
    rides = (data || []).filter(
      (o) => ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(o.status) === history,
    ),
    open = section !== 'profile' && rides.find((o) => o.id === openId),
    next = history ? undefined : rides[0];
  if (open) {
    const assigned = open.delivery?.assignedAt,
      unpaid = open.paymentStatus !== 'PAID',
      remaining = open.payments
        .filter((payment: any) => ['PENDING', 'UNPAID'].includes(payment.status))
        .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);
    return (
      <div className="rider rider-detail">
        <button className="rider-back" onClick={() => setOpenId('')}>
          ← Dalabyada
        </button>
        <div className="rider-detail-head">
          <span className="mono-label">
            {shortNumber(open.orderNumber)} ·{' '}
            {assigned ? `Laguu diray ${clock(assigned)}` : riderState[open.status] || open.status}
          </span>
          <h1>{open.guestName}</h1>
          <p>{open.deliveryAddress}</p>
        </div>
        <div className="rider-stats">
          <div>
            <span className="mono-label">
              {unpaid
                ? 'Qaado · ' + (paymentMethodLabel[open.payments[0]?.method] || 'Cash')
                : 'La bixiyay'}
            </span>
            <strong>{formatMoney(unpaid ? remaining : open.total)}</strong>
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
        {open.status === 'OUT_FOR_DELIVERY' && (
          <DeliveryCompletion
            order={open}
            endpoint={'rider/orders/' + open.id + '/complete-delivery'}
            onCompleted={async () => {
              await refresh();
              setOpenId('');
            }}
          />
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
          <span className="mono-label">{roleLabel[user.role] || user.role}</span>
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
                <b>
                  {o.paymentStatus === 'PAID'
                    ? 'La bixiyay'
                    : formatMoney(
                        o.payments
                          .filter((payment: any) => ['PENDING', 'UNPAID'].includes(payment.status))
                          .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0),
                      )}
                </b>
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
        description="Magaca, telefoonka iyo cinwaanka risiidka, VAT-ka iyo saacadaha."
      />
      <form
        className="panel padded"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            body: Record<string, any> = {};
          for (const key of ['name', 'phone', 'address']) body[key] = f.get(key);
          body.taxRate = Number(f.get('taxRate'));
          body.isAcceptingOrders = f.get('isAcceptingOrders') === 'on';
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
          <label className="field">
            VAT (%)
            <input
              type="number"
              step="0.01"
              name="taxRate"
              min="0"
              max="100"
              defaultValue={data.settings.taxRate}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              name="isAcceptingOrders"
              defaultChecked={data.isAcceptingOrders}
            />
            Dalab waa la qaadanayaa (accepting orders)
          </label>
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
  const path = kind === 'audit' ? 'admin/audit-logs' : 'admin/notifications',
    { data, error } = useData<any[]>(path);
  const columns =
    kind === 'audit'
      ? ['action', 'entityType', 'entityId', 'createdAt']
      : ['body', 'status', 'createdAt'];
  return (
    <>
      <PageTitle
        title={kind === 'audit' ? 'Audit trail' : 'Notifications'}
        description={
          kind === 'audit'
            ? 'Diiwaanka ficillada muhiimka ah ee shaqaalaha.'
            : 'Dhacdooyinka nidaamka (in-app).'
        }
      />
      {error && <Notice error={error} />}
      <div className="panel">
        <DataTable rows={data || []} columns={columns} />
      </div>
    </>
  );
}
