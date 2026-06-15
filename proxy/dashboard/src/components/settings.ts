import { api } from '../api';

export async function renderSettings(): Promise<string> {
  let config: Record<string, string>;
  try {
    config = await api.config();
  } catch {
    return '<div class="empty-state"><h3>Cannot load config</h3></div>';
  }

  return `
    <h1 class="section-title">Settings</h1>
    <p class="section-subtitle">Proxy configuration</p>

    <div class="card">
      <div class="card-header"><span class="card-title">Proxy</span></div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Proxy Port</label>
          <input type="number" data-key="PROXY_PORT" value="${config.PROXY_PORT || '443'}">
        </div>
        <div class="form-group">
          <label class="form-label">API Port</label>
          <input type="number" data-key="API_PORT" value="${config.API_PORT || '4000'}">
        </div>
        <div class="form-group">
          <label class="form-label">Retries</label>
          <input type="number" data-key="PROXY_RETRIES" value="${config.PROXY_RETRIES || '3'}">
        </div>
        <div class="form-group">
          <label class="form-label">Backoff (ms)</label>
          <input type="number" data-key="PROXY_BACKOFF_MS" value="${config.PROXY_BACKOFF_MS || '1000'}">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Context Mode</span></div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="toggle ${config.CONTEXT_STRIP_MODE === 'passthrough' ? 'active' : ''}" id="context-toggle" data-action="context-mode"></div>
        <span id="context-label" style="font-size: 14px; color: var(--text-secondary);">
          ${config.CONTEXT_STRIP_MODE === 'passthrough' ? 'Passthrough (forward full native context)' : 'Strip (inject compact reference)'}
        </span>
      </div>
      <p style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;">
        Passthrough forwards the full Antigravity context to external models. Strip removes bulk tags and injects a compact reference.
      </p>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Rate Limiting</span></div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Global Limit (req/min)</label>
          <input type="number" data-key="RATE_LIMIT_GLOBAL" value="${config.RATE_LIMIT_GLOBAL || '60'}">
        </div>
        <div class="form-group">
          <label class="form-label">Provider Limit (req/min)</label>
          <input type="number" data-key="RATE_LIMIT_PROVIDER" value="${config.RATE_LIMIT_PROVIDER || '30'}">
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Failover</span></div>
      <div class="form-group">
        <label class="form-label">Webhook URL</label>
        <input type="url" data-key="FAILOVER_WEBHOOK_URL" value="${config.FAILOVER_WEBHOOK_URL || ''}" placeholder="https://hooks.example.com/webhook">
      </div>
    </div>

    <div style="margin-top: 20px;">
      <button class="btn btn-primary" id="save-settings">Save Settings</button>
    </div>
  `;
}

export function initSettings(): void {
  // Context mode toggle
  document.getElementById('context-toggle')?.addEventListener('click', async (e) => {
    const toggle = e.currentTarget as HTMLElement;
    toggle.classList.toggle('active');
    const label = document.getElementById('context-label');
    const isPassthrough = toggle.classList.contains('active');
    if (label) label.textContent = isPassthrough ? 'Passthrough (forward full native context)' : 'Strip (inject compact reference)';
    try { await api.saveConfig('CONTEXT_STRIP_MODE', isPassthrough ? 'passthrough' : 'strip'); } catch (e) { console.error(e); }
  });

  // Save settings
  document.getElementById('save-settings')?.addEventListener('click', async () => {
    const inputs = document.querySelectorAll('[data-key]');
    for (const input of inputs) {
      const key = (input as HTMLElement).dataset.key!;
      const value = (input as HTMLInputElement).value;
      try { await api.saveConfig(key, value); } catch (e) { console.error(e); }
    }
    alert('Settings saved!');
  });
}
