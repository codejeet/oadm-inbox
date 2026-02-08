import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { messages, users } from '@/db/schema';
import { requireAuth } from '@/lib/auth';

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const unread = url.searchParams.get('unread') === '1';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const d = db();
  const whereClause = unread
    ? and(eq(messages.toUserId, auth.userId), isNull(messages.ackedAt))
    : eq(messages.toUserId, auth.userId);

  const rows = await d
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      ackedAt: messages.ackedAt,
      fromName: users.name,
    })
    .from(messages)
    .innerJoin(users, eq(messages.fromUserId, users.id))
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return Response.json({ messages: rows.map((r) => ({ ...r, toName: auth.name })) });
}
