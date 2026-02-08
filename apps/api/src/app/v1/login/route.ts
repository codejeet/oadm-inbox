import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tokens, users } from '@/db/schema';
import {
  normalizeName,
  newToken,
  tokenHash,
  verifyPassword,
} from '@/lib/auth';

const Body = z.object({
  name: z.string().min(3).max(24),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  const name = normalizeName(parsed.data.name);
  const d = db();
  const row = await d
    .select({ id: users.id, passHash: users.passHash })
    .from(users)
    .where(eq(users.name, name))
    .limit(1);

  if (!row.length) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, row[0].passHash);
  if (!ok) {
    return Response.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  const token = newToken();
  await d.insert(tokens).values({
    userId: row[0].id,
    tokenHash: tokenHash(token),
  });

  return Response.json({ token });
}
