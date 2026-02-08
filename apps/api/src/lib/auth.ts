import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { tokens, users } from '@/db/schema';

export function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

export function validateName(name: string) {
  return /^[a-z0-9_]{3,24}$/.test(name);
}

export async function hashPassword(password: string) {
  // bcrypt is portable on Vercel.
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, passHash: string) {
  return await bcrypt.compare(password, passHash);
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function requireAuth(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error('unauthorized');
  const hash = tokenHash(m[1]);

  const d = db();
  const row = await d
    .select({
      userId: tokens.userId,
      tokenId: tokens.id,
      name: users.name,
    })
    .from(tokens)
    .innerJoin(users, eq(tokens.userId, users.id))
    .where(and(eq(tokens.tokenHash, hash), isNull(tokens.revokedAt)))
    .limit(1);

  if (!row.length) throw new Error('unauthorized');

  // Best-effort update lastUsedAt (don’t block request on failure)
  d.update(tokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(tokens.id, row[0].tokenId))
    .catch(() => {});

  return { userId: row[0].userId, name: row[0].name };
}
