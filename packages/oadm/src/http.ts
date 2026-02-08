export async function postJson<T>(url: string, body: any, token?: string, method = 'POST'): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = data?.error ? `${data.error}` : `http_${r.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export async function getJson<T>(url: string, token?: string): Promise<T> {
  const r = await fetch(url, {
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const msg = data?.error ? `${data.error}` : `http_${r.status}`;
    throw new Error(msg);
  }
  return data as T;
}
