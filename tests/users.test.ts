import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { restaurant } from '../src/lib/orders';
import { passwordHash, type Actor } from '../src/lib/security';
import {
  bulkUsers,
  changeMyPassword,
  createUser,
  listUsers,
  resetPassword,
  setUserStatus,
  updateUser,
} from '../src/lib/users';
import { POST, GET, PATCH } from '../src/app/api/v1/[...path]/route';
const PASSWORD = 'UsersTest!Password26';
let r: any, owner: Actor & { email?: string }, manager: Actor, operator: Actor & { email?: string };
const unique = (p: string) => `${p}-${randomUUID().slice(0, 8)}@botan.local`;
async function call(
  path: string,
  method = 'GET',
  body?: unknown,
  cookie = '',
  headers: Record<string, string> = {},
) {
  const request = new Request('http://localhost:3000/api/v1/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const handler = method === 'GET' ? GET : method === 'PATCH' ? PATCH : POST;
  return handler(request, { params: Promise.resolve({ path: path.split('?')[0].split('/') }) });
}
async function login(email: string, password = PASSWORD) {
  const res = await call('auth/staff/login', 'POST', { email, password }, '', {
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile',
  });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] || '' };
}
async function staff(role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'RIDER') {
  const u = await db.staffUser.create({
    data: {
      restaurantId: r.id,
      email: unique(role.toLowerCase()),
      role,
      fullName: role + ' person',
      passwordHash: await passwordHash(PASSWORD),
    },
  });
  return {
    id: u.id,
    role: u.role as string,
    name: u.fullName,
    kind: 'staff' as const,
    restaurantId: r.id,
    email: u.email,
  };
}
beforeAll(async () => {
  r = await restaurant();
  owner = await staff('OWNER');
  manager = await staff('MANAGER');
  operator = await staff('CASHIER');
});
afterAll(async () => {
  await db.$disconnect();
});
describe('user management', () => {
  it('creates a user with a one-time temporary password they must change', async () => {
    const result = await createUser(
      { fullName: 'Cali Dalab', email: unique('cali'), phone: '615000123', role: 'CASHIER' },
      owner,
    );
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{1,4}){3}$/);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.mustChangePassword).toBe(true);
    const { res, cookie } = await login(result.user.email, result.temporaryPassword!);
    expect((await res.json()).mustChangePassword).toBe(true);
    // Locked to the password change until a new one is chosen.
    expect((await call('admin/orders', 'GET', undefined, cookie)).status).toBe(403);
    expect((await call('menu/items', 'GET', undefined, cookie)).status).toBe(403);
    expect((await call('account', 'GET', undefined, cookie)).status).toBe(200);
    const change = await call(
      'account/password',
      'POST',
      { currentPassword: result.temporaryPassword, newPassword: 'MyOwnPassword2026' },
      cookie,
    );
    expect(change.status).toBe(200);
    expect((await call('menu/items', 'GET', undefined, cookie)).status).toBe(200);
    expect(
      await db.auditLog.count({
        where: {
          entityId: result.user.id,
          action: { in: ['USER_CREATE', 'LOGIN', 'PASSWORD_CHANGE'] },
        },
      }),
    ).toBe(3);
  });
  it('rejects weak passwords, duplicate emails and unknown roles', async () => {
    await expect(
      createUser(
        { fullName: 'Weak', email: unique('w'), role: 'RIDER', password: 'short1' },
        owner,
      ),
    ).rejects.toThrow();
    await expect(
      createUser(
        { fullName: 'Letters', email: unique('l'), role: 'RIDER', password: 'onlyletterslong' },
        owner,
      ),
    ).rejects.toThrow();
    const email = unique('dup');
    await createUser(
      { fullName: 'Dup', email, role: 'RIDER', password: 'GoodPassword2026' },
      owner,
    );
    await expect(
      createUser(
        {
          fullName: 'Dup 2',
          email: email.toUpperCase(),
          role: 'RIDER',
          password: 'GoodPassword2026',
        },
        owner,
      ),
    ).rejects.toThrow('Email');
    await expect(
      createUser({ fullName: 'Chef', email: unique('c'), role: 'CHEF' }, owner),
    ).rejects.toThrow();
  });
  it('limits managers to order takers and riders, and blocks everyone else', async () => {
    await createUser({ fullName: 'Rider', email: unique('mr'), role: 'RIDER' }, manager);
    for (const role of ['OWNER', 'MANAGER', 'ACCOUNTANT'])
      await expect(
        createUser({ fullName: 'Xasan', email: unique('x'), role }, manager),
      ).rejects.toThrow('Doorkan');
    await expect(updateUser(owner.id, { fullName: 'Hacked' }, manager)).rejects.toThrow(
      'oggolaanshaha',
    );
    await expect(updateUser(operator.id, { role: 'MANAGER' }, manager)).rejects.toThrow(
      'dallacsiin',
    );
    await expect(
      createUser({ fullName: 'Xasan', email: unique('x'), role: 'RIDER' }, operator),
    ).rejects.toThrow();
    const rows = await listUsers(manager);
    expect(rows.find((u) => u.id === owner.id)?.manageable).toBe(false);
    expect(rows.find((u) => u.id === operator.id)?.manageable).toBe(true);
  });
  it('never lets someone change their own role or status here', async () => {
    await expect(setUserStatus(owner.id, 'SUSPENDED', owner)).rejects.toThrow('Akoonkaaga');
    await expect(updateUser(owner.id, { role: 'RIDER' }, owner)).rejects.toThrow('Akoonkaaga');
    const second = await staff('OWNER');
    await updateUser(second.id, { role: 'MANAGER' }, owner);
    expect((await db.staffUser.findUniqueOrThrow({ where: { id: second.id } })).role).toBe(
      'MANAGER',
    );
    expect(
      await db.auditLog.count({ where: { entityId: second.id, action: 'USER_ROLE_CHANGE' } }),
    ).toBe(1);
  });
  it('suspending signs the person out at once and blocks sign-in', async () => {
    const person = await staff('CASHIER');
    const { cookie } = await login(person.email);
    expect((await call('auth/me', 'GET', undefined, cookie)).status).toBe(200);
    await setUserStatus(person.id, 'SUSPENDED', manager);
    expect((await (await call('auth/me', 'GET', undefined, cookie)).json()).user).toBeNull();
    expect((await login(person.email)).res.status).toBe(403);
    await setUserStatus(person.id, 'ACTIVE', manager);
    expect((await login(person.email)).res.status).toBe(200);
  });
  it('does not suspend a rider who still has an order on the road', async () => {
    const rider = await staff('RIDER');
    const o = await db.order.create({
      data: {
        restaurantId: r.id,
        orderNumber: 'T-' + randomUUID(),
        idempotencyKey: randomUUID(),
        requestHash: 'x',
        trackingTokenHash: randomUUID(),
        guestName: 'x',
        guestPhone: '615000000',
        type: 'DELIVERY',
        status: 'OUT_FOR_DELIVERY',
        subtotal: 1,
        total: 1,
        delivery: { create: { riderId: rider.id, status: 'ASSIGNED' } },
      },
    });
    await expect(setUserStatus(rider.id, 'SUSPENDED', owner)).rejects.toThrow('jidka');
    expect(o.id).toBeTruthy();
  });
  it('resets a password: old one stops working, sessions end, new one must be changed', async () => {
    const person = await staff('RIDER');
    const { cookie } = await login(person.email);
    const { temporaryPassword } = await resetPassword(person.id, {}, manager);
    expect((await (await call('auth/me', 'GET', undefined, cookie)).json()).user).toBeNull();
    expect((await login(person.email)).res.status).toBe(401);
    const fresh = await login(person.email, temporaryPassword);
    expect((await fresh.res.json()).mustChangePassword).toBe(true);
  });
  it('changing your own password keeps this device and signs out the others', async () => {
    const person = await staff('CASHIER');
    const a = await login(person.email),
      b = await login(person.email);
    await expect(
      changeMyPassword({ currentPassword: 'wrong', newPassword: 'NewPassword2026' }, { ...person }),
    ).rejects.toThrow('khalad');
    const res = await call(
      'account/password',
      'POST',
      { currentPassword: PASSWORD, newPassword: 'NewPassword2026x' },
      a.cookie,
    );
    expect(res.status).toBe(200);
    expect((await call('account', 'GET', undefined, a.cookie)).status).toBe(200);
    expect((await call('account', 'GET', undefined, b.cookie)).status).toBe(401);
  });
  it('shows devices, activity and work counts; signs out one device', async () => {
    const person = await staff('CASHIER');
    await login(person.email);
    await login(person.email);
    const { cookie } = await login(owner.email!);
    const detail = await (await call('admin/users/' + person.id, 'GET', undefined, cookie)).json();
    expect(detail.sessions).toHaveLength(2);
    expect(detail.sessions[0].userAgent).toContain('Android');
    expect(detail.activity.some((a: any) => a.action === 'LOGIN')).toBe(true);
    expect(detail.lastLoginAt).toBeTruthy();
    expect(detail).not.toHaveProperty('passwordHash');
    const revoke = await call(
      `admin/users/${person.id}/sessions/revoke`,
      'POST',
      { sessionId: detail.sessions[0].id },
      cookie,
    );
    expect((await revoke.json()).revoked).toBe(1);
    const list = await (await call('admin/users', 'GET', undefined, cookie)).json();
    expect(list.find((u: any) => u.id === person.id).activeSessions).toBe(1);
  });
  it('keeps users endpoints away from order takers, riders and anonymous visitors', async () => {
    const { cookie } = await login((operator as any).email);
    expect((await call('admin/users', 'GET', undefined, cookie)).status).toBe(403);
    expect((await call('admin/users')).status).toBe(401);
    expect(
      (await call('admin/users/' + owner.id + '/reset-password', 'POST', {}, cookie)).status,
    ).toBe(403);
    expect((await call('account', 'PATCH', { fullName: 'Op Renamed' }, cookie)).status).toBe(200);
    expect((await call('account', 'PATCH', { role: 'OWNER' }, cookie)).status).toBe(400);
  });
  it('lets an owner change many roles at once; refusals are reported per person', async () => {
    const a = await staff('RIDER'),
      b = await staff('RIDER');
    const result = await bulkUsers(
      { ids: [a.id, b.id, owner.id], action: 'role', role: 'CASHIER' },
      owner,
    );
    expect(result.done).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.find((r) => r.id === owner.id)?.error).toContain('Akoonkaaga');
    for (const id of [a.id, b.id])
      expect((await db.staffUser.findUniqueOrThrow({ where: { id } })).role).toBe('CASHIER');
    await expect(
      bulkUsers({ ids: [a.id], action: 'role', role: 'OWNER' }, manager),
    ).resolves.toMatchObject({
      failed: 1,
    });
    const suspended = await bulkUsers({ ids: [a.id, b.id], action: 'suspend' }, manager);
    expect(suspended.done).toBe(2);
    expect(
      await db.staffUser.count({ where: { id: { in: [a.id, b.id] }, status: 'SUSPENDED' } }),
    ).toBe(2);
    await expect(bulkUsers({ ids: [a.id], action: 'role' }, owner)).rejects.toThrow('doorka');
  });
});
