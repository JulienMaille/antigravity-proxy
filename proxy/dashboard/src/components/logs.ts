import { api } from '../api';

let logInterval: ReturnType<typeof setInterval> | null = null;

export async function renderLogs(): Promise<string> {
  let logs: string[];
  try {
    logs = await api.logs(200);
  } catch {
    return '<div class="empty-state"><h3>Cannot load logs</h3></div>';
  }

  const logLines = logs.map(line => {
    let cls = '';
    if (line.includes('WARN')) cls = 'warn';
    else if (line.includes('ERROR')) cls = 'error';
    else if (line.includes('INFO')) cls = 'info';
    return `<div class="log-line ${cls}">${escapeHtml(line)}</div>`;
  }).join('');

  return `
    <h1 class="section-title">Logs</h1>
    <p class="section-subtitle">Live proxy logs</p>
    <div style="display: flex; gap: 12px; margin-bottom: 16px;">
      <input type="text" id="log-search" placeholder="Search logs..." style="max-width: 300px;">
      <button class="btn btn-secondary" id="log-refresh">Refresh</button>
      <button class="btn btn-secondary" id="log-clear">Clear</button>
    </div>
    <div class="log-area" id="log-content">${logLines || '<div class="log-line">No logs yet</div>'}</div>
  `;
}

export function initLogs(): void {
  // Auto-refresh
  logInterval = setInterval(async () => {
    const el = document.getElementById('log-content');
    if (!el) { clearInterval(logInterval!); return; }
    try {
      const logs = await api.logs(200);
      el.innerHTML = logs.map(line => {
        let cls = '';
        if (line.includes('WARN')) cls = 'warn';
        else if (line.includes('ERROR')) cls = 'error';
        else if (line.includes('INFO')) cls = 'info';
        return `<div class="log-line ${cls}">${escapeHtml(line)}</div>`;
      }).join('') || '<div class="log-line">No logs</div>';
      el.scrollTop = el.scrollHeight;
    } catch { /* ignore */ }
  }, 3000);

  document.getElementById('log-refresh')?.addEventListener('click', async () => {
    const el = document.getElementById('log-content');
    if (!el) return;
    const logs = await api.logs(200);
    el.innerHTML = logs.map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('');
  });

  document.getElementById('log-clear')?.addEventListener('click', async () => {
    await api.clearLogs();
    const el = document.getElementById('log-content');
    if (el) el.innerHTML = '<div class="log-line">Logs cleared</div>';
  });

  document.getElementById('log-search')?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase();
    document.querySelectorAll('.log-line').forEach(el => {
      const text = el.textContent || '';
      (el as HTMLElement).style.display = query && !text.toLowerCase().includes(query) ? 'none' : '';
    });
  });
}

export function destroyLogs(): void {
  if (logInterval) { clearInterval(logInterval); logInterval = null; }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
