import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { messages } from '@/db/schema';
import { requireAuth } from '@/lib/auth';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const d = db();
  const updated = await d
    .update(messages)
    .set({ ackedAt: new Date() })
    .where(and(eq(messages.id, id), eq(messages.toUserId, auth.userId)))
    .returning({ id: messages.id });

  if (!updated.length) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
