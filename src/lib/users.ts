// Staff accounts: who can sign in, with which role, and what they did.
//
// Owners manage everyone. Managers manage cashiers and riders only, so a manager can never
// create or promote someone to their own level or above. Nobody can suspend themselves, change their own
// role here, or leave the restaurant without an active owner. Every change is audited, and changing a
// password, role or status signs that person out everywhere.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, StaffRole } from '@prisma/client';
import { db } from './db';
import { ensure } from './errors';
import { audit, transaction } from './orders';
import { passwordHash, verifyPassword, type Actor } from './security';

export const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'RIDER', 'ACCOUNTANT'] as const;
/** Roles each role may create and manage. */
export const MANAGEABLE: Record<string, readonly StaffRole[]> = {
  OWNER: ROLES,
  MANAGER: ['CASHIER', 'RIDER'],
};
export const canManage = (actor: Actor, role: string) =>
  (MANAGEABLE[actor.role] || []).includes(role as StaffRole);

const password = z
  .string()
  .min(12, 'Password-ku waa inuu ahaadaa ugu yaraan 12 xaraf')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password-ku aad buu u dheer yahay')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Ku dar xarfo iyo tirooyin labadaba');
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s-]{7,20}$/, 'Telefoon sax ah geli')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));
export const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    email: z.email().toLowerCase(),
    phone,
    role: z.enum(ROLES),
    /** Omitted: a temporary password is generated and returned once. */
    password: password.optional(),
    /** The person must pick their own password at first sign-in. */
    mustChangePassword: z.boolean().default(true),
  })
  .strict();
export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),
    email: z.email().toLowerCase().optional(),
    phone,
    role: z.enum(ROLES).optional(),
  })
  .strict();

/** 14 characters, no look-alikes (0/O, 1/l/I), always letters and digits. */
export function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ',
    digits = '23456789',
    all = letters + digits;
  for (;;) {
    const value = Array.from({ length: 14 }, () => all[randomInt(all.length)]).join('');
    if (/[A-Za-z]/.test(value) && /\d/.test(value)) return value.replace(/(.{4})(?=.)/g, '$1-');
  }
}

const publicFields = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StaffUserSelect;

export async function listUsers(user: Actor) {
  const [users, sessions, handled, delivered] = await Promise.all([
    db.staffUser.findMany({
      where: { restaurantId: user.restaurantId },
      select: publicFields,
      orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
    }),
    db.authSession.groupBy({
      by: ['subjectId'],
      where: { kind: 'staff', expiresAt: { gt: new Date() } },
      _count: { _all: true },
    }),
    db.order.groupBy({
      by: ['handledById'],
      where: { restaurantId: user.restaurantId, handledById: { not: null } },
      _count: { _all: true },
    }),
    db.delivery.groupBy({
      by: ['riderId'],
      where: { status: 'DELIVERED', order: { restaurantId: user.restaurantId } },
      _count: { _all: true },
    }),
  ]);
  const count = (rows: { _count: { _all: number } }[], match: (r: any) => boolean) =>
    rows.find(match)?._count._all || 0;
  return users.map((u) => ({
    ...u,
    activeSessions: count(sessions, (s) => s.subjectId === u.id),
    ordersTaken: count(handled, (h) => h.handledById === u.id),
    deliveriesDone: count(delivered, (d) => d.riderId === u.id),
    manageable: canManage(user, u.role) && u.id !== user.id,
  }));
}

