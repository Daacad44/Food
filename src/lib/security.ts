import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { db } from './db';
import { AppError, ensure } from './errors';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  ensure(secret && secret.length >= 32, 'Session configuration is missing', 503);
  return secret;
}
export const trackingToken = (key: string) =>
  createHmac('sha256', sessionSecret())
    .update('tracking:' + key)
    .digest('hex');
export const passwordHash = (value: string) => hash(value, 12);
export const verifyPassword = compare;
export type Actor = {
  id: string;
  role: string;
  name: string;
  kind: 'staff' | 'customer';
  restaurantId: string;
  /** A temporary password was set for them: everything except changing it is blocked. */
  mustChangePassword?: boolean;
  /** Id of the session this request came with. */
  sessionId?: string;
};
export function cookieToken(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('botan_session='))
    ?.slice(14);
}
export async function actor(request: Request): Promise<Actor | null> {
  const token = cookieToken(request);
  if (!token) return null;
  const session = await db.authSession.findUnique({ where: { tokenHash: digest(token) } });
  if (!session || session.expiresAt < new Date()) return null;
  if (session.kind === 'staff') {
    const user = await db.staffUser.findUnique({ where: { id: session.subjectId } });
    if (!user || user.status !== 'ACTIVE') return null;
    return {
      id: user.id,
      role: user.role,
      name: user.fullName,
      kind: 'staff',
      restaurantId: user.restaurantId,
      mustChangePassword: user.mustChangePassword,
      sessionId: session.id,
    };
  }
  // Customer accounts were retired with the customer website.
  return null;
}
export async function requireActor(
  request: Request,
  roles?: readonly string[],
  options: { allowPendingPassword?: boolean } = {},
) {
  const user = await actor(request);
  ensure(user, 'Fadlan gal akoonkaaga', 401);
  ensure(
    !user.mustChangePassword || options.allowPendingPassword,
    'Marka hore beddel password-ka ku meel gaarka ah',
    403,
  );
  if (roles) ensure(roles.includes(user.role), 'Ma lihid oggolaanshaha hawshan', 403);
  return user;
}
export async function createSession(
  subjectId: string,
  kind: 'staff' | 'customer',
  userAgent?: string | null,
) {
  sessionSecret();
  const token = randomBytes(32).toString('hex');
  await db.authSession.create({
    data: {
      subjectId,
      kind,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12),
      userAgent: userAgent ? userAgent.slice(0, 300) : null,
    },
  });
  return `botan_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export function sameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin) {
    const parsed = new URL(origin);
    // Next.js may use the bind address in request.url behind a reverse proxy.
    // Browsers cannot forge Host; validate the visible host, including its port.
    ensure(
      ['https:', 'http:'].includes(parsed.protocol) &&
        (parsed.host === request.headers.get('host') || origin === new URL(request.url).origin),
      'Cross-origin request rejected',
      403,
    );
  }
  ensure(
    request.headers.get('content-type')?.includes('application/json'),
    'JSON content type required',
    415,
  );
}
export async function limit(key: string, max = 20, seconds = 60) {
  const now = new Date();
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" ("key","count","expiresAt") VALUES (${key},1,${new Date(Date.now() + seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END, "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < ${now} THEN ${new Date(Date.now() + seconds * 1000)} ELSE "RateLimit"."expiresAt" END RETURNING "count"`;
  if (rows[0].count > max) throw new AppError(429, 'Codsiyo badan. Sug wax yar.');
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const MANAGERS = ['OWNER', 'MANAGER'] as const;
export const FINANCE = ['OWNER', 'MANAGER', 'ACCOUNTANT'] as const;
/** Staff who take orders, see every order and assign riders. */
export const ORDER_TAKERS = ['OWNER', 'MANAGER', 'OPERATOR'] as const;
/** Staff who can read orders (accountants read, never change them). */
export const ORDER_READERS = ['OWNER', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'] as const;
