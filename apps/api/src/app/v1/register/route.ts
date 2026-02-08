import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { hashPassword, normalizeName, validateName } from '@/lib/auth';

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
  if (!validateName(name)) {
    return Response.json({ error: 'invalid_name' }, { status: 400 });
  }

  const d = db();
  const existing = await d.select({ id: users.id }).from(users).where(eq(users.name, name)).limit(1);
  if (existing.length) {
    return Response.json({ error: 'name_taken' }, { status: 409 });
  }

  const passHash = await hashPassword(parsed.data.password);
  await d.insert(users).values({ name, passHash });

  return Response.json({ ok: true });
}
