'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Clock, Copy, RefreshCw, ShoppingBag, Truck } from 'lucide-react';
import { useData, useStore } from './store';
import { Loading, Notice, statusLabel } from './customer';
import { formatMoney } from '@/lib/domain';
import { deliverySteps, parseTrackingToken, readSavedOrder, type SavedOrder } from '@/lib/tracking';

export function TrackOrderPage() {
  const { tr, user } = useStore(),
    router = useRouter();
  const [value, setValue] = useState(''),
    [error, setError] = useState(''),
    [saved, setSaved] = useState<SavedOrder | null>(null);
  useEffect(() => {
    try {
      setSaved(readSavedOrder(sessionStorage));
    } catch {
      setSaved(null);
    }
  }, []);
  return (
    <section className="section narrow track-landing">
      <div className="page-intro">
        <div className="success-mark">
          <Truck size={30} />
        </div>
        <div className="eyebrow">FROM OUR KITCHEN TO YOUR DOOR</div>
        <h1>{tr('La soco dalabkaaga', 'Track your order')}</h1>
        <p>
          {tr(
            'Geli tracking link-ga ama koodhka laguu siiyey markii aad dalbatay.',
            'Paste the private tracking link or code you received at checkout.',
          )}
        </p>
      </div>
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          const token = parseTrackingToken(value);
          if (!token) {
            setError(
              tr(
                'Geli tracking link ama koodh sax ah. Lambarka dalabka keliya kuma filna.',
                'Enter a valid tracking link or code. An order number alone is not enough.',
              ),
            );
            return;
          }
          router.push('/track/' + token);
        }}
      >
        <label className="field">
          {tr('Tracking link ama koodh', 'Tracking link or code')}
          <input
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            value={value}
            maxLength={2000}
            onChange={(event) => {
              setValue(event.target.value);
              setError('');
            }}
            placeholder="https://food.daljir.tech/track/…"
          />
        </label>
        {error && <Notice error={error} />}
        <button className="button full">
          {tr('Raadi dalabkayga', 'Find my order')}
          <ArrowRight size={17} />
        </button>
        <p className="muted">
          {tr(
            'Tracking link-gaaga si gaar ah u hay. Telefoon ama cinwaan laguma muujiyo tracking-ka.',
            'Keep your link private. Tracking never shows your phone number or address.',
          )}
        </p>
      </form>
      {saved && (
        <div className="form-card saved-order">
          <div>
            <small>
              {tr('Dalabkii ugu dambeeyey ee tab-kan', 'Last order in this browser tab')}
            </small>
            <h2>{saved.orderNumber}</h2>
          </div>
          <Link className="button outline" href={'/track/' + saved.token}>
            {tr('Sii wad tracking', 'Resume tracking')}
            <Truck size={16} />
          </Link>
          <button
            className="text-link"
            onClick={() => {
              try {
                sessionStorage.removeItem('botan-last-order');
              } catch {}
              setSaved(null);
            }}
          >
            {tr('Ka saar tab-kan', 'Forget on this tab')}
          </button>
        </div>
      )}
      <div className="tracking-help">
        <Link className="text-link" href={user?.kind === 'customer' ? '/account/orders' : '/login'}>
          {tr('Dalabyada akoonkayga', 'My account orders')}
          <ArrowRight size={15} />
        </Link>
        <Link className="text-link" href="/menu">
          {tr('Eeg menu-ga', 'Browse the menu')}
          <ShoppingBag size={15} />
        </Link>
      </div>
      <p className="muted">
        {tr(
          'Haddii link-gu kaa lumay, gal akoonkii aad ku dalbatay ama la xiriir maqaayadda.',
          'Lost your link? Sign in to the account used for your order or contact the restaurant.',
        )}{' '}
        <Link href="/contact">{tr('Nala soo xiriir', 'Contact us')}</Link>
      </p>
    </section>
  );
}

