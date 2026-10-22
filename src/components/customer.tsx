'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  Plus,
  Minus,
  Clock,
  MapPin,
  Flame,
  Leaf,
  Star,
  Check,
  Truck,
  ShieldCheck,
  ChefHat,
  Search,
  SlidersHorizontal,
  X,
  Menu as MenuIcon,
  Globe,
  User,
  Phone,
  Mail,
  Instagram,
} from 'lucide-react';
import { api, useData, useStore, type CartLine } from './store';
import { formatMoney } from '@/lib/domain';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand ${light ? 'light' : ''}`} aria-label="Botan Restaurant home">
      <span className="brand-icon">
        <Leaf size={24} />
      </span>
      <span>
        botan<span className="brand-dot">.</span>
        <small>RESTAURANT & KITCHEN</small>
      </span>
    </Link>
  );
}
export function CustomerShell({ children }: { children: React.ReactNode }) {
  const { cart, user, tr, locale, toggleLocale } = useStore(),
    [open, setOpen] = useState(false);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  return (
    <>
      <div className="announcement">
        <span>
          {tr(
            'Cunto cusub. Dhadhan dhab ah. Maalin kasta.',
            'Fresh food. Real flavour. Every day.',
          )}
        </span>
        <span>
          <MapPin size={13} /> Mogadishu <span className="announcement-divider">|</span>{' '}
          <Phone size={12} /> +252 61 000 0000
        </span>
      </div>
      <header className="customer-header">
        <Brand />
        <nav className={open ? 'nav open' : 'nav'}>
          <Link href="/" onClick={() => setOpen(false)}>
            {tr('Bogga hore', 'Home')}
          </Link>
          <Link href="/menu" onClick={() => setOpen(false)}>
            {tr('Menu-ga', 'Our menu')}
          </Link>
          <Link href="/offers" onClick={() => setOpen(false)}>
            {tr('Dalabyada gaarka ah', 'Special offers')} <span className="nav-badge">10%</span>
          </Link>
          <Link href="/about" onClick={() => setOpen(false)}>
            {tr('Nagu saabsan', 'Our story')}
          </Link>
          <Link href="/contact" onClick={() => setOpen(false)}>
            {tr('Nala soo xiriir', 'Contact')}
          </Link>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button language"
            onClick={toggleLocale}
            aria-label="Change language"
          >
            <Globe size={16} />
            {locale.toUpperCase()}
          </button>
          <Link
            className="icon-button account-icon"
            aria-label="Account"
            href={user?.kind === 'staff' ? '/admin' : user ? '/account' : '/login'}
          >
            <User size={20} />
          </Link>
          <Link href="/cart" className="bag-button">
            <ShoppingBag size={18} />
            <span>{tr('Dambiisha', 'My bag')}</span>
            <b>{count}</b>
          </Link>
          <button
            className="icon-button mobile-nav"
            onClick={() => setOpen(!open)}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </button>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="footer-top">
          <div>
            <Brand light />
            <p>
              {tr(
                'Dhadhan aad jeceshahay. Meel aad ku soo laabato.',
                'Food to fall in love with. A place to come back to.',
              )}
            </p>
            <div className="socials">
              <span>
                <Instagram size={18} />
              </span>
              <span>
                <Leaf size={18} />
              </span>
            </div>
          </div>
          <div>
            <h4>{tr('Soo booqo', 'Explore')}</h4>
            <Link href="/menu">Menu</Link>
            <Link href="/about">Our story</Link>
            <Link href="/offers">Special offers</Link>
          </div>
          <div>
            <h4>{tr('Waan ku caawinaynaa', 'Here to help')}</h4>
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/account/orders">My orders</Link>
            <Link href="/privacy">Privacy & terms</Link>
          </div>
          <div>
            <h4>{tr('Nala soo xiriir', 'Visit Botan')}</h4>
            <p>Mogadishu, Somalia</p>
            <p>+252 61 000 0000</p>
            <p>07:00 – 23:30 · Africa/Mogadishu</p>
            <Link href="/login?staff=1">
              Staff portal <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Botan Restaurant</span>
          <span>Made with care. Served with love.</span>
          <span>
            Cash on delivery <ShieldCheck size={14} />
          </span>
        </div>
      </footer>
    </>
  );
}
export function Home() {
  const { tr } = useStore(),
    { data: items, error } = useData<any[]>('menu/items');
  const { data: reviews } = useData<any[]>('reviews');
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> {tr('JIKADA BOTAN AYAA KU SOO DHAWEYNAYSA', 'WELCOME TO THE BOTAN KITCHEN')}
          </div>
          <h1>
            {tr('Cunto fiican.', 'Good food.')}
            <br />
            {tr('Dareen', 'Good')} <em>{tr('fiican.', 'mood.')}</em>
          </h1>
          <p>
            {tr(
              'Dhadhan Soomaali oo dhab ah, waxyaabo cusub iyo jacayl saxan kasta ku jira. Cuntada aad jeceshahay, albaabkaaga laguugu keeno.',
              'Honest ingredients. A little Somali soul. A whole lot of love. Your favourite comfort food, delivered to your door.',
            )}
          </p>
          <div className="hero-buttons">
            <Link className="button" href="/menu">
              {tr('Eeg menu-ga', 'Explore our menu')} <ArrowUpRight size={19} />
            </Link>
            <Link href="/about" className="text-link">
              {tr('Sheekadeenna', 'Our story')} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack">
              <span>AM</span>
              <span>HK</span>
              <span>FA</span>
            </div>
            <div>
              <div className="stars">FRESH. EVERY DAY.</div>
              <small>
                {tr(
                  'Jacaylka cuntada ayaa na mideeya',
                  'Bringing people together, one plate at a time',
                )}
              </small>
            </div>
          </div>
        </div>
        <div className="hero-art">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="hero-scribble">
            freshly made,
            <br />
            <em>just for you.</em>
          </span>
          <div className="hero-food">
            <img
              src="/images/biryani.jpg"
              alt="Saxan cunto cusub oo Botan ah"
              fetchPriority="high"
            />
          </div>
          <div className="floating-label fresh">
            <span>
              <Leaf size={22} />
            </span>
            <div>
              <b>100% fresh</b>
              <small>Always. No shortcuts.</small>
            </div>
          </div>
          <div className="floating-label delivery">
            <span>
              <Truck size={23} />
            </span>
            <div>
              <b>Made to order</b>
              <small>Good things, on their way.</small>
            </div>
            <Check size={15} />
          </div>
          <span className="decorative-star">✳</span>
        </div>
      </section>
      <section className="benefit-strip">
        <span>
          <Leaf /> {tr('Waxyaabo cusub oo tayo leh', 'Fresh, quality ingredients')}
        </span>
        <span>
          <ChefHat /> {tr('Jacayl lagu diyaariyey', 'Made with a little love')}
        </span>
        <span>
          <Truck /> {tr('Albaabkaaga laguugu keeno', 'Delivered to your doorstep')}
        </span>
        <span>
          <ShieldCheck /> {tr('Lacag bixi markaad hesho', 'Pay when it arrives')}
        </span>
      </section>
      <section className="section menu-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A LITTLE SOMETHING FOR EVERY CRAVING</div>
            <h2>{tr('Maxaad maanta rabtaa?', 'What are you craving?')}</h2>
          </div>
          <Link href="/menu" className="text-link">
            {tr('Menu-ga oo dhan', 'View full menu')} <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="category-tiles">
          {[
            ['signature', 'Saxiixa Botan', 'Our signatures', '🍽'],
            ['grill', 'Dabka & Grill', 'From the grill', '🔥'],
            ['bowls', 'Bariis & Bowls', 'Bowls & comfort', '🥗'],
            ['drinks', 'Cabitaanno', 'Sip something good', '🥭'],
          ].map(([slug, so, en, emoji]) => (
            <Link href={'/menu?category=' + slug} key={slug} className="category-tile">
              <span>{emoji}</span>
              <b>{tr(so, en)}</b>
              <ArrowUpRight size={18} />
            </Link>
          ))}
        </div>
        <div className="section-heading popular-heading">
          <div>
            <div className="eyebrow">
              <Flame size={14} /> THE TABLE FAVOURITES
            </div>
            <h2>{tr('Kuwa loogu jecel yahay', 'A few crowd favourites')}</h2>
            <p>
              {tr(
                'Cuntooyinkii aad jeclaan doonto, mar kasta.',
                'The dishes you come back for. And back for again.',
              )}
            </p>
          </div>
          <span className="handwritten">a good place to start ↙</span>
        </div>
        {error ? (
          <Notice error={error} />
        ) : (
          <div className="food-grid">
            {items
              ?.filter((i) => i.isFeatured)
              .slice(0, 4)
              .map((i) => (
                <FoodCard key={i.id} item={i} />
              ))}
            {!items && <Loading />}
          </div>
        )}
      </section>
      <section className="offer-banner section">
        <div>
          <div className="eyebrow">YOUR NEXT GOOD MEAL STARTS HERE</div>
          <h2>
            {tr('Wax yar oo dheeraad ah.', 'A little more flavour.')}
            <br />
            <em>{tr('Qiimo yar.', 'A little less spend.')}</em>
          </h2>
          <p>
            {tr(
              'Hel 10% qiimo-dhimis dalab ka badan $10. Isticmaal BOTAN10.',
              'Enjoy 10% off orders over $10. Use BOTAN10 at checkout.',
            )}
          </p>
          <Link className="button gold" href="/menu">
            {tr('Hadda dalbo', 'Order something good')} <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="offer-stamp">
          <span>A TREAT FROM BOTAN</span>
          <strong>
            10<span>%</span>
          </strong>
          <b>OFF YOUR NEXT ORDER</b>
          <small>Code: BOTAN10 · Max $5 off</small>
        </div>
        <span className="banner-star">✳</span>
      </section>
      <section className="section how-section">
        <div className="eyebrow">FROM OUR KITCHEN TO YOUR TABLE</div>
        <h2>{tr('Saddex tallaabo. Hal cunto fiican.', 'Three steps. One very good meal.')}</h2>
        <div className="how-grid">
          {[
            [
              '01',
              'Dooro waxa aad jeceshahay',
              'Find your favourite',
              'Eeg menu-ga oo dooro cuntadaada.',
              'Explore the menu. Follow your cravings.',
            ],
            [
              '02',
              'Dalbo si fudud',
              'Make it yours',
              'Dooro delivery ama pickup, kadib xaqiiji.',
              'Choose delivery or pickup. We’ll take it from here.',
            ],
            [
              '03',
              'Ku raaxayso',
              'Sit back. Dig in.',
              'Waxaan kuu diyaarinaynaa cunto cusub.',
              'Fresh from our kitchen. Ready for your table.',
            ],
          ].map(([n, so, en, dso, den]) => (
            <div key={n}>
              <span className="step-number">{n}</span>
              <h3>{tr(so, en)}</h3>
              <p>{tr(dso, den)}</p>
            </div>
          ))}
        </div>
      </section>
      {reviews && reviews.length > 0 && (
        <section className="section reviews-section">
          <div className="eyebrow">FROM OUR CUSTOMERS</div>
          <h2>{tr('Erayo miiskeenna ka yimid', 'Good food. Kind words.')}</h2>
          <div className="reviews-grid">
            {reviews.map((r) => (
              <blockquote className="form-card" key={r.id}>
                <div className="stars" aria-label={r.rating + ' out of 5'}>
                  {'★'.repeat(r.rating)}
                </div>
                <p>{r.comment}</p>
                <b>{r.name}</b>
              </blockquote>
            ))}
          </div>
        </section>
      )}
      <section className="visit-section">
        <div className="visit-image">
          <img src="/images/rice.jpg" alt="Fresh rice from the kitchen" loading="lazy" />
        </div>
        <div>
          <div className="eyebrow">MORE THAN A MEAL</div>
          <h2>
            {tr('Meel aad ku dareento', 'Pull up a chair.')}
            <br />
            <em>{tr('inaad guriga joogto.', 'You’re home.')}</em>
          </h2>
          <p>
            {tr(
              'Botan waa meel cuntada wanaagsan iyo dadka wanaagsan ay ku kulmaan. Nala wadaag waqti fiican iyo dhadhan aad xasuusan doonto.',
              'At Botan, good food has a way of bringing people together. Come for the flavour. Stay for the feeling.',
            )}
          </p>
          <Link href="/about" className="text-link">
            {tr('Baro Botan', 'Get to know Botan')} <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span />
      {'Soo dejinaya…'}
    </div>
  );
}
export function Notice({ error }: { error: string }) {
  return (
    <div className="notice" role="alert">
      {error}
    </div>
  );
}
export function FoodCard({ item }: { item: any }) {
  const { add, tr } = useStore();
  return (
    <article className="food-card">
      <Link href={'/menu/' + item.slug} className="food-image">
        <img src={item.imageUrl || '/food-placeholder.svg'} alt={item.name} loading="lazy" />
        {item.isFeatured && (
          <span className="food-tag">
            <Flame size={12} /> {tr('La jecel yahay', 'A favourite')}
          </span>
        )}
        {!item.isAvailable && (
          <span className="unavailable">{tr('Waa dhammaaday', 'Sold out')}</span>
        )}
      </Link>
      <div className="food-info">
        <div className="food-category">
          {item.category?.name}
          <span>
            <Clock size={11} /> {item.preparationMinutes} min
          </span>
        </div>
        <Link href={'/menu/' + item.slug}>
          <h3>{item.name}</h3>
        </Link>
        <p>{item.description}</p>
        <div className="food-bottom">
          <b>{formatMoney(item.basePrice)}</b>
          {item.modifierGroups?.length ? (
            <Link
              className="add-button"
              aria-label={'Customize ' + item.name}
              href={'/menu/' + item.slug}
            >
              <Plus size={18} />
            </Link>
          ) : (
            <button
              className="add-button"
              disabled={!item.isAvailable}
              aria-label={'Add ' + item.name}
              onClick={() =>
                add({
                  key: item.id,
                  menuItemId: item.id,
                  name: item.name,
                  price: Number(item.basePrice),
                  imageUrl: item.imageUrl,
                  quantity: 1,
                  modifierOptionIds: [],
                  modifierNames: [],
                  specialInstructions: '',
                })
              }
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export function MenuPage() {
  const { tr } = useStore(),
    params = useSearchParams(),
    [category, setCategory] = useState(params.get('category') || 'all'),
    [search, setSearch] = useState(''),
    { data: items, error } = useData<any[]>('menu/items'),
    { data: categories } = useData<any[]>('menu/categories');
  useEffect(() => {
    const token = params.get('table');
    if (token) sessionStorage.setItem('botan-table-token', token);
  }, [params]);
  return (
    <section className="section">
      {params.get('table') && (
        <div className="notice neutral">
          Welcome to your Botan table. Choose your food, then select dine-in at checkout.
        </div>
      )}
      <div className="page-intro">
        <div className="eyebrow">FRESH FROM OUR KITCHEN</div>
        <h1>{tr('Wax kuu dhadhama.', 'Find your next favourite.')}</h1>
        <p>
          {tr(
            'Cunto cusub, si taxaddar leh loo diyaariyey. Wax kasta oo aad rabto.',
            'Fresh ingredients. Familiar comforts. Something for every craving.',
          )}
        </p>
      </div>
      <div className="menu-toolbar">
        <div className="tabs">
          <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
            {tr('Dhammaan', 'All dishes')}
          </button>
          {categories?.map((c) => (
            <button
              key={c.id}
              className={category === c.slug ? 'active' : ''}
              onClick={() => setCategory(c.slug)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Raadi cunto…', 'Search dishes…')}
            aria-label="Search menu"
          />
        </label>
      </div>
      {error && <Notice error={error} />}
      <div className="food-grid">
        {items
          ?.filter(
            (i) =>
              (category === 'all' || i.category.slug === category) &&
              `${i.name} ${i.description}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((i) => (
            <FoodCard key={i.id} item={i} />
          ))}
      </div>
      {!items && !error && <Loading />}
      {items &&
        !items.some(
          (i) =>
            (category === 'all' || i.category.slug === category) &&
            i.name.toLowerCase().includes(search.toLowerCase()),
        ) && <p className="empty">{tr('Cunto lama helin.', 'No matching dishes.')}</p>}
    </section>
  );
}
export function ItemPage({ slug }: { slug: string }) {
  const { data: item, error } = useData('menu/items/' + slug),
    { add, tr, toast } = useStore(),
    [selected, setSelected] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [notes, setNotes] = useState('');
  if (error) return <Notice error={error} />;
  if (!item) return <Loading />;
  const options = item.modifierGroups
      .flatMap((g: any) => g.group.options)
      .filter((o: any) => selected.includes(o.id)),
    price =
      Number(item.basePrice) + options.reduce((s: number, o: any) => s + Number(o.priceDelta), 0);
  return (
    <section className="section item-detail">
      <div className="item-photo">
        <img src={item.imageUrl || '/food-placeholder.svg'} alt={item.name} />
      </div>
      <div>
        <Link className="text-link" href="/menu">
          ← {tr('Ku noqo menu-ga', 'Back to menu')}
        </Link>
        <div className="eyebrow">{item.category.name}</div>
        <h1>{item.name}</h1>
        <p className="lead">{item.description}</p>
        <div className="detail-price">
          {formatMoney(item.basePrice)}{' '}
          <span>
            <Clock size={16} /> {item.preparationMinutes} min
          </span>
        </div>
        {item.modifierGroups.map(({ group }: any) => (
          <fieldset key={group.id}>
            <legend>
              {group.name}{' '}
              <small>
                ({group.minSelect}–{group.maxSelect})
              </small>
            </legend>
            {group.options.map((o: any) => (
              <label className="check-row" key={o.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked ? [...old, o.id] : old.filter((id) => id !== o.id),
                    )
                  }
                />
                <span>{o.name}</span>
                <b>+{formatMoney(o.priceDelta)}</b>
              </label>
            ))}
          </fieldset>
        ))}
        <label className="field">
          {tr('Tilmaamo gaar ah', 'Special instructions')}
          <textarea
            value={notes}
            maxLength={300}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('Tusaale: basbaas yar', 'For example: easy on the chilli')}
          />
        </label>
        <div className="item-actions">
          <Quantity value={quantity} onChange={setQuantity} />
          <button
            className="button"
            disabled={!item.isAvailable}
            onClick={() => {
              for (const { group } of item.modifierGroups) {
                const n = group.options.filter((o: any) => selected.includes(o.id)).length;
                if (
                  n < Math.max(group.minSelect, group.isRequired ? 1 : 0) ||
                  n > group.maxSelect
                ) {
                  toast(`${group.name}: ${group.minSelect}–${group.maxSelect}`);
                  return;
                }
              }
              add({
                key: item.id + selected.slice().sort().join('') + notes,
                menuItemId: item.id,
                name: item.name,
                price,
                imageUrl: item.imageUrl,
                quantity,
                modifierOptionIds: selected,
                modifierNames: options.map((o: any) => o.name),
                specialInstructions: notes,
              });
            }}
          >
            {tr('Ku dar dambiisha', 'Add to bag')} · {formatMoney(price * quantity)}{' '}
            <ShoppingBag size={17} />
          </button>
        </div>
        <p className="muted">
          <Leaf size={14} />{' '}
          {tr(
            'Qiimaha ugu dambeeya waxaa xaqiijiya checkout-ka.',
            'Final price is confirmed at checkout.',
          )}
        </p>
      </div>
    </section>
  );
}
export function Quantity({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="quantity">
      <button aria-label="Decrease quantity" onClick={() => onChange(Math.max(0, value - 1))}>
        <Minus size={14} />
      </button>
      <b>{value}</b>
      <button
        aria-label="Increase quantity"
        disabled={value >= 30}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
export function CartPage() {
  const { cart, quantity, tr } = useStore();
  return (
    <section className="section">
      <div className="page-intro">
        <div className="eyebrow">SOMETHING GOOD IS ON THE WAY</div>
        <h1>{tr('Dambiishaada', 'Your good food bag')}</h1>
      </div>
      {!cart.length ? (
        <div className="empty">
          <ShoppingBag size={44} />
          <h2>{tr('Dambiishu way madhan tahay', 'Your bag is feeling a little empty')}</h2>
          <p>{tr('Ku dar wax aad jeceshahay.', 'Let’s find you something delicious.')}</p>
          <Link href="/menu" className="button">
            {tr('Eeg menu-ga', 'Explore the menu')} <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="checkout-grid">
          <div>
            {cart.map((i) => (
              <div className="cart-line" key={i.key}>
                <img src={i.imageUrl || '/food-placeholder.svg'} alt={i.name} />
                <div>
                  <h3>{i.name}</h3>
                  <p>{i.modifierNames.join(', ')}</p>
                  <small>{i.specialInstructions}</small>
                  <Quantity value={i.quantity} onChange={(n) => quantity(i.key, n)} />
                </div>
                <b>{formatMoney(i.price * i.quantity)}</b>
                <button
                  className="icon-button"
                  aria-label={'Remove ' + i.name}
                  onClick={() => quantity(i.key, 0)}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </div>
          <div className="summary-card">
            <h2>{tr('Dalabkaaga', 'Your order')}</h2>
            <div className="summary-row">
              <span>Subtotal</span>
              <b>{formatMoney(cart.reduce((s, i) => s + i.price * i.quantity, 0))}</b>
            </div>
            <p className="muted">
              {tr(
                'Delivery, tax iyo qiimo-dhimista waxaa lagu xisaabiyaa checkout.',
                'Delivery, tax and discounts are calculated at checkout.',
              )}
            </p>
            <Link href="/checkout" className="button full">
              {tr('Sii wad checkout', 'Continue to checkout')} <ArrowRight size={17} />
            </Link>
            <Link href="/menu" className="text-link centered">
              {tr('Wax kale ku dar', 'Add something else')}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
export function Checkout({ pos = false }: { pos?: boolean }) {
  const { cart, clear, user, tr, toast } = useStore(),
    router = useRouter(),
    { data: zones } = useData<any[]>('delivery/zones'),
    { data: tables } = useData<any[]>(pos ? 'pos/tables' : null);
  const [form, setForm] = useState({
      guestName: '',
      guestPhone: '',
      type: pos ? 'DINE_IN' : 'DELIVERY',
      deliveryAddress: '',
      zoneId: '',
      tableId: '',
      couponCode: '',
      notes: '',
    }),
    [quote, setQuote] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(''),
    [tableToken, setTableToken] = useState('');
  useEffect(() => {
    setKey(crypto.randomUUID());
    const token = sessionStorage.getItem('botan-table-token');
    if (token && !pos) {
      setTableToken(token);
      setForm((old) => ({ ...old, type: 'DINE_IN' }));
    }
  }, [pos]);
  const payload = () => ({
    items: cart.map((i) => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      modifierOptionIds: i.modifierOptionIds,
      specialInstructions: i.specialInstructions,
    })),
    type: form.type,
    guestName: form.guestName,
    guestPhone: form.guestPhone,
    ...(form.type === 'DELIVERY'
      ? { zoneId: form.zoneId, deliveryAddress: form.deliveryAddress }
      : {}),
    ...(form.type === 'DINE_IN' && form.tableId ? { tableId: form.tableId } : {}),
    ...(form.type === 'DINE_IN' && tableToken ? { tableToken } : {}),
    ...(form.couponCode ? { couponCode: form.couponCode } : {}),
    notes: form.notes,
  });
  const change = (field: string, value: string) => {
    setForm((old) => ({ ...old, [field]: value }));
    setQuote(null);
    setKey(crypto.randomUUID());
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = payload();
      const price = await api('checkout/quote', { method: 'POST', body: JSON.stringify(data) });
      setQuote(price);
      if (!quote) {
        toast(
          tr(
            'Qiimaha waa la xaqiijiyey. Riix mar kale si aad u dalbato.',
            'Price confirmed. Review and place your order.',
          ),
        );
        return;
      }
      const result = await api(pos ? 'pos/orders' : 'orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': key, 'X-Expected-Total': String(quote.total) },
        body: JSON.stringify(data),
      });
      sessionStorage.setItem('botan-last-order', JSON.stringify(result));
      clear();
      router.push('/order/success?token=' + result.token);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length)
    return (
      <div className="empty">
        <h2>{tr('Dambiishu way madhan tahay', 'Your bag is empty')}</h2>
        <Link href={pos ? '/pos' : '/menu'} className="button">
          Menu
        </Link>
      </div>
    );
  return (
    <section className={pos ? '' : 'section'}>
      <div className="page-intro">
        <div className="eyebrow">THE LAST STEP TO SOMETHING DELICIOUS</div>
        <h1>{tr('Xaqiiji dalabkaaga', 'Make it official.')}</h1>
      </div>
      <form className="checkout-grid" onSubmit={submit}>
        <div className="form-card">
          <h2>{tr('Sidee ku rabtaa?', 'How would you like it?')}</h2>
          <div className="tabs order-type">
            {(pos || tableToken ? ['DINE_IN', 'PICKUP', 'DELIVERY'] : ['DELIVERY', 'PICKUP']).map(
              (type) => (
                <button
                  type="button"
                  className={form.type === type ? 'active' : ''}
                  key={type}
                  onClick={() => change('type', type)}
                >
                  {type === 'DELIVERY'
                    ? tr('Delivery', 'Delivery')
                    : type === 'PICKUP'
                      ? tr('Soo qaado', 'Pickup')
                      : 'Dine-in'}
                </button>
              ),
            )}
          </div>
          <div className="form-grid">
            <label className="field">
              {tr('Magacaaga', 'Your name')}
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={form.guestName}
                onChange={(e) => change('guestName', e.target.value)}
              />
            </label>
            <label className="field">
              {tr('Telefoonka', 'Phone number')}
              <input
                required
                type="tel"
                pattern="\+?[0-9\s-]{7,20}"
                autoComplete="tel"
                value={form.guestPhone}
                onChange={(e) => change('guestPhone', e.target.value)}
              />
            </label>
          </div>
          {form.type === 'DELIVERY' && (
            <>
              <label className="field">
                Delivery zone
                <select
                  required
                  value={form.zoneId}
                  onChange={(e) => change('zoneId', e.target.value)}
                >
                  <option value="">{tr('Dooro degmada', 'Choose your neighbourhood')}</option>
                  {zones?.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · {formatMoney(z.deliveryFee)} · ~{z.etaMinutes} min
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                {tr('Cinwaanka & tilmaamaha', 'Address & directions')}
                <textarea
                  required
                  minLength={5}
                  maxLength={400}
                  autoComplete="street-address"
                  value={form.deliveryAddress}
                  onChange={(e) => change('deliveryAddress', e.target.value)}
                />
              </label>
            </>
          )}
          {form.type === 'DINE_IN' && pos && (
            <label className="field">
              Table
              <select value={form.tableId} onChange={(e) => change('tableId', e.target.value)}>
                <option value="">No table</option>
                {tables
                  ?.filter((t) => t.status !== 'DISABLED')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.tableNumber} · {t.status}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="field">
            {tr('Faahfaahin kale', 'Anything else?')}
            <textarea
              maxLength={500}
              value={form.notes}
              onChange={(e) => change('notes', e.target.value)}
            />
          </label>
          <h3>{tr('Lacag-bixinta', 'Payment')}</h3>
          <div className="payment-choice">
            <span>
              <ShieldCheck size={22} />
            </span>
            <div>
              <b>{tr('Cash markaad hesho', 'Cash on delivery / pickup')}</b>
              <p>{tr('Lacag bixi markaad cuntada hesho.', 'Pay when you receive your food.')}</p>
            </div>
            <Check size={18} />
          </div>
          {!user && (
            <p className="muted">
              {tr('Waxaad dalban kartaa adigoon akoon lahayn.', 'Guest checkout is welcome.')}{' '}
              <Link href="/login">{tr('Gal akoon', 'Sign in')}</Link>
            </p>
          )}
        </div>
        <aside className="summary-card">
          <h2>{tr('Dalabkaaga', 'Your order')}</h2>
          {cart.map((i) => (
            <div className="summary-row" key={i.key}>
              <span>
                {i.quantity} × {i.name}
              </span>
              <b>{formatMoney(i.quantity * i.price)}</b>
            </div>
          ))}
          <label className="field">
            Coupon
            <input
              value={form.couponCode}
              maxLength={40}
              onChange={(e) => change('couponCode', e.target.value.toUpperCase())}
              placeholder="BOTAN10"
            />
          </label>
          {quote && (
            <>
              <div className="summary-row">
                <span>Subtotal</span>
                <b>{formatMoney(quote.subtotal)}</b>
              </div>
              <div className="summary-row">
                <span>Discount</span>
                <b>−{formatMoney(quote.discount)}</b>
              </div>
              <div className="summary-row">
                <span>Delivery</span>
                <b>{formatMoney(quote.deliveryFee)}</b>
              </div>
              <div className="summary-row">
                <span>Tax</span>
                <b>{formatMoney(quote.tax)}</b>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <b>{formatMoney(quote.total)}</b>
              </div>
            </>
          )}
          {error && <Notice error={error} />}
          <button className="button full" disabled={busy}>
            {busy
              ? tr('Sug…', 'One moment…')
              : quote
                ? tr('Xaqiiji dalabka', 'Place order')
                : tr('Xaqiiji qiimaha', 'Review total')}{' '}
            <ArrowRight size={17} />
          </button>
          <small className="muted">
            {tr(
              'Dalabkaaga wuxuu sugayaa xaqiijinta maqaayadda.',
              'Your order will be sent to the restaurant for confirmation.',
            )}
          </small>
        </aside>
      </form>
    </section>
  );
}
export const statusLabel: Record<string, string> = {
  PENDING_APPROVAL: 'Sugaya xaqiijin',
  CONFIRMED: 'La xaqiijiyey',
  PREPARING: 'La diyaarinayo',
  READY: 'Diyaar ah',
  OUT_FOR_DELIVERY: 'Waddada ku jira',
  COMPLETED: 'La dhammeeyey',
  CANCELLED: 'La joojiyey',
  REJECTED: 'La diiday',
};
export function Tracking({ token, success = false }: { token: string; success?: boolean }) {
  const { data: order, error } = useData('orders/track/' + token, 5000),
    { tr } = useStore();
  return (
    <section className="section narrow">
      <div className="page-intro">
        <div className="success-mark">
          <Check size={32} />
        </div>
        <div className="eyebrow">
          {success ? 'THANK YOU FOR CHOOSING BOTAN' : 'FRESH FOOD, ON ITS WAY'}
        </div>
        <h1>
          {success
            ? tr('Dalabka waa la helay!', 'You’re on the list!')
            : tr('La soco dalabkaaga', 'Follow your good food.')}
        </h1>
        <p>
          {tr(
            'Boggan hayso si aad ula socoto dalabkaaga.',
            'Keep this page to follow your order. This link is private.',
          )}
        </p>
      </div>
      {error && <Notice error={error} />}
      <p className="muted">
        {tr(
          'Si toos ah ayuu isu cusboonaysiiyaa 5 ilbiriqsi kasta.',
          'Updates automatically every 5 seconds.',
        )}
      </p>
      {order ? (
        <div className="form-card">
          <div className="section-heading">
            <h2>{order.orderNumber}</h2>
            <span className={'badge ' + order.status}>
              {statusLabel[order.status] || order.status}
            </span>
          </div>
          <div className="timeline">
            {order.statusEvents.map((e: any, n: number) => (
              <div key={n}>
                <span>
                  <Check size={13} />
                </span>
                <div>
                  <b>{statusLabel[e.toStatus] || e.toStatus}</b>
                  <small>
                    {new Date(e.createdAt).toLocaleString('en-GB', {
                      timeZone: 'Africa/Mogadishu',
                    })}
                  </small>
                </div>
              </div>
            ))}
          </div>
          {order.items.map((i: any, n: number) => (
            <div className="summary-row" key={n}>
              <span>
                {i.quantity} × {i.nameSnapshot}
              </span>
              <b>{formatMoney(i.lineTotal)}</b>
            </div>
          ))}
          <div className="summary-row total">
            <span>Total</span>
            <b>{formatMoney(order.total)}</b>
          </div>
          <div className="summary-row">
            <span>Payment</span>
            <span className="badge">{order.paymentStatus}</span>
          </div>
          <Link className="button full" href={'/track/' + token}>
            {tr('Fur tracking link', 'Open tracking link')}
          </Link>
        </div>
      ) : (
        !error && <Loading />
      )}
    </section>
  );
}
export function AuthPage({ register = false }: { register?: boolean }) {
  const { tr, refreshUser } = useStore(),
    params = useSearchParams(),
    router = useRouter(),
    [staff, setStaff] = useState(params.get('staff') === '1'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget),
      data = Object.fromEntries(f);
    try {
      await api(
        register ? 'auth/customer/register' : staff ? 'auth/staff/login' : 'auth/customer/login',
        { method: 'POST', body: JSON.stringify(data) },
      );
      await refreshUser();
      router.push(staff ? '/admin' : '/account');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section auth-layout">
      <div className="auth-art">
        <Leaf size={42} />
        <div className="eyebrow">GOOD FOOD. GOOD COMPANY.</div>
        <h1>
          {tr('Ku soo dhowow', 'Welcome to')}
          <br />
          <em>{tr('miiska Botan.', 'the Botan table.')}</em>
        </h1>
        <p>
          {tr(
            'Cunto kasta waxay leedahay sheeko. Taada halkan ayay ka bilaabataa.',
            'Every good meal has a story. Yours starts here.',
          )}
        </p>
      </div>
      <form onSubmit={submit} className="form-card auth-form">
        <div className="eyebrow">{staff ? 'BOTAN TEAM' : 'A SEAT AT OUR TABLE'}</div>
        <h2>
          {register
            ? tr('Samee akoon', 'Join the table')
            : tr('Ku soo noqo', 'Good to see you again.')}
        </h2>
        {!register && (
          <div className="tabs">
            <button
              type="button"
              className={!staff ? 'active' : ''}
              onClick={() => setStaff(false)}
            >
              Customer
            </button>
            <button type="button" className={staff ? 'active' : ''} onClick={() => setStaff(true)}>
              Staff
            </button>
          </div>
        )}
        {register && (
          <>
            <label className="field">
              {tr('Magaca oo dhan', 'Full name')}
              <input name="fullName" minLength={2} maxLength={100} autoComplete="name" required />
            </label>
            <label className="field">
              {tr('Telefoon', 'Phone')}
              <input name="phone" type="tel" autoComplete="tel" required />
            </label>
          </>
        )}
        <label className="field">
          {register || staff ? 'Email' : tr('Email ama telefoon', 'Email or phone')}
          <input
            name="email"
            type={register || staff ? 'email' : 'text'}
            autoComplete="username"
            required
          />
        </label>
        <label className="field">
          Password
          <input
            name="password"
            type="password"
            minLength={register ? 12 : 1}
            maxLength={72}
            autoComplete={register ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {register && <small className="muted">12+ characters. Use a unique password.</small>}
        {error && <Notice error={error} />}
        <button className="button full" disabled={busy}>
          {busy
            ? 'Sug…'
            : register
              ? tr('Samee akoon', 'Create account')
              : tr('Gal akoonka', 'Sign in')}{' '}
          <ArrowRight size={17} />
        </button>
        <p>
          {register
            ? tr('Akoon ma leedahay?', 'Already at the table?')
            : tr('Akoon ma lihid?', 'New around here?')}{' '}
          <Link href={register ? '/login' : '/register'}>
            {register ? 'Sign in' : 'Create account'}
          </Link>
        </p>
      </form>
    </section>
  );
}
export function Account({ section }: { section: string }) {
  const { user, refreshUser, tr, toast } = useStore(),
    router = useRouter(),
    { data: orders, error } = useData<any[]>(user ? 'customers/me/orders' : null),
    { data: addresses, refresh } = useData<any[]>(user ? 'customers/me/addresses' : null),
    [reviewError, setReviewError] = useState('');
  if (!user)
    return (
      <div className="empty">
        <h2>{tr('Gal akoonkaaga', 'Sign in to your account')}</h2>
        <Link className="button" href="/login">
          Sign in
        </Link>
      </div>
    );
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">YOUR BOTAN TABLE</div>
          <h1>
            {tr('Salaan', 'Hello')}, {user.name.split(' ')[0]}.
          </h1>
        </div>
        <button
          className="button outline"
          onClick={async () => {
            await api('auth/logout', { method: 'POST', body: '{}' });
            await refreshUser();
            router.push('/');
          }}
        >
          Sign out
        </button>
      </div>
      <div className="tabs account-tabs">
        <Link href="/account/orders">My orders</Link>
        <Link href="/account/addresses">My addresses</Link>
      </div>
      {error && <Notice error={error} />}{' '}
      {section === 'addresses' ? (
        <div className="two-columns">
          <div>
            {addresses?.map((a) => (
              <div className="form-card" key={a.id}>
                <h3>
                  {a.label || a.district} {a.isDefault && <span className="badge">Default</span>}
                </h3>
                <p>
                  {a.district} · {a.description}
                </p>
                <button
                  className="text-link danger"
                  onClick={async () => {
                    try {
                      await api('customers/me/addresses/' + a.id, { method: 'DELETE', body: '{}' });
                      await refresh();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <form
            className="form-card"
            onSubmit={async (e) => {
              e.preventDefault();
              const el = e.currentTarget;
              try {
                await api('customers/me/addresses', {
                  method: 'POST',
                  body: JSON.stringify(Object.fromEntries(new FormData(el))),
                });
                el.reset();
                await refresh();
                toast('Address saved');
              } catch (e) {
                toast((e as Error).message);
              }
            }}
          >
            <h2>Add address</h2>
            {['label', 'district', 'description'].map((n) => (
              <label className="field" key={n}>
                {n}
                <input name={n} required={n !== 'label'} minLength={n === 'description' ? 5 : 2} />
              </label>
            ))}
            <button className="button">Save address</button>
          </form>
        </div>
      ) : (
        <>
          {orders?.length === 0 && (
            <div className="empty">
              <h2>
                {tr('Dalabkii ugu horreeyey ayaa ku sugaya', 'Your first favourite is waiting.')}
              </h2>
              <Link className="button" href="/menu">
                Explore menu
              </Link>
            </div>
          )}
          {orders?.map((o) => (
            <div className="form-card account-order" key={o.id}>
              <div className="section-heading">
                <h3>{o.orderNumber}</h3>
                <span className={'badge ' + o.status}>{statusLabel[o.status] || o.status}</span>
              </div>
              <p>{o.items.map((i: any) => `${i.quantity} × ${i.nameSnapshot}`).join(', ')}</p>
              <div className="summary-row">
                <small>{new Date(o.createdAt).toLocaleDateString()}</small>
                <b>{formatMoney(o.total)}</b>
              </div>
              {o.status === 'COMPLETED' && (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      await api('reviews', {
                        method: 'POST',
                        body: JSON.stringify({
                          orderId: o.id,
                          rating: Number(f.get('rating')),
                          comment: f.get('comment'),
                        }),
                      });
                      toast('Thank you for your review');
                    } catch (e) {
                      setReviewError((e as Error).message);
                    }
                  }}
                >
                  <select name="rating" aria-label="Rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} stars
                      </option>
                    ))}
                  </select>
                  <input name="comment" placeholder="How was your meal?" maxLength={1000} />
                  <button className="button small">Review</button>
                </form>
              )}
            </div>
          ))}
          {reviewError && <Notice error={reviewError} />}
        </>
      )}
    </section>
  );
}
export function InfoPage({ page }: { page: string }) {
  const { tr } = useStore(),
    { data: offers } = useData<any[]>(page === 'offers' ? 'offers' : null),
    { data: restaurant } = useData('restaurant');
  return (
    <section className="section narrow">
      <div className="page-intro">
        <div className="eyebrow">THE BOTAN WAY</div>
        <h1>
          {page === 'about'
            ? tr('Cunto wanaagsan. Dad wanaagsan.', 'Good food. Better company.')
            : page === 'contact'
              ? tr('Waan kuu dhow nahay.', 'Let’s talk good food.')
              : page === 'faq'
                ? tr('Su’aalo ma qabtaa?', 'A few good answers.')
                : page === 'offers'
                  ? tr('Wax wanaagsan, qiimo fiican.', 'A little treat from Botan.')
                  : tr('Xogtaada iyo shuruudaha', 'Privacy & terms')}
        </h1>
      </div>
      {page === 'about' ? (
        <>
          <img className="story-photo" src="/images/rice.jpg" alt="Freshly prepared rice" />
          <h2>{tr('Jacayl saxan kasta ku jira.', 'A little love in every plate.')}</h2>
          <p className="lead">
            {tr(
              'Botan Restaurant waxay isku keentaa dhadhanka Soomaalida, waxyaabo cusub iyo soo dhoweyn wanaagsan. Waxaan aaminsanahay in cunto wanaagsan ay dadka isu keento.',
              'Botan brings together Somali flavour, fresh ingredients and a warm welcome. We believe good food makes ordinary moments a little more special.',
            )}
          </p>
          <Link href="/menu" className="button">
            Explore the menu <ArrowUpRight size={17} />
          </Link>
        </>
      ) : page === 'contact' ? (
        <div className="form-card">
          <h2>Botan Restaurant</h2>
          <p>
            <MapPin size={17} /> {restaurant?.address || 'Mogadishu, Somalia'}
          </p>
          <p>
            <Phone size={17} /> {restaurant?.phone || '+252 61 000 0000'}
          </p>
          <p>
            {tr(
              'Telefoonka iyo cinwaanka waa in maamulka xaqiijiyaa ka hor furitaanka.',
              'Contact details must be confirmed by management before launch.',
            )}
          </p>
          <h3>{tr('Saacadaha shaqada', 'Opening hours')}</h3>
          {restaurant?.hours
            ?.sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
            .map((h: any) => (
              <div className="summary-row" key={h.dayOfWeek}>
                <span>
                  {
                    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
                      h.dayOfWeek
                    ]
                  }
                </span>
                <b>{h.isClosed ? 'Closed' : `${h.opensAt}–${h.closesAt}`}</b>
              </div>
            ))}
        </div>
      ) : page === 'faq' ? (
        <>
          {[
            [
              'Sideen u dalbadaa?',
              'How do I order?',
              'Dooro menu-ga, ku dar dambiisha, kadib geli telefoonka iyo cinwaanka.',
              'Choose your dishes, add them to your bag, then enter your phone and delivery address.',
            ],
            [
              'Sideen lacagta u bixiyaa?',
              'How do I pay?',
              'Cash markaad hesho cuntada. Online payments weli lama hawlgelin.',
              'Pay cash on delivery or pickup. Online payments are not enabled yet.',
            ],
            [
              'Sideen ula socdaa dalabka?',
              'How do I track my order?',
              'Checkout ka dib waxaa lagu siinayaa tracking link gaar ah.',
              'After checkout you receive a private tracking link. Keep it safe.',
            ],
            [
              'Sideen dalab u joojiyaa?',
              'Can I cancel my order?',
              'Si degdeg ah ula xiriir maqaayadda. Maamulka ayaa xaqiijiya joojinta iyo refund-ka haddii loo baahdo.',
              'Contact the restaurant as soon as possible. Staff confirm cancellations and any required refund.',
            ],
          ].map(([so, en, dso, den]) => (
            <details className="faq" key={en}>
              <summary>
                {tr(so, en)}
                <Plus size={17} />
              </summary>
              <p>{tr(dso, den)}</p>
            </details>
          ))}
        </>
      ) : page === 'offers' ? (
        <div className="offers-grid">
          {offers?.map((o) => (
            <div className="form-card coupon-card" key={o.code}>
              <div className="eyebrow">A LITTLE TREAT</div>
              <h2>{o.type === 'PERCENTAGE' ? `${o.value}%` : formatMoney(o.value)} off</h2>
              <p>
                Minimum {formatMoney(o.minSpend)}
                {o.maxDiscount ? ` · Up to ${formatMoney(o.maxDiscount)} off` : ''}
              </p>
              <code>{o.code}</code>
              <Link className="button" href="/menu">
                Order now <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="form-card">
          <h2>Privacy</h2>
          <p>
            We store your name, phone, delivery address and order history to fulfill restaurant
            orders. Staff access is restricted by role. Tracking links reveal order progress without
            contact details. Contact management to request access to or deletion of personal
            information, subject to financial record retention obligations.
          </p>
          <h2>Ordering terms</h2>
          <p>
            Prices and availability are verified at checkout. Orders require restaurant
            confirmation. Delivery estimates depend on preparation and location. Contact the
            restaurant for cancellation, allergies, complaints and refunds. No card details are
            collected by this application.
          </p>
          <p className="notice">
            Management must review and approve these terms, contact details, retention periods and
            local legal requirements before public launch.
          </p>
        </div>
      )}
    </section>
  );
}
