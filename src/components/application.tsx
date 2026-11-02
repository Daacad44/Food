'use client';
import { LoginPage, Loading } from './shared';
import { OrderEntry } from './order-entry';
import { OrderDetail, OrdersBoard } from './orders-board';
import {
  StaffShell,
  Dashboard,
  ResourcePage,
  Rider,
  Reports,
  Payments,
  Purchases,
  Delivery,
  SettingsPage,
  SimpleList,
} from './admin';
// Staff-only application: the login page, then the order screen.
export function Application({ path }: { path: string }) {
  if (path === '/' || path === '/login') return <LoginPage />;
  const part = path.split('/').filter(Boolean);
  let content: React.ReactNode;
  if (part[0] === 'rider') content = <Rider section={part[1] || 'assigned'} />;
  else if (part[0] !== 'admin') content = <div className="empty">Boggan lama helin.</div>;
  else if (path === '/admin') content = <Dashboard />;
  else if (part[1] === 'orders' && part[2] === 'new') content = <OrderEntry />;
  else if (part[1] === 'orders' && part[2]) content = <OrderDetail id={part[2]} />;
  else if (part[1] === 'orders') content = <OrdersBoard />;
  else if (part[1] === 'reports' || part[1] === 'finance') content = <Reports />;
  else if (part[1] === 'payments') content = <Payments />;
  else if (part[1] === 'purchases') content = <Purchases />;
  else if (part[1] === 'delivery' && !part[2]) content = <Delivery />;
  else if (part[1] === 'delivery' && part[2] === 'zones')
    content = <ResourcePage resource="zones" />;
  else if (
    ['menu', 'categories', 'modifiers', 'inventory', 'suppliers', 'expenses', 'staff'].includes(
      part[1],
    )
  )
    content = <ResourcePage resource={part[1]} />;
  else if (['audit', 'audit-logs', 'notifications'].includes(part[1]))
    content = <SimpleList kind={part[1] === 'notifications' ? 'notifications' : 'audit'} />;
  else if (part[1] === 'settings') content = <SettingsPage />;
  else content = <div className="empty">Boggan lama helin.</div>;
  return <StaffShell path={path}>{content ?? <Loading />}</StaffShell>;
}
