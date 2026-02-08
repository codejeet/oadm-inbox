import { processPendingWebhookDeliveries } from '@/lib/webhooks';

function authorizeCron(req: Request) {
  const secret = process.env.OADM_WEBHOOK_CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get('authorization') ?? '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  const token = m ? m[1] : req.headers.get('x-oadm-cron-secret');
  return token === secret;
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);
  const result = await processPendingWebhookDeliveries(limit);
  return Response.json(result);
}
