'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { api, useData, useStore } from './store';
import { Loading, Notice, Wordmark, landing, roleLabel } from './shared';

export const ROLES = ['OWNER', 'MANAGER', 'OPERATOR', 'RIDER', 'ACCOUNTANT'] as const;
const roleInfo: Record<string, string> = {
  OWNER: 'Wax walba: isticmaalayaasha oo dhan, maaliyadda iyo settings-ka.',
  MANAGER:
    'Dalabyada iyo joojintooda, menu, kaydka, warbixinnada; dalab-qaadayaasha iyo darawallada.',
  OPERATOR: 'Dalab qaado, darawal u qoondee, lacag diiwaangeli, xaqiiji gaarsiin.',
  RIDER: 'Dalabyadiisa kaliya: arag cinwaanka, xaqiiji gaarsiinta iyo lacagta.',
  ACCOUNTANT: 'Warbixinnada, lacagaha iyo kharashaadka; dalabyada wuu akhriyaa oo kaliya.',
};
const permissions: [string, string[]][] = [
  ['Dalab qaado', ['OWNER', 'MANAGER', 'OPERATOR']],
  ['Darawal u qoondee', ['OWNER', 'MANAGER', 'OPERATOR']],
  ['Lacag diiwaangeli', ['OWNER', 'MANAGER', 'OPERATOR', 'RIDER']],
  ['Xaqiiji gaarsiin', ['OWNER', 'MANAGER', 'OPERATOR', 'RIDER']],
  ['Jooji dalab', ['OWNER', 'MANAGER']],
  ['Menu, xaafadaha, kaydka', ['OWNER', 'MANAGER']],
  ['Warbixinno & maaliyad', ['OWNER', 'MANAGER', 'ACCOUNTANT']],
  ['Maamul dalab-qaade & darawal', ['OWNER', 'MANAGER']],
  ['Maamul maamulayaasha & milkiilayaasha', ['OWNER']],
];
const actionLabel: Record<string, string> = {
  LOGIN: 'Wuu soo galay',
  USER_CREATE: 'Akoon la abuuray',
  USER_UPDATE: 'Xogta la beddelay',
  USER_ROLE_CHANGE: 'Doorka la beddelay',
  USER_SUSPEND: 'La hakiyey',
  USER_ACTIVATE: 'Dib loo furay',
  USER_PASSWORD_RESET: 'Password la reset-gareeyay',
  USER_SESSIONS_REVOKED: 'Qalab laga saaray',
  PASSWORD_CHANGE: 'Password-kiisa wuu beddelay',
  ACCOUNT_UPDATE: 'Profile-kiisa wuu beddelay',
  ORDER_CREATE: 'Dalab qaaday',
  ASSIGN_RIDER: 'Darawal qoondeeyay',
  REASSIGN_RIDER: 'Darawal beddelay',
  ORDER_STATUS: 'Xaaladda dalabka beddelay',
  RIDER_COMPLETED_DELIVERY: 'Gaarsiin dhammeeyay',
  STAFF_COMPLETED_DELIVERY: 'Gaarsiin xaqiijiyay',
  PAYMENT_CAPTURE: 'Lacag diiwaangeliyay',
  REFUND: 'Lacag celiyay',
  CREATE_RIDER: 'Darawal abuuray',
};
const tz = 'Africa/Mogadishu';
export function ago(value?: string | null) {
  if (!value) return 'Weligiis';
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'Hadda';
  if (s < 3600) return `${Math.floor(s / 60)} daqiiqo kahor`;
  if (s < 86400) return `${Math.floor(s / 3600)} saac kahor`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} maalin kahor`;
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
const stamp = (value: string) =>
  new Date(value).toLocaleString('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
function device(ua?: string | null) {
  if (!ua) return { label: 'Qalab aan la aqoon', mobile: false };
  const os = /Android/i.test(ua)
    ? 'Android'
    : /iPhone|iPad/i.test(ua)
      ? 'iPhone'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Qalab';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  return { label: `${browser} · ${os}`, mobile: /Android|iPhone|Mobile/i.test(ua) };
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="user-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 45% 32%)`,
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
function RoleBadge({ role }: { role: string }) {
  return <span className={'role-badge role-' + role.toLowerCase()}>{roleLabel[role] || role}</span>;
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={'user-status ' + (status === 'ACTIVE' ? 'on' : 'off')}>
      {status === 'ACTIVE' ? 'Firfircoon' : 'La hakiyey'}
    </span>
  );
}
function strength(value: string) {
  let score = 0;
  if (value.length >= 12) score++;
  if (value.length >= 16) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(4, score);
}
function generate() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  let value = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  if (!/\d/.test(value)) value = value.slice(0, -1) + '7';
  return value.replace(/(.{4})(?=.)/g, '$1-');
}
function PasswordField({
  label,
  value,
  onChange,
  required = true,
  withGenerator = false,
  autoComplete = 'new-password',
  isNew = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  withGenerator?: boolean;
  autoComplete?: string;
  /** False for the current password: no length rule, meter or hint. */
  isNew?: boolean;
}) {
  const [show, setShow] = useState(false);
  const score = strength(value);
  return (
    <div className="field password-field">
      <label>
        {label}
        <span className="password-input">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            minLength={isNew ? 12 : undefined}
            maxLength={72}
            required={required}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={show ? 'Qari password-ka' : 'Muuji password-ka'}
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </span>
      </label>
      {isNew && value && (
        <span className={'strength s' + score} aria-live="polite">
          <i />
          <i />
          <i />
          <i />
          <small>
            {['Aad u daciif', 'Daciif', 'Dhexdhexaad', 'Wanaagsan', 'Aad u adag'][score]}
          </small>
        </span>
      )}
      {withGenerator && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            onChange(generate());
            setShow(true);
          }}
        >
          <KeyRound size={14} /> Samee password adag
        </button>
      )}
      {isNew && <small className="muted">12+ xaraf, xarfo iyo tirooyin.</small>}
    </div>
  );
}
function TemporaryPassword({
  name,
  value,
  onClose,
}: {
  name: string;
  value: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="temp-password" role="alert">
      <div>
        <b>Password ku meel gaar ah · {name}</b>
        <p>
          Hal mar kaliya ayaa la muujinayaa. Si ammaan ah u sii; marka uu galo wuxuu dooranayaa
          password u gaar ah.
        </p>
        <code>{value}</code>
      </div>
      <div className="temp-password-actions">
        <button
          className="button outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {}
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
          {copied ? 'La koobiyeeyay' : 'Koobiyee'}
        </button>
        <button className="icon-button" aria-label="Xir" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
function RolePicker({
  value,
  onChange,
  allowed,
}: {
  value: string;
  onChange: (r: string) => void;
  allowed: string[];
}) {
  return (
    <fieldset className="role-picker">
      <legend>Doorka</legend>
      {ROLES.filter((r) => allowed.includes(r)).map((r) => (
        <label key={r} className={'role-option ' + (value === r ? 'active' : '')}>
          <input
            type="radio"
            name="role"
            value={r}
            checked={value === r}
            onChange={() => onChange(r)}
          />
          <span>
            <b>{roleLabel[r]}</b>
            <small>{roleInfo[r]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
const allowedFor = (role?: string) =>
  role === 'OWNER' ? [...ROLES] : role === 'MANAGER' ? ['OPERATOR', 'RIDER'] : [];

function NewUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: any) => void;
}) {
  const { user } = useStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const allowed = allowedFor(user?.role);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: allowed.includes('OPERATOR') ? 'OPERATOR' : allowed[0],
    mode: 'temporary' as 'temporary' | 'custom',
    password: '',
    mustChangePassword: true,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog
      ref={dialog}
      className="modal user-dialog"
      onCancel={onClose}
      aria-labelledby="new-user-title"
    >
      <div className="modal-heading">
        <h2 id="new-user-title">Isticmaale cusub</h2>
        <button className="icon-button" onClick={onClose} aria-label="Xir">
          <X size={20} />
        </button>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const result = await api('admin/users', {
              method: 'POST',
              body: JSON.stringify({
                fullName: form.fullName,
                email: form.email,
                phone: form.phone,
                role: form.role,
                ...(form.mode === 'custom'
                  ? { password: form.password, mustChangePassword: form.mustChangePassword }
                  : {}),
              }),
            });
            onCreated(result);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label className="field">
            Magaca oo dhan
            <input
              required
              minLength={2}
              maxLength={100}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="field">
            Telefoon
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="field wide">
            Email (login)
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoComplete="off"
            />
          </label>
        </div>
        <RolePicker
          value={form.role}
          onChange={(role) => setForm({ ...form, role })}
          allowed={allowed}
        />
        <fieldset className="role-picker compact">
          <legend>Password-ka</legend>
          <label className={'role-option ' + (form.mode === 'temporary' ? 'active' : '')}>
            <input
              type="radio"
              checked={form.mode === 'temporary'}
              onChange={() => setForm({ ...form, mode: 'temporary' })}
            />
            <span>
              <b>Samee password ku meel gaar ah</b>
              <small>Waa la muujinayaa hal mar; qofku wuxuu beddelayaa marka uu galo.</small>
            </span>
          </label>
          <label className={'role-option ' + (form.mode === 'custom' ? 'active' : '')}>
            <input
              type="radio"
              checked={form.mode === 'custom'}
              onChange={() => setForm({ ...form, mode: 'custom' })}
            />
            <span>
              <b>Anigu dejin</b>
              <small>Adigu ku qor password-ka.</small>
            </span>
          </label>
        </fieldset>
        {form.mode === 'custom' && (
          <>
            <PasswordField
              label="Password"
              value={form.password}
              onChange={(password) => setForm({ ...form, password })}
              withGenerator
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.mustChangePassword}
                onChange={(e) => setForm({ ...form, mustChangePassword: e.target.checked })}
              />
              Ha beddelo password-ka marka ugu horreysa ee uu galo
            </label>
          </>
        )}
        {error && <Notice error={error} />}
        <div className="modal-footer">
          <button type="button" className="button outline" onClick={onClose}>
            Ka noqo
          </button>
          <button className="button" disabled={busy}>
            {busy ? 'Sug…' : 'Abuur akoonka'} <Check size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}

/** Everyone who can sign in: search, filter, add, and open a person. */
export function UsersPage() {
  const { data, error, refresh } = useData<any[]>('admin/users', 30000),
    { user } = useStore(),
    router = useRouter(),
    [q, setQ] = useState(''),
    [role, setRole] = useState(''),
    [status, setStatus] = useState(''),
    [adding, setAdding] = useState(false),
    [created, setCreated] = useState<{ name: string; password: string } | null>(null),
    [showMatrix, setShowMatrix] = useState(false);
  const rows = useMemo(
    () =>
      (data || []).filter(
        (u) =>
          (!role || u.role === role) &&
          (!status || u.status === status) &&
          `${u.fullName} ${u.email} ${u.phone || ''}`
            .toLowerCase()
            .includes(q.trim().toLowerCase()),
      ),
    [data, q, role, status],
  );
  const total = data?.length || 0,
    active = data?.filter((u) => u.status === 'ACTIVE').length || 0,
    online = data?.filter((u) => u.activeSessions > 0).length || 0,
    pending = data?.filter((u) => u.mustChangePassword && u.status === 'ACTIVE').length || 0;
  return (
    <div className="users">
      <div className="board-head">
        <div>
          <span className="mono-label">Botan · Maamulka</span>
          <h1>Isticmaalayaasha</h1>
        </div>
        <div className="row-actions">
          <button className="button outline" onClick={() => setShowMatrix(!showMatrix)}>
            <ShieldCheck size={16} /> Doorarka &amp; oggolaanshaha
          </button>
          <button className="button" onClick={() => setAdding(true)}>
            <Plus size={16} /> Ku dar isticmaale
          </button>
        </div>
      </div>
      {created && (
        <TemporaryPassword
          name={created.name}
          value={created.password}
          onClose={() => setCreated(null)}
        />
      )}
      <div className="user-kpis">
        {[
          ['Wadar', total],
          ['Firfircoon', active],
          ['Hadda gudaha', online],
          ['La hakiyey', total - active],
          ['Sugaya password', pending],
        ].map(([label, value]) => (
          <div key={label as string}>
            <span className="mono-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {showMatrix && <PermissionMatrix />}
      <div className="user-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="Raadi magac, email ama telefoon"
            aria-label="Raadi isticmaale"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="pill-row" role="group" aria-label="Doorka">
          {['', ...ROLES].map((r) => (
            <button
              key={r}
              className={'pill ' + (role === r ? 'active' : '')}
              aria-pressed={role === r}
              onClick={() => setRole(r)}
            >
              {r ? roleLabel[r] : 'Dhammaan'}
              <small>{r ? data?.filter((u) => u.role === r).length || 0 : total}</small>
            </button>
          ))}
        </div>
        <select aria-label="Xaaladda" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Xaalad kasta</option>
          <option value="ACTIVE">Firfircoon</option>
          <option value="SUSPENDED">La hakiyey</option>
        </select>
        <button className="icon-button" aria-label="Cusboonaysii" onClick={() => void refresh()}>
          <RefreshCw size={16} />
        </button>
      </div>
      {error && <Notice error={error} />}
      {!data && !error && <Loading />}
      <div className="panel user-table">
        <table>
          <thead>
            <tr>
              <th>Isticmaale</th>
              <th>Doorka</th>
              <th>Xaaladda</th>
              <th>Galitaankii u dambeeyay</th>
              <th>Hawsha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.id}
                onClick={() => router.push('/admin/users/' + u.id)}
                className={u.status === 'ACTIVE' ? '' : 'is-off'}
              >
                <td>
                  <Link
                    href={'/admin/users/' + u.id}
                    className="user-cell"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Avatar name={u.fullName} />
                    <span>
                      <b>
                        {u.fullName}
                        {u.id === user?.id && <em> (adiga)</em>}
                      </b>
                      <small>{u.email}</small>
                      {u.phone && <small>{u.phone}</small>}
                    </span>
                  </Link>
                </td>
                <td>
                  <RoleBadge role={u.role} />
                </td>
                <td>
                  <StatusBadge status={u.status} />
                  {u.mustChangePassword && u.status === 'ACTIVE' && (
                    <small className="user-flag">Sugaya password cusub</small>
                  )}
                </td>
                <td>
                  <span className={'presence ' + (u.activeSessions ? 'on' : '')}>
                    <i />{' '}
                    {u.activeSessions ? `Gudaha · ${u.activeSessions} qalab` : ago(u.lastLoginAt)}
                  </span>
                </td>
                <td className="mono">
                  {u.role === 'RIDER'
                    ? `${u.deliveriesDone} gaarsiin`
                    : ['OWNER', 'MANAGER', 'OPERATOR'].includes(u.role)
                      ? `${u.ordersTaken} dalab`
                      : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows.length && <p className="board-empty">Isticmaale lama helin.</p>}
      </div>
      {adding && (
        <NewUserDialog
          onClose={() => setAdding(false)}
          onCreated={async (result) => {
            setAdding(false);
            if (result.temporaryPassword)
              setCreated({ name: result.user.fullName, password: result.temporaryPassword });
            await refresh();
          }}
        />
      )}
    </div>
  );
}
function PermissionMatrix() {
  return (
    <div className="panel permission-matrix">
      <table>
        <thead>
          <tr>
            <th>Oggolaansho</th>
            {ROLES.map((r) => (
              <th key={r}>{roleLabel[r]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {permissions.map(([label, roles]) => (
            <tr key={label}>
              <td>{label}</td>
              {ROLES.map((r) => (
                <td key={r} aria-label={roles.includes(r) ? 'Haa' : 'Maya'}>
                  {roles.includes(r) ? (
                    <Check size={16} className="yes" />
                  ) : (
                    <span className="no">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One person: profile, role, security actions, devices and activity. */
export function UserDetail({ id }: { id: string }) {
  const { data: u, error, refresh } = useData<any>('admin/users/' + id),
    { user, toast } = useStore(),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [temp, setTemp] = useState('');
  useEffect(() => {
    if (u) setForm({ fullName: u.fullName, email: u.email, phone: u.phone || '', role: u.role });
  }, [u]);
  if (error) return <Notice error={error} />;
  if (!u || !form) return <Loading />;
  const allowed = allowedFor(user?.role);
  const dirty =
    form.fullName !== u.fullName ||
    form.email !== u.email ||
    form.phone !== (u.phone || '') ||
    form.role !== u.role;
  async function run(work: () => Promise<any>, done: string) {
    setBusy(true);
    setFailure('');
    try {
      const result = await work();
      await refresh();
      toast(done);
      return result;
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="user-page">
      <Link href="/admin/users" className="text-link">
        <ArrowLeft size={15} /> Isticmaalayaasha
      </Link>
      <div className="user-hero">
        <Avatar name={u.fullName} size={72} />
        <div>
          <h1>{u.fullName}</h1>
          <p>
            <RoleBadge role={u.role} /> <StatusBadge status={u.status} />{' '}
            <span className="muted">
              Ku biiray {ago(u.createdAt)} · Galitaan: {ago(u.lastLoginAt)}
            </span>
          </p>
        </div>
        <div className="user-stats">
          <div>
            <strong>{u.stats.ordersTaken}</strong>
            <span className="mono-label">Dalab la qaaday</span>
          </div>
          <div>
            <strong>{u.stats.deliveriesDone}</strong>
            <span className="mono-label">Gaarsiin</span>
          </div>
          <div>
            <strong>{u.stats.onTheRoad}</strong>
            <span className="mono-label">Jidka hadda</span>
          </div>
        </div>
      </div>
      {temp && <TemporaryPassword name={u.fullName} value={temp} onClose={() => setTemp('')} />}
      {failure && <Notice error={failure} />}
      {!u.manageable && (
        <div className="notice neutral">
          {u.id === user?.id ? (
            <>
              Kani waa akoonkaaga. Wax ka beddel <Link href="/account">Akoonkayga</Link>.
            </>
          ) : (
            'Isticmaalahan waad arki kartaa, laakiin ma beddeli kartid.'
          )}
        </div>
      )}
      <div className="two-columns">
        <div>
          <form
            className="panel padded"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () =>
                  api('admin/users/' + u.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      ...(form.fullName !== u.fullName ? { fullName: form.fullName } : {}),
                      ...(form.email !== u.email ? { email: form.email } : {}),
                      ...(form.phone !== (u.phone || '') ? { phone: form.phone } : {}),
                      ...(form.role !== u.role ? { role: form.role } : {}),
                    }),
                  }),
                'Isbeddelka waa la kaydiyey',
              );
            }}
          >
            <h2>Xogta</h2>
            <fieldset disabled={!u.manageable || busy} className="plain">
              <div className="form-grid">
                <label className="field">
                  Magaca oo dhan
                  <input
                    required
                    minLength={2}
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  />
                </label>
                <label className="field">
                  Telefoon
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </label>
                <label className="field wide">
                  Email (login)
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
              </div>
              {u.manageable && (
                <RolePicker
                  value={form.role}
                  onChange={(role) => setForm({ ...form, role })}
                  allowed={allowed}
                />
              )}
              {form.role !== u.role && (
                <p className="muted">
                  Beddelidda doorka waxay ka saaraysaa qofka dhammaan qalabkiisa.
                </p>
              )}
            </fieldset>
            {u.manageable && (
              <div className="row-actions">
                <button className="button" disabled={!dirty || busy}>
                  Kaydi isbeddelka
                </button>
                {dirty && (
                  <button
                    type="button"
                    className="button outline"
                    onClick={() =>
                      setForm({
                        fullName: u.fullName,
                        email: u.email,
                        phone: u.phone || '',
                        role: u.role,
                      })
                    }
                  >
                    Ka noqo
                  </button>
                )}
              </div>
            )}
          </form>
          <div className="panel padded">
            <h2>Hawlaha</h2>
            <ol className="activity">
              {u.activity.map((a: any) => (
                <li key={a.id}>
                  <span>
                    <b>{actionLabel[a.action] || a.action.replaceAll('_', ' ').toLowerCase()}</b>
                    {a.actor && a.actor.id !== u.id && <small> · {a.actor.fullName}</small>}
                  </span>
                  <time>{stamp(a.createdAt)}</time>
                </li>
              ))}
              {!u.activity.length && <li className="muted">Weli hawl lama diiwaangelin.</li>}
            </ol>
          </div>
        </div>
        <div>
          {u.manageable && (
            <div className="panel padded security-actions">
              <h2>Amniga</h2>
              <button
                className="button outline full"
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      `Password cusub oo ku meel gaar ah u samee ${u.fullName}? Dhammaan qalabkiisa waa laga saarayaa.`,
                    )
                  )
                    return;
                  const r = await run(
                    () =>
                      api('admin/users/' + u.id + '/reset-password', {
                        method: 'POST',
                        body: '{}',
                      }),
                    'Password-ka waa la reset-gareeyay',
                  );
                  if (r?.temporaryPassword) setTemp(r.temporaryPassword);
                }}
              >
                <KeyRound size={16} /> Reset password
              </button>
              <button
                className="button outline full"
                disabled={busy || !u.sessions.length}
                onClick={() =>
                  void run(
                    () =>
                      api('admin/users/' + u.id + '/sessions/revoke', {
                        method: 'POST',
                        body: '{}',
                      }),
                    'Dhammaan qalabka waa laga saaray',
                  )
                }
              >
                <LogOut size={16} /> Ka saar dhammaan qalabka
              </button>
              {u.status === 'ACTIVE' ? (
                <button
                  className="button outline danger full"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        `Ma hubtaa inaad hakinayso ${u.fullName}? Isla markiiba wuu ka baxayaa.`,
                      )
                    )
                      return;
                    void run(
                      () => api('admin/users/' + u.id + '/suspend', { method: 'POST', body: '{}' }),
                      'Waa la hakiyey',
                    );
                  }}
                >
                  <UserX size={16} /> Hakin akoonka
                </button>
              ) : (
                <button
                  className="button full"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api('admin/users/' + u.id + '/activate', { method: 'POST', body: '{}' }),
                      'Dib ayaa loo furay',
                    )
                  }
                >
                  <UserCheck size={16} /> Dib u fur akoonka
                </button>
              )}
              <p className="muted">
                Password beddel: {u.passwordChangedAt ? ago(u.passwordChangedAt) : 'weligiis'}
                {u.mustChangePassword && ' · sugaya inuu beddelo'}
              </p>
            </div>
          )}
          <Sessions
            sessions={u.sessions}
            onRevoke={
              u.manageable
                ? (sessionId) =>
                    void run(
                      () =>
                        api('admin/users/' + u.id + '/sessions/revoke', {
                          method: 'POST',
                          body: JSON.stringify({ sessionId }),
                        }),
                      'Qalabka waa laga saaray',
                    )
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
function Sessions({
  sessions,
  onRevoke,
  title = 'Qalabka uu ku jiro',
}: {
  sessions: any[];
  onRevoke?: (id: string) => void;
  title?: string;
}) {
  return (
    <div className="panel padded">
      <h2>{title}</h2>
      <ul className="sessions">
        {sessions.map((s) => {
          const d = device(s.userAgent);
          return (
            <li key={s.id}>
              {d.mobile ? <Smartphone size={20} /> : <Monitor size={20} />}
              <span>
                <b>
                  {d.label}
                  {s.current && <em> · qalabkan</em>}
                </b>
                <small>
                  Galay {ago(s.createdAt)} · dhacaya {stamp(s.expiresAt)}
                </small>
              </span>
              {onRevoke && !s.current && (
                <button className="small-button" onClick={() => onRevoke(s.id)}>
                  Ka saar
                </button>
              )}
            </li>
          );
        })}
        {!sessions.length && <li className="muted">Hadda kuma jiro qalab.</li>}
      </ul>
    </div>
  );
}

function ChangePassword({
  onDone,
  forced = false,
}: {
  onDone: () => Promise<void>;
  forced?: boolean;
}) {
  const [current, setCurrent] = useState(''),
    [next, setNext] = useState(''),
    [confirmValue, setConfirm] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <form
      className="change-password"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirmValue) return setError('Labada password isma laha');
        setBusy(true);
        setError('');
        try {
          await api('account/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: current, newPassword: next }),
          });
          setCurrent('');
          setNext('');
          setConfirm('');
          await onDone();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <PasswordField
        label={forced ? 'Password-ka ku meel gaarka ah' : 'Password-ka hadda'}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        isNew={false}
      />
      <PasswordField label="Password cusub" value={next} onChange={setNext} withGenerator />
      <label className="field">
        Ku celi password-ka cusub
        <input
          type="password"
          required
          value={confirmValue}
          autoComplete="new-password"
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && <Notice error={error} />}
      <button className="button full" disabled={busy}>
        {busy ? 'Sug…' : 'Beddel password-ka'}
      </button>
      {!forced && (
        <p className="muted">Qalabka kale oo dhan waa laga saarayaa; kan waad ku sii jiraysaa.</p>
      )}
    </form>
  );
}

/** The signed-in person's profile, password and devices. */
export function AccountPage() {
  const { data: me, error, refresh } = useData<any>('account'),
    { toast, refreshUser } = useStore(),
    [form, setForm] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  useEffect(() => {
    if (me) setForm({ fullName: me.fullName, phone: me.phone || '' });
  }, [me]);
  if (error) return <Notice error={error} />;
  if (!me || !form) return <Loading />;
  return (
    <div className="user-page">
      <div className="user-hero">
        <Avatar name={me.fullName} size={72} />
        <div>
          <span className="mono-label">Akoonkayga</span>
          <h1>{me.fullName}</h1>
          <p>
            <RoleBadge role={me.role} /> <span className="muted">{me.email}</span>
          </p>
        </div>
      </div>
      {failure && <Notice error={failure} />}
      <div className="two-columns">
        <div>
          <form
            className="panel padded"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFailure('');
              try {
                await api('account', { method: 'PATCH', body: JSON.stringify(form) });
                await Promise.all([refresh(), refreshUser()]);
                toast('Profile-ka waa la kaydiyey');
              } catch (err) {
                setFailure((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Profile</h2>
            <div className="form-grid">
              <label className="field">
                Magaca oo dhan
                <input
                  required
                  minLength={2}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </label>
              <label className="field">
                Telefoon
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>
            </div>
            <p className="muted">Email-ka iyo doorka waxaa beddeli kara maamulaha.</p>
            <button className="button" disabled={busy}>
              Kaydi
            </button>
          </form>
          <div className="panel padded">
            <h2>Password</h2>
            <p className="muted">
              Waxaa la beddelay: {me.passwordChangedAt ? ago(me.passwordChangedAt) : 'weligiis'}
            </p>
            <ChangePassword
              onDone={async () => {
                await refresh();
                toast('Password-ka waa la beddelay');
              }}
            />
          </div>
        </div>
        <Sessions
          sessions={me.sessions}
          title="Qalabkaaga"
          onRevoke={async (sessionId) => {
            try {
              await api('account/sessions/revoke', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
              });
              await refresh();
              toast('Qalabka waa laga saaray');
            } catch (err) {
              setFailure((err as Error).message);
            }
          }}
        />
      </div>
    </div>
  );
}

/** Shown instead of the app until a temporary password is replaced. */
export function ForcePasswordChange() {
  const { user, refreshUser } = useStore(),
    router = useRouter();
  return (
    <main className="login-screen">
      <section className="login-art" aria-hidden="true">
        <Wordmark />
        <p className="mono-label">Botan · Amni</p>
        <h1>
          Ku soo dhowow,
          <br />
          <em>{user?.name?.split(' ')[0]}.</em>
        </h1>
      </section>
      <div className="login-card">
        <div className="mono-label">Tallaabada koowaad</div>
        <h2>Dooro password kuu gaar ah</h2>
        <p className="muted">
          Akoonkaaga waxaa la siiyay password ku meel gaar ah. Beddel ka hor intaadan sii wadan.
        </p>
        <ChangePassword
          forced
          onDone={async () => {
            await refreshUser();
            router.replace(landing(user?.role));
          }}
        />
        <button
          className="text-link"
          onClick={async () => {
            await api('auth/logout', { method: 'POST', body: '{}' });
            await refreshUser();
            router.replace('/login');
          }}
        >
          Ka bax
        </button>
      </div>
    </main>
  );
}
