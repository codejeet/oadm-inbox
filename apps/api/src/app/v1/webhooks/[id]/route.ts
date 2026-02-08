import { and, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { db } from '@/db/client';
import { webhooks } from '@/db/schema';
import { requireAuth } from '@/lib/auth';
import { isMissingTableError } from '@/lib/db-errors';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    let auth;
    try {
      auth = await requireAuth(req);
    } catch {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const d = db();
    let deleted: Array<{ id: string }> = [];
    try {
      deleted = await d
        .delete(webhooks)
        .where(and(eq(webhooks.id, id), eq(webhooks.userId, auth.userId)))
        .returning({ id: webhooks.id });
    } catch (err) {
      if (isMissingTableError(err, ['webhooks'])) {
        return Response.json({ error: 'webhooks_not_ready' }, { status: 503 });
      }
      throw err;
    }

    if (!deleted.length) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('webhooks DELETE error', err);
    return Response.json({ error: 'internal' }, { status: 500 });
  }
}