export async function getUser(id: string, user: Actor) {
  const target = await db.staffUser.findFirst({
    where: { id, restaurantId: user.restaurantId },
    select: publicFields,
  });
  ensure(target, 'Isticmaalaha lama helin', 404);
  const [sessions, activity, ordersTaken, deliveriesDone, onTheRoad] = await Promise.all([
    db.authSession.findMany({
      where: { kind: 'staff', subjectId: id, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.auditLog.findMany({
      where: {
        restaurantId: user.restaurantId,
        OR: [{ actorId: id }, { entityType: 'StaffUser', entityId: id }],
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    db.order.count({ where: { restaurantId: user.restaurantId, handledById: id } }),
    db.delivery.count({ where: { riderId: id, status: 'DELIVERED' } }),
    db.delivery.count({ where: { riderId: id, order: { status: 'OUT_FOR_DELIVERY' } } }),
  ]);
  return {
    ...target,
    sessions: sessions.map((s) => ({ ...s, current: s.id === user.sessionId })),
    activity,
    stats: { ordersTaken, deliveriesDone, onTheRoad },
    manageable: canManage(user, target.role) && target.id !== user.id,
  };
}

async function guardTarget(tx: Prisma.TransactionClient, id: string, user: Actor) {
  const target = await tx.staffUser.findFirst({ where: { id, restaurantId: user.restaurantId } });
  ensure(target, 'Isticmaalaha lama helin', 404);
  ensure(
    target.id !== user.id,
    'Akoonkaaga halkan wax kaga ma beddeli kartid; isticmaal "Akoonkayga"',
    400,
  );
  ensure(canManage(user, target.role), 'Ma lihid oggolaanshaha isticmaalahan', 403);
  return target;
}
async function assertAnotherOwner(tx: Prisma.TransactionClient, restaurantId: string, id: string) {
  ensure(
    (await tx.staffUser.count({
      where: { restaurantId, role: 'OWNER', status: 'ACTIVE', id: { not: id } },
    })) > 0,
    'Ugu yaraan hal milkiile firfircoon waa inuu jiraa',
    409,
  );
}
const signOut = (tx: Prisma.TransactionClient, id: string) =>
  tx.authSession.deleteMany({ where: { kind: 'staff', subjectId: id } });

export async function createUser(body: unknown, user: Actor) {
  const data = createUserSchema.parse(body);
  ensure(canManage(user, data.role), 'Doorkan ma abuuri kartid', 403);
  const generated = data.password ? null : temporaryPassword();
  const hash = await passwordHash(data.password || generated!);
  return transaction(async (tx) => {
    ensure(
      !(await tx.staffUser.findUnique({ where: { email: data.email } })),
      'Email-kan horay ayaa loo isticmaalay',
      409,
    );
    const created = await tx.staffUser.create({
      data: {
        restaurantId: user.restaurantId,
        fullName: data.fullName,
        email: data.email,
        phone: data.phone || null,
        role: data.role,
        passwordHash: hash,
        mustChangePassword: generated ? true : data.mustChangePassword,
      },
      select: publicFields,
    });
    await audit(tx, user, 'USER_CREATE', 'StaffUser', created.id, {
      role: created.role,
      email: created.email,
    });
    return { user: created, temporaryPassword: generated };
  });
}

export async function updateUser(id: string, body: unknown, user: Actor) {
  const data = updateUserSchema.parse(body);
  return transaction(async (tx) => {
    const target = await guardTarget(tx, id, user);
    if (data.role && data.role !== target.role) {
      ensure(canManage(user, data.role), 'Doorkan uma dallacsiin kartid', 403);
      if (target.role === 'OWNER') await assertAnotherOwner(tx, user.restaurantId, id);
    }
    if (data.email && data.email !== target.email)
      ensure(
        !(await tx.staffUser.findUnique({ where: { email: data.email } })),
        'Email-kan horay ayaa loo isticmaalay',
        409,
      );
    const updated = await tx.staffUser.update({
      where: { id },
      data: {
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.role ? { role: data.role } : {}),
      },
      select: publicFields,
    });
    const roleChanged = Boolean(data.role && data.role !== target.role);
    if (roleChanged) await signOut(tx, id);
    await audit(tx, user, roleChanged ? 'USER_ROLE_CHANGE' : 'USER_UPDATE', 'StaffUser', id, {
      ...(roleChanged ? { from: target.role, to: data.role } : {}),
      fields: Object.keys(data),
    });
    return updated;
  });
}

export async function setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', user: Actor) {
  return transaction(async (tx) => {
    const target = await guardTarget(tx, id, user);
    if (target.status === status) return { ok: true };
    if (status === 'SUSPENDED') {
      if (target.role === 'OWNER') await assertAnotherOwner(tx, user.restaurantId, id);
      ensure(
        !(await tx.delivery.count({
          where: { riderId: id, order: { status: 'OUT_FOR_DELIVERY' } },
        })),
        'Darawalkan dalab ayaa jidka ugu jira. Marka hore u wareeji darawal kale.',
        409,
      );
      await signOut(tx, id);
    }
    await tx.staffUser.update({ where: { id }, data: { status } });
    await audit(
      tx,
      user,
      status === 'SUSPENDED' ? 'USER_SUSPEND' : 'USER_ACTIVATE',
      'StaffUser',
      id,
    );
    return { ok: true };
  });
}

/**
 * Sets a new password for someone. By default it is temporary (generated unless supplied) and must be
 * changed at their next sign-in. An owner may instead set a permanent password (`temporary: false`) that
 * the person keeps. Either way every device is signed out.
 */
export async function resetPassword(id: string, body: unknown, user: Actor) {
  const data = z
    .object({ password: password.optional(), temporary: z.boolean().default(true) })
    .strict()
    .parse(body ?? {});
  if (!data.temporary) {
    ensure(user.role === 'OWNER', 'Milkiilaha kaliya ayaa dejin kara password rasmi ah', 403);
    ensure(data.password, 'Geli password-ka rasmiga ah');
  }
  const value = data.password || temporaryPassword();
  const hash = await passwordHash(value);
  return transaction(async (tx) => {
    await guardTarget(tx, id, user);
    await tx.staffUser.update({
      where: { id },
      data: {
        passwordHash: hash,
        mustChangePassword: data.temporary,
        passwordChangedAt: new Date(),
      },
    });
    await signOut(tx, id);
    await audit(
      tx,
      user,
      data.temporary ? 'USER_PASSWORD_RESET' : 'USER_PASSWORD_SET',
      'StaffUser',
      id,
    );
    return data.temporary
      ? { temporary: true, temporaryPassword: data.password ? null : value }
      : { temporary: false };
  });
}

/** Signs someone out of every device, or one device when `sessionId` is given. */
export async function revokeSessions(id: string, user: Actor, sessionId?: string) {
  return transaction(async (tx) => {
    if (id !== user.id) await guardTarget(tx, id, user);
    const removed = await tx.authSession.deleteMany({
      where: { kind: 'staff', subjectId: id, ...(sessionId ? { id: sessionId } : {}) },
    });
    await audit(tx, user, 'USER_SESSIONS_REVOKED', 'StaffUser', id, { count: removed.count });
    return { revoked: removed.count };
  });
}

// ---- The signed-in person's own account ----
export async function myAccount(user: Actor) {
  const me = await db.staffUser.findUniqueOrThrow({ where: { id: user.id }, select: publicFields });
  const sessions = await db.authSession.findMany({
    where: { kind: 'staff', subjectId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true, expiresAt: true, userAgent: true },
    orderBy: { createdAt: 'desc' },
  });
  return { ...me, sessions: sessions.map((s) => ({ ...s, current: s.id === user.sessionId })) };
}
export async function updateMyAccount(body: unknown, user: Actor) {
  const data = z
    .object({ fullName: z.string().trim().min(2).max(100).optional(), phone })
    .strict()
    .parse(body);
  return transaction(async (tx) => {
    const updated = await tx.staffUser.update({
      where: { id: user.id },
      data: {
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      },
      select: publicFields,
    });
    await audit(tx, user, 'ACCOUNT_UPDATE', 'StaffUser', user.id);
    return updated;
  });
}
/** Keeps this session, signs out every other device. */
export async function changeMyPassword(body: unknown, user: Actor) {
  const data = z
    .object({ currentPassword: z.string().min(1).max(72), newPassword: password })
    .strict()
    .parse(body);
  ensure(
    data.currentPassword !== data.newPassword,
    'Password-ka cusub waa inuu ka duwanaadaa kii hore',
  );
  const me = await db.staffUser.findUniqueOrThrow({ where: { id: user.id } });
  ensure(
    await verifyPassword(data.currentPassword, me.passwordHash),
    'Password-ka hadda waa khalad',
    400,
  );
  const hash = await passwordHash(data.newPassword);
  return transaction(async (tx) => {
    await tx.staffUser.update({
      where: { id: user.id },
      data: { passwordHash: hash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await tx.authSession.deleteMany({
      where: {
        kind: 'staff',
        subjectId: user.id,
        ...(user.sessionId ? { id: { not: user.sessionId } } : {}),
      },
    });
    await audit(tx, user, 'PASSWORD_CHANGE', 'StaffUser', user.id);
    return { ok: true };
  });
}

export const bulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(100),
    action: z.enum(['suspend', 'activate', 'signout', 'role']),
    role: z.enum(ROLES).optional(),
  })
  .strict();
/**
 * Applies one action to many people. Each person goes through the same rules as a single change and
 * succeeds or fails on their own, so one refusal (e.g. a rider on the road) doesn't block the rest.
 */
export async function bulkUsers(body: unknown, user: Actor) {
  const data = bulkSchema.parse(body);
  ensure(data.action !== 'role' || data.role, 'Dooro doorka cusub');
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of new Set(data.ids)) {
    try {
      if (data.action === 'suspend') await setUserStatus(id, 'SUSPENDED', user);
      else if (data.action === 'activate') await setUserStatus(id, 'ACTIVE', user);
      else if (data.action === 'role') await updateUser(id, { role: data.role }, user);
      else {
        ensure(id !== user.id, 'Akoonkaaga halkan kama saari kartid', 400);
        await revokeSessions(id, user);
      }
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : 'Khalad' });
    }
  }
  return {
    results,
    done: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
