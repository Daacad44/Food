'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { OrderTracking, TrackOrderPage } from './order-tracking';
import {
  CustomerShell,
  Home,
  MenuPage,
  ItemPage,
  CartPage,
  Checkout,
  AuthPage,
  Account,
  InfoPage,
  Loading,
} from './customer';
import {
  StaffShell,
  Dashboard,
  OrdersPage,
  ResourcePage,
  Kitchen,
  Pos,
  Rider,
  Reports,
  Payments,
  Purchases,
  Delivery,
  SettingsPage,
  SimpleList,
  ReviewsPage,
} from './admin';
function Route({ path }: { path: string }) {
  const params = useSearchParams();
  if (
    path.startsWith('/admin') ||
    path.startsWith('/kitchen') ||
    path.startsWith('/pos') ||
    path.startsWith('/rider')
  ) {
    let content: React.ReactNode;
    const part = path.split('/').filter(Boolean);
    if (path === '/admin') content = <Dashboard />;
    else if (part[0] === 'kitchen') content = <Kitchen />;
    else if (part[0] === 'pos') content = <Pos section={part[1] || 'terminal'} />;
    else if (part[0] === 'rider') content = <Rider section={part[1] || 'assigned'} />;
    else if (part[1] === 'orders') content = <OrdersPage id={part[2]} />;
    else if (part[1] === 'reports' || part[1] === 'finance') content = <Reports />;
    else if (part[1] === 'payments') content = <Payments />;
    else if (part[1] === 'purchases') content = <Purchases />;
    else if (part[1] === 'delivery' && !part[2]) content = <Delivery />;
    else if (part[1] === 'delivery' && part[2] === 'zones')
      content = <ResourcePage resource="zones" />;
    else if (
      [
        'menu',
        'categories',
        'modifiers',
        'inventory',
        'suppliers',
        'coupons',
        'expenses',
        'staff',
        'tables',
      ].includes(part[1])
    )
      content = <ResourcePage resource={part[1]} />;
    else if (['customers', 'audit', 'audit-logs', 'notifications'].includes(part[1]))
      content = <SimpleList kind={part[1] === 'audit-logs' ? 'audit' : part[1]} />;
    else if (part[1] === 'reviews') content = <ReviewsPage />;
    else if (part[1] === 'settings') content = <SettingsPage />;
    else content = <div className="empty">Boggan lama helin.</div>;
    return <StaffShell path={path}>{content}</StaffShell>;
  }
  let content: React.ReactNode;
  if (path === '/') content = <Home />;
  else if (path === '/menu') content = <MenuPage />;
  else if (path.startsWith('/menu/')) content = <ItemPage slug={path.split('/')[2]} />;
  else if (path === '/cart') content = <CartPage />;
  else if (path === '/checkout') content = <Checkout />;
  else if (path === '/order/success')
    content = <OrderTracking success token={params.get('token') || ''} />;
  else if (path === '/track' || path === '/track-order') content = <TrackOrderPage />;
  else if (/^\/account\/orders\/[^/]+\/track$/.test(path))
    content = <OrderTracking orderId={path.split('/')[3]} />;
  else if (path.startsWith('/track/')) content = <OrderTracking token={path.split('/')[2]} />;
  else if (path === '/login') content = <AuthPage />;
  else if (path === '/register') content = <AuthPage register />;
  else if (path.startsWith('/account'))
    content = <Account section={path.split('/')[2] || 'orders'} />;
  else if (['/about', '/contact', '/faq', '/offers', '/privacy'].includes(path))
    content = <InfoPage page={path.slice(1)} />;
  else
    content = (
      <div className="empty">
        <h1>404</h1>
        <p>Boggan lama helin.</p>
      </div>
    );
  return <CustomerShell>{content}</CustomerShell>;
}
export function Application({ path }: { path: string }) {
  return (
    <Suspense fallback={<Loading />}>
      <Route path={path} />
    </Suspense>
  );
}
