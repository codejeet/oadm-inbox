export async function GET() {
  return Response.json({ ok: true, service: 'oadm-inbox' });
}
