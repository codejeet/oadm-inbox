import { and, desc, eq, gte, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { messages, users } from '@/db/schema';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';

function parseSinceParam(raw: string | null) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    const ms = trimmed.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireAuth(req);
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const unread = url.searchParams.get('unread') === '1';
  const sent = url.searchParams.get('sent') === '1';
  const all = url.searchParams.get('all') === '1';
  const since = parseSinceParam(url.searchParams.get('since'));
  if (url.searchParams.has('since') && !since) {
    return Response.json({ error: 'invalid_since' }, { status: 400 });
  }
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = Number(rawLimit ?? '50');
  const limit = Math.min(
    Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50,
    200
  );

  const d = db();
  const inboxClause = unread
    ? and(eq(messages.toUserId, auth.userId), isNull(messages.ackedAt))
    : eq(messages.toUserId, auth.userId);
  const outboxClause = eq(messages.fromUserId, auth.userId);
  const baseClause = all ? or(inboxClause, outboxClause) : sent ? outboxClause : inboxClause;
  const whereClause = since ? and(baseClause, gte(messages.createdAt, since)) : baseClause;

  const rows = await d
    .select({
      id: messages.id,
      text: messages.text,
      createdAt: messages.createdAt,
      ackedAt: messages.ackedAt,
      fromName: messages.fromName,
      fromUserId: messages.fromUserId,
      toName: users.name,
    })
    .from(messages)
    .leftJoin(users, eq(messages.toUserId, users.id))
    .where(whereClause)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  const ordered = rows.slice().reverse();

  return Response.json({
    messages: ordered.map((r) => ({
      id: r.id,
      text: r.text,
      createdAt: r.createdAt,
      ackedAt: r.ackedAt,
      fromName: r.fromName,
      toName: r.toName ?? auth.name,
      direction: r.fromUserId === auth.userId ? 'out' : 'in',
    })),
  });
}
