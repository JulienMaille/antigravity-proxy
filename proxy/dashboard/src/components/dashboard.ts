import { api } from '../api';

export async function renderDashboard(): Promise<string> {
  let health, config, requests;
  try {
    [health, config, requests] = await Promise.all([
      api.health(),
      api.config(),
      api.requests(8),
    ]);
  } catch {
    return `<div class="empty-state"><h3>Cannot connect to proxy</h3><p>Make sure the proxy is running on port 4000.</p></div>`;
  }

  const uptime = Math.floor(health.uptime / 60);
  const stripMode = config.CONTEXT_STRIP_MODE || 'passthrough';
  const provider = config.PROVIDER || 'none';
  const port = config.PROXY_PORT || '443';

  return `
    <h1 class="section-title">Dashboard</h1>
    <p class="section-subtitle">Antigravity proxy status and overview</p>

    <div class="grid grid-3">
      <div class="stat-card">
        <div class="stat-value">${uptime}m</div>
        <div class="stat-label">Uptime</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${provider}</div>
        <div class="stat-label">Active Provider</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${port}</div>
        <div class="stat-label">Proxy Port</div>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <div class="card-header">
        <span class="card-title">Recent Requests</span>
        <span class="badge badge-info">${stripMode}</span>
      </div>
      ${requests.length > 0 ? `
        <table>
          <thead><tr><th>Time</th><th>Model</th><th>Provider</th><th>Tokens</th><th>Status</th></tr></thead>
          <tbody>
            ${requests.map((r: any) => `
              <tr>
                <td>${new Date(r.timestamp).toLocaleTimeString()}</td>
                <td>${r.model || '-'}</td>
                <td>${r.provider || '-'}</td>
                <td>${r.prompt_tokens || 0} → ${r.output_tokens || 0}</td>
                <td><span class="badge ${r.error ? 'badge-danger' : 'badge-success'}">${r.error ? 'Error' : 'OK'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div class="empty-state"><p>No requests yet</p></div>'}
    </div>
  `;
}