export function OrderTracking({
  token,
  orderId,
  success = false,
}: {
  token?: string;
  orderId?: string;
  success?: boolean;
}) {
  const { tr, toast } = useStore();
  const normalizedToken = parseTrackingToken(token || '');
  const path = orderId
    ? `customers/me/orders/${orderId}/track`
    : normalizedToken
      ? `orders/track/${normalizedToken}`
      : null;
  const { data: order, error, loading, refresh } = useData(path, 5000);
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    if (order && !error)
      setUpdated(new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Mogadishu' }));
  }, [order, error]);
  const stopped = order && ['CANCELLED', 'REJECTED'].includes(order.status);
  const steps = deliverySteps.filter(
    (step) => order?.type === 'DELIVERY' || step.status !== 'OUT_FOR_DELIVERY',
  );
  const current = steps.findIndex((step) => step.status === order?.status);
  return (
    <section className="section narrow">
      <div className="page-intro">
        <div className="success-mark">
          <Truck size={30} />
        </div>
        <div className="eyebrow">
          {success ? 'THANK YOU FOR CHOOSING BOTAN' : 'YOUR ORDER, STEP BY STEP'}
        </div>
        <h1>
          {success
            ? tr('Dalabka waa la helay!', 'Your order is in!')
            : tr('La soco dalabkaaga', 'Track your order')}
        </h1>
        <p>
          {tr(
            'La soco xaqiijinta, diyaarinta iyo gaarsiinta dalabkaaga.',
            'Follow your order from confirmation through preparation and delivery.',
          )}
        </p>
      </div>
      {!path && (
        <Notice
          error={tr(
            'Tracking link-gu ma saxna. Ku noqo bogga raadinta dalabka.',
            'This tracking link is invalid. Return to the order tracking page.',
          )}
        />
      )}
      {error && (
        <Notice
          error={
            tr(
              'Tracking-ka lama cusboonaysiin karo hadda. Hubi link-ga oo mar kale isku day.',
              'Tracking could not update. Check your link and try again.',
            ) +
            ' ' +
            error
          }
        />
      )}
      {loading && <Loading />}
      {order && (
        <div className="form-card tracking-card">
          <div className="section-heading">
            <div>
              <small>
                {order.type === 'DELIVERY'
                  ? tr('Dalab delivery ah', 'Delivery order')
                  : order.type === 'PICKUP'
                    ? tr('Soo qaado', 'Pickup order')
                    : tr('Dalab miis', 'Dine-in order')}
              </small>
              <h2>{order.orderNumber}</h2>
            </div>
            <span className={'badge ' + order.status}>
              {tr(statusLabel[order.status] || order.status, order.status.replaceAll('_', ' '))}
            </span>
          </div>
          <div className="tracking-live" role="status">
            <span className={error ? 'offline-dot' : 'status-dot'} />
            <span>
              {error
                ? tr('Xogtii ugu dambeysay ee la helay', 'Showing the last successful update')
                : tr('Cusboonaysiin 5 ilbiriqsi kasta', 'Updates every 5 seconds')}
              {updated && ` · ${updated} EAT`}
            </span>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              aria-label={tr('Cusboonaysii tracking', 'Refresh tracking')}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          {stopped ? (
            <div className="notice">
              {tr(
                'Dalabkan waa la joojiyey ama la diiday. La xiriir maqaayadda haddii aad u baahan tahay caawimaad.',
                'This order was cancelled or rejected. Contact the restaurant if you need help.',
              )}
            </div>
          ) : (
            <ol
              className="delivery-progress"
              aria-label={tr('Marxaladaha dalabka', 'Order progress')}
            >
              {steps.map((step, index) => (
                <li
                  key={step.status}
                  className={index < current ? 'done' : index === current ? 'current' : ''}
                  aria-current={index === current ? 'step' : undefined}
                >
                  <span>
                    {index < current ? (
                      <Check size={16} />
                    ) : index === current ? (
                      <Clock size={16} />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <b>
                      {step.status === 'COMPLETED' && order.type !== 'DELIVERY'
                        ? tr('La dhammeeyey', 'Completed')
                        : tr(step.so, step.en)}
                    </b>
                    {index === current && <small>{tr('Marxaladda hadda', 'Current step')}</small>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {order.delivery && !stopped && (
            <div className="delivery-details">
              <Truck size={22} />
              <div>
                <b>
                  {order.delivery.deliveredAt
                    ? tr('Gaarsiinta waa la xaqiijiyey', 'Delivery confirmed')
                    : order.delivery.pickedUpAt
                      ? tr('Rider-ku wuu qaaday cuntada', 'Your rider has collected the food')
                      : order.delivery.assignedAt
                        ? tr('Rider ayaa loo qoondeeyey', 'A rider has been assigned')
                        : tr('Rider ayaa la sugaa', 'Waiting for rider assignment')}
                </b>
                <p>
                  {order.delivery.deliveredAt
                    ? new Date(order.delivery.deliveredAt).toLocaleString('en-GB', {
                        timeZone: 'Africa/Mogadishu',
                      })
                    : tr(
                        'Xaaladda waxaa cusboonaysiiya maqaayadda iyo rider-ka. GPS live ah lama bixiyo.',
                        'Status is updated by the restaurant and rider. Live GPS location is not provided.',
                      )}
                </p>
              </div>
            </div>
          )}
          <h3>{tr('Dalabkaaga', 'Your order')}</h3>
          {order.items.map((item: any, index: number) => (
            <div className="summary-row" key={index}>
              <span>
                {item.quantity} × {item.nameSnapshot}
              </span>
              <b>{formatMoney(item.lineTotal)}</b>
            </div>
          ))}
          <div className="summary-row total">
            <span>Total</span>
            <b>{formatMoney(order.total)}</b>
          </div>
          <div className="summary-row">
            <span>{tr('Lacag-bixinta', 'Payment')}</span>
            <span className="badge">{order.paymentStatus}</span>
          </div>
          <details className="tracking-history">
            <summary>{tr('Taariikhda dalabka', 'Order activity')}</summary>
            <div className="timeline">
              {order.statusEvents.map((event: any, index: number) => (
                <div key={index}>
                  <span>
                    <Check size={13} />
                  </span>
                  <div>
                    <b>
                      {tr(
                        statusLabel[event.toStatus] || event.toStatus,
                        event.toStatus.replaceAll('_', ' '),
                      )}
                    </b>
                    <small>
                      {new Date(event.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Africa/Mogadishu',
                      })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </details>
          {token && (
            <div className="tracking-actions">
              <Link className="button" href={'/track/' + token}>
                {tr('Fur tracking link', 'Open tracking link')}
              </Link>
              <button
                className="button outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.origin + '/track/' + token);
                    toast(tr('Tracking link waa la koobiyeeyey', 'Tracking link copied'));
                  } catch {
                    toast(
                      tr(
                        'Link-ga ka koobiyee address bar-ka browser-ka.',
                        'Copy the link from your browser address bar.',
                      ),
                    );
                  }
                }}
              >
                <Copy size={15} />
                {tr('Koobiyee link-ga', 'Copy link')}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="tracking-help">
        <Link className="text-link" href="/track">
          ← {tr('Raadi dalab kale', 'Find another order')}
        </Link>
        <Link className="text-link" href="/menu">
          {tr('Eeg menu-ga', 'Browse menu')}
          <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}
