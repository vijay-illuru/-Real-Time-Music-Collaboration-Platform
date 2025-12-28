const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers['x-auth-token'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => '');

  if (!res.ok) {
    const message = (data && data.message) || (typeof data === 'string' ? data : '') || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
