import { api } from '../api';

const ANTIGRAVITY_MODELS = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', type: 'flagship' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', type: 'fast' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', type: 'coding' },
  { id: 'claude-sonnet-4-6-thinking', name: 'Claude Sonnet 4.6 Thinking', type: 'reasoning' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', type: 'advanced' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 Thinking', type: 'reasoning' },
  { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', type: 'open' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B Medium', type: 'open' },
];

interface ModelConfig {
  provider: string;
  model: string;
  enabled: boolean;
}

export async function renderModels(): Promise<string> {
  let config: Record<string, string>;
  try {
    config = await api.config();
  } catch {
    return '<div class="empty-state"><h3>Cannot load config</h3></div>';
  }

  const currentProvider = config.PROVIDER || 'zen';
  const providerPriority = config.PROVIDER_PRIORITY || 'zen,nvidia,openrouter,google';
  const providers = providerPriority.split(',').map((p: string) => p.trim());

  // Parse existing per-model overrides from config
  const modelOverrides: Record<string, ModelConfig> = {};
  for (const [key, val] of Object.entries(config)) {
    if (key.startsWith('MODEL_') && key.endsWith('_PROVIDER')) {
      const modelId = key.replace('MODEL_', '').replace('_PROVIDER', '');
      modelOverrides[modelId] = {
        provider: val,
        model: config[`MODEL_${modelId}_MODEL`] || '',
        enabled: config[`MODEL_${modelId}_ENABLED`] !== 'false',
      };
    }
  }

  const cardsHtml = ANTIGRAVITY_MODELS.map(m => {
    const override = modelOverrides[m.id];
    const provider = override?.provider || currentProvider;
    const model = override?.model || '';
    const enabled = override?.enabled !== false;

    return `
      <div class="model-card ${enabled ? '' : 'disabled'}" data-model="${m.id}">
        <div class="model-card-header">
          <div>
            <div class="model-card-name">${m.name}</div>
            <div class="model-card-type">${m.type}</div>
          </div>
          <div class="toggle ${enabled ? 'active' : ''}" data-model="${m.id}" data-action="toggle"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Provider</label>
          <select data-model="${m.id}" data-field="provider">
            ${providers.map(p => `<option value="${p}" ${p === provider ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Model Name (optional override)</label>
          <input type="text" data-model="${m.id}" data-field="model" value="${model}" placeholder="Leave empty for default">
        </div>
      </div>
    `;
  }).join('');

  // Fallback card
  const fallbackProvider = config.FALLBACK_PROVIDER || currentProvider;
  const fallbackModel = config.FALLBACK_MODEL || '';

  const fallbackHtml = `
    <div class="model-card" data-model="fallback" style="border-style: dashed;">
      <div class="model-card-header">
        <div>
          <div class="model-card-name">Fallback</div>
          <div class="model-card-type">All other requests</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Provider</label>
        <select data-model="fallback" data-field="provider">
          ${providers.map(p => `<option value="${p}" ${p === fallbackProvider ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Model Name</label>
        <input type="text" data-model="fallback" data-field="model" value="${fallbackModel}" placeholder="Leave empty for default">
      </div>
    </div>
  `;

  return `
    <h1 class="section-title">Models</h1>
    <p class="section-subtitle">Configure which provider handles each Antigravity model</p>

    <div class="card" style="margin-bottom: 24px">
      <div class="card-header">
        <span class="card-title">Routing Mode</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="toggle active" id="routing-toggle" data-action="routing-mode"></div>
        <span id="routing-label" style="font-size: 14px; color: var(--text-secondary);">Per-model config</span>
      </div>
      <p style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;">
        When enabled, each model routes to its configured provider. When disabled, uses the priority chain.
      </p>
    </div>

    <div class="grid grid-2" id="model-cards">
      ${cardsHtml}
      ${fallbackHtml}
    </div>

    <div style="margin-top: 20px; display: flex; gap: 12px;">
      <button class="btn btn-primary" id="save-models">Save Configuration</button>
      <button class="btn btn-secondary" id="reset-models">Reset to Defaults</button>
    </div>
  `;
}

export function initModels(): void {
  // Toggle handlers
  document.querySelectorAll('.toggle[data-action="toggle"]').forEach(el => {
    el.addEventListener('click', () => {
      el.classList.toggle('active');
      const card = el.closest('.model-card');
      if (card) card.classList.toggle('disabled');
    });
  });

  // Save button
  document.getElementById('save-models')?.addEventListener('click', async () => {
    const cards = document.querySelectorAll('.model-card');
    for (const card of cards) {
      const modelId = (card as HTMLElement).dataset.model!;
      const toggle = card.querySelector('.toggle');
      const enabled = toggle?.classList.contains('active') ?? true;
      const provider = (card.querySelector('[data-field="provider"]') as HTMLSelectElement)?.value || '';
      const model = (card.querySelector('[data-field="model"]') as HTMLInputElement)?.value || '';

      try {
        await api.saveConfig(`MODEL_${modelId.toUpperCase()}_PROVIDER`, provider);
        await api.saveConfig(`MODEL_${modelId.toUpperCase()}_MODEL`, model);
        await api.saveConfig(`MODEL_${modelId.toUpperCase()}_ENABLED`, String(enabled));
      } catch (e) {
        console.error(`Failed to save ${modelId}:`, e);
      }
    }
    alert('Configuration saved!');
  });
}
