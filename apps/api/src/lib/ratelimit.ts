import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db/client';
import { messages, users } from '@/db/schema';

export async function assertSendRateLimit(args: { fromUserId: string; ip: string | null }) {
  // MVP: DB-backed check: max 30 sends / minute per sender.
  const d = db();
  const since = new Date(Date.now() - 60_000);
  const rows = await d
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.fromUserId, args.fromUserId), gt(messages.createdAt, since)))
    .limit(31);

  if (rows.length >= 30) {
    const err: any = new Error('rate_limited');
    err.status = 429;
    throw err;
  }
}

export function getIp(req: Request) {
  // Vercel passes x-forwarded-for
  const xff = req.headers.get('x-forwarded-for');
  if (!xff) return null;
  return xff.split(',')[0]?.trim() ?? null;
}
