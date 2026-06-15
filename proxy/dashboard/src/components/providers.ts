import { api } from '../api';

const PROVIDER_FIELDS: Record<string, { label: string; key: string; type: string }[]> = {
  nvidia: [
    { label: 'API Key', key: 'NVIDIA_API_KEY', type: 'password' },
    { label: 'Base URL', key: 'NVIDIA_BASE_URL', type: 'text' },
  ],
  openrouter: [
    { label: 'API Key', key: 'OPENROUTER_API_KEY', type: 'password' },
  ],
  openai: [
    { label: 'API Key', key: 'OPENAI_API_KEY', type: 'password' },
  ],
  anthropic: [
    { label: 'API Key', key: 'ANTHROPIC_API_KEY', type: 'password' },
  ],
  groq: [
    { label: 'API Key', key: 'GROQ_API_KEY', type: 'password' },
  ],
  google: [
    { label: 'API Key', key: 'GOOGLE_API_KEY', type: 'password' },
  ],
};

export async function renderProviders(): Promise<string> {
  let config: Record<string, string>;
  try {
    config = await api.config();
  } catch {
    return '<div class="empty-state"><h3>Cannot load config</h3></div>';
  }

  const currentProvider = config.PROVIDER || 'zen';
  const providerPriority = config.PROVIDER_PRIORITY || 'zen,nvidia,openrouter,google';
  const providers = providerPriority.split(',').map((p: string) => p.trim());

  const cardsHtml = providers.map(p => {
    const fields = PROVIDER_FIELDS[p] || [{ label: 'API Key', key: `${p.toUpperCase()}_API_KEY`, type: 'password' }];
    const isCurrent = p === currentProvider;

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${p.charAt(0).toUpperCase() + p.slice(1)}</span>
          ${isCurrent ? '<span class="badge badge-success">Active</span>' : ''}
        </div>
        ${fields.map(f => `
          <div class="form-group">
            <label class="form-label">${f.label}</label>
            <input type="${f.type}" data-provider="${p}" data-key="${f.key}" value="${config[f.key] || ''}" placeholder="Enter ${f.label.toLowerCase()}">
          </div>
        `).join('')}
      </div>
    `;
  }).join('');

  return `
    <h1 class="section-title">Providers</h1>
    <p class="section-subtitle">Configure API keys and provider settings</p>
    <div class="grid grid-2">${cardsHtml}</div>
    <div style="margin-top: 20px;">
      <button class="btn btn-primary" id="save-providers">Save All</button>
    </div>
  `;
}

export function initProviders(): void {
  document.getElementById('save-providers')?.addEventListener('click', async () => {
    const inputs = document.querySelectorAll('[data-key]');
    for (const input of inputs) {
      const key = (input as HTMLElement).dataset.key!;
      const value = (input as HTMLInputElement).value;
      if (value) {
        try { await api.saveConfig(key, value); } catch (e) { console.error(e); }
      }
    }
    alert('Provider settings saved!');
  });
}
