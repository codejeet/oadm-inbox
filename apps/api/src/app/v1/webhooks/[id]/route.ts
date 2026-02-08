import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { webhooks } from '@/db/schema';
import { requireAuth } from '@/lib/auth';

export async function DELETE(req: Request, context: { params: { id: string } }) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const id = context.params.id;
  const d = db();
  const deleted = await d
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, auth.userId)))
    .returning({ id: webhooks.id });

  if (!deleted.length) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  return Response.json({ ok: true });
}
