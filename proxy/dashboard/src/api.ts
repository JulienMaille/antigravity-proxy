const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => get<{ status: string; uptime: number }>('/health'),
  config: () => get<Record<string, string>>('/config'),
  requests: (limit = 20) => get<any[]>(`/requests?limit=${limit}`),
  logs: (tail = 100) => get<string[]>(`/logs?tail=${tail}`),
  providers: () => get<any[]>('/providers'),
  models: () => get<any>('/models'),
  saveConfig: (key: string, value: string) => post('/config', { key, value }),
  clearLogs: () => post('/logs/clear'),
};
