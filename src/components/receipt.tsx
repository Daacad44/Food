'use client';
import { useEffect } from 'react';
import { formatMoney, paymentMethodLabel } from '@/lib/domain';

const when = (d: string) =>
  new Date(d).toLocaleString('en-GB', {
    timeZone: 'Africa/Mogadishu',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
/** 80 mm thermal-printer receipt. Hidden on screen; only it is printed. */
export function Receipt({ order, restaurant }: { order: any; restaurant?: any }) {
  const payment = order.payments?.[0];
  return (
    <div className="print-receipt" aria-hidden="true">
      <h1>{restaurant?.name || 'Botan Restaurant'}</h1>
      {restaurant?.phone && <p>{restaurant.phone}</p>}
      {restaurant?.address && <p>{restaurant.address}</p>}
      <hr />
      <p>
        <b>{order.orderNumber}</b>
      </p>
      <p>{when(order.createdAt)}</p>
      <p>
        {order.guestName} · {order.guestPhone}
      </p>
      <p>{order.deliveryAddress}</p>
      {order.delivery?.rider && <p>Darawal: {order.delivery.rider.fullName}</p>}
      <hr />
      <table>
        <tbody>
          {order.items.map((i: any) => (
            <tr key={i.id}>
              <td>
                {i.quantity}× {i.nameSnapshot}
                {i.modifiers?.length > 0 && (
                  <small>{i.modifiers.map((m: any) => m.nameSnapshot).join(', ')}</small>
                )}
              </td>
              <td>{formatMoney(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr>
            <td>Sub total</td>
            <td>{formatMoney(order.subtotal)}</td>
          </tr>
          {Number(order.discountAmount) > 0 && (
            <tr>
              <td>Discount</td>
              <td>−{formatMoney(order.discountAmount)}</td>
            </tr>
          )}
          {Number(order.taxAmount) > 0 && (
            <tr>
              <td>VAT</td>
              <td>{formatMoney(order.taxAmount)}</td>
            </tr>
          )}
          <tr>
            <td>Delivery</td>
            <td>{formatMoney(order.deliveryFee)}</td>
          </tr>
          <tr className="receipt-total">
            <td>Total</td>
            <td>{formatMoney(order.total)}</td>
          </tr>
        </tbody>
      </table>
      <hr />
      <p>
        {payment ? paymentMethodLabel[payment.method] || payment.method : 'Cash'} ·{' '}
        {order.paymentStatus === 'PAID' ? 'La bixiyey' : 'Lama bixin'}
        {payment?.providerReference ? ` · ${payment.providerReference}` : ''}
      </p>
      {order.notes && <p>Faallo: {order.notes}</p>}
      <p className="receipt-thanks">Mahadsanid!</p>
    </div>
  );
}
/** Prints `order` once it is rendered, then calls `done`. */
export function PrintOnce({
  order,
  restaurant,
  done,
}: {
  order: any;
  restaurant?: any;
  done: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      done();
    }, 50);
    return () => clearTimeout(t);
  }, [order, done]);
  return <Receipt order={order} restaurant={restaurant} />;
}
