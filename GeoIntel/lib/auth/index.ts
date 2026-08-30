import 'server-only';
import { cookies } from 'next/headers';
import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';

export interface User { id: string; email: string; plan: 'free' | 'pro'; createdAt: string }

const SESSION_COOKIE = 'kautilya_session';
const DEVICE_COOKIE = 'kautilya_device';
const SESSION_DAYS = 30;

export async function createUser(email: string, password: string): Promise<User> {
  const db = getDb();
  const clean = email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(clean);
  if (exists) throw new Error('An account with that email already exists.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const user: User = { id: randomUUID(), email: clean, plan: 'free', createdAt: new Date().toISOString() };
  db.prepare('INSERT INTO users (id,email,password_hash,plan,created_at) VALUES (?,?,?,?,?)')
    .run(user.id, user.email, bcrypt.hashSync(password, 10), user.plan, user.createdAt);
  return user;
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as any;
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, email: row.email, plan: row.plan, createdAt: row.created_at };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  getDb().prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)')
    .run(token, userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', expires,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, new Date().toISOString()) as any;
  if (!row) return null;
  return { id: row.id, email: row.email, plan: row.plan, createdAt: row.created_at };
}

/**
 * The billing subject. Signed-in users are metered by account; everyone else by a
 * device cookie. The device cookie is trivially cleared, which is exactly why the
 * product says so plainly rather than pretending anonymous metering is enforcement.
 */
export async function currentSubject(): Promise<{ id: string; kind: 'user' | 'device'; user: User | null }> {
  const user = await currentUser();
  if (user) return { id: `user:${user.id}`, kind: 'user', user };

  // The device cookie is issued by middleware.ts, which is the only place able to set
  // one. If it is missing the visitor is blocking cookies entirely, and there is no way
  // to meter them individually — they share one bucket rather than each getting a fresh
  // unlimited allowance, which is what a per-render random id would have given them.
  const device = (await cookies()).get(DEVICE_COOKIE)?.value ?? 'no-cookie';
  return { id: `device:${device}`, kind: 'device', user: null };
}

export function setPlan(userId: string, plan: 'free' | 'pro') {
  getDb().prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
}
