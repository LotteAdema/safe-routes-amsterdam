export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const apiKey = process.env.RESON8_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'RESON8_API_KEY not configured' }, { status: 503 });
  }

  const resp = await fetch('https://api.reson8.dev/v1/auth/token', {
    method: 'POST',
    headers: { Authorization: `ApiKey ${apiKey}` },
  });

  if (!resp.ok) {
    return Response.json({ error: 'Token exchange failed' }, { status: 502 });
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  return Response.json({ access_token: data.access_token, expires_in: data.expires_in });
}
