# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Antigravity dashboard from a 3099-line monolithic HTML file into a clean, component-based Vite app with Apple-style minimal design and a simplified model configuration tab.

**Architecture:** Multiple TypeScript component files → Vite build → single `index.html` + `assets/` output. Backend `dashboard.ts` stays mostly unchanged (API layer). New model tab shows 8 model cards + 1 fallback card instead of a confusing matrix.

**Tech Stack:** Vite, TypeScript, vanilla JS (no framework), CSS custom properties, system fonts

---

## File Structure

```
proxy/dashboard/
├── src/
│   ├── main.ts              # App entry, router, theme toggle
│   ├── api.ts               # API client (fetch wrappers)
│   ├── components/
│   │   ├── nav.ts           # Sidebar navigation
│   │   ├── dashboard.ts    # Home tab — health, stats, recent requests
│   │   ├── models.ts       # Model tab — 8+1 cards with provider config
│   │   ├── providers.ts    # Providers tab — API keys, settings
│   │   ├── logs.ts         # Logs tab — live log viewer
│   │   └── settings.ts     # Settings tab — ports, rate limits, context mode
│   └── styles.css           # Minimal Apple-style CSS
├── index.html               # Vite entry shell
├── vite.config.ts           # Vite config
└── package.json             # Dev dependencies
```

**Backend changes:** `dashboard.ts` — update static file serving path to `dist/` after build.

---

### Task 1: Vite Project Setup

**Files:**
- Create: `proxy/dashboard/package.json`
- Create: `proxy/dashboard/vite.config.ts`
- Create: `proxy/dashboard/tsconfig.json`
- Create: `proxy/dashboard/index.html`
- Create: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "antigravity-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Antigravity</title>
  <link rel="stylesheet" href="/src/styles.css">
</head>
<body>
  <div id="app">
    <nav id="sidebar"></nav>
    <main id="content"></main>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create src/main.ts stub**

```typescript
import './styles.css';
document.getElementById('content')!.innerHTML = '<h1>Dashboard Loading...</h1>';
```

- [ ] **Step 6: Install deps and verify dev server**

Run: `cd proxy/dashboard && npm install && npm run dev`
Expected: Vite dev server starts on localhost:5173

- [ ] **Step 7: Commit**

```bash
git add proxy/dashboard/
git commit -m "feat(dashboard): scaffold Vite project for component-based rebuild"
```

---

### Task 2: CSS Foundation + Nav Component

**Files:**
- Create: `proxy/dashboard/src/styles.css`
- Create: `proxy/dashboard/src/components/nav.ts`
- Modify: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create styles.css with Apple-style design tokens**

```css
:root {
  --bg: #ffffff;
  --bg-secondary: #f5f5f7;
  --bg-tertiary: #e8e8ed;
  --text: #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary: #86868b;
  --border: #d2d2d7;
  --accent: #0071e3;
  --accent-hover: #0077ed;
  --success: #34c759;
  --warning: #ff9500;
  --danger: #ff3b30;
  --radius: 12px;
  --radius-sm: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
  --font: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --transition: 0.2s ease;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font);
  background: var(--bg-secondary);
  color: var(--text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: flex;
  min-height: 100vh;
}

#sidebar {
  width: 240px;
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 20px 0;
  flex-shrink: 0;
}

#content {
  flex: 1;
  padding: 32px 40px;
  max-width: 1200px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition);
  font-size: 14px;
  font-weight: 500;
  border-left: 3px solid transparent;
}

.nav-item:hover { background: var(--bg-secondary); color: var(--text); }
.nav-item.active { color: var(--accent); border-left-color: var(--accent); background: var(--bg-secondary); }
.nav-item .icon { width: 20px; text-align: center; }

.card {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 24px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.badge-success { background: #e8f5e9; color: #1b5e20; }
.badge-warning { background: #fff3e0; color: #e65100; }
.badge-danger { background: #ffebee; color: #b71c1c; }
.badge-info { background: #e3f2fd; color: #0d47a1; }

input, select {
  font-family: var(--font);
  font-size: 14px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--text);
  transition: border-color var(--transition);
  width: 100%;
}

input:focus, select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0,113,227,0.15);
}

.btn {
  font-family: var(--font);
  font-size: 14px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  border: none;
  cursor: pointer;
  transition: all var(--transition);
}

.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--bg-tertiary); color: var(--text); }
.btn-secondary:hover { background: var(--border); }
.btn-danger { background: var(--danger); color: white; }
.btn-danger:hover { background: #d32f2f; }

.grid { display: grid; gap: 16px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }

.stat-card {
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  padding: 20px;
  box-shadow: var(--shadow);
}

.stat-value { font-size: 28px; font-weight: 700; color: var(--text); }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th {
  text-align: left;
  padding: 10px 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--bg-tertiary);
  color: var(--text);
}

tr:hover td { background: var(--bg-secondary); }

.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  cursor: pointer;
  transition: background var(--transition);
}

.toggle.active { background: var(--accent); }

.toggle::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform var(--transition);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.toggle.active::after { transform: translateX(20px); }

.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 20px;
}

.section-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-tertiary);
}

.empty-state .icon { font-size: 48px; margin-bottom: 12px; }
.empty-state h3 { font-size: 17px; color: var(--text-secondary); margin-bottom: 8px; }
.empty-state p { font-size: 14px; }
```

- [ ] **Step 2: Create nav.ts component**

```typescript
const NAV_ITEMS = [
  { id: 'dashboard', icon: '◉', label: 'Dashboard' },
  { id: 'models', icon: '◎', label: 'Models' },
  { id: 'providers', icon: '⬡', label: 'Providers' },
  { id: 'logs', icon: '≡', label: 'Logs' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
];

export function renderNav(activeTab: string, onNavigate: (tab: string) => void): string {
  return NAV_ITEMS.map(item => `
    <div class="nav-item ${item.id === activeTab ? 'active' : ''}" data-tab="${item.id}">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
    </div>
  `).join('');
}

export function initNav(onNavigate: (tab: string) => void): void {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const tab = (el as HTMLElement).dataset.tab!;
      onNavigate(tab);
    });
  });
}
```

- [ ] **Step 3: Update main.ts with router**

```typescript
import './styles.css';
import { renderNav, initNav } from './components/nav';

let currentTab = 'dashboard';

async function navigate(tab: string) {
  currentTab = tab;
  document.getElementById('sidebar')!.innerHTML = renderNav(tab, navigate);
  initNav(navigate);
  // Component loading will be added in subsequent tasks
  document.getElementById('content')!.innerHTML = `<div class="empty-state"><h3>${tab}</h3><p>Coming soon...</p></div>`;
}

navigate('dashboard');
```

- [ ] **Step 4: Verify dev server shows nav + placeholder**

Run: `npm run dev`
Expected: Sidebar with 5 nav items, clicking switches active state

- [ ] **Step 5: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add CSS foundation and nav component"
```

---

### Task 3: API Client

**Files:**
- Create: `proxy/dashboard/src/api.ts`

- [ ] **Step 1: Create api.ts with fetch wrappers**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add proxy/dashboard/src/api.ts
git commit -m "feat(dashboard): add API client with fetch wrappers"
```

---

### Task 4: Dashboard Home Tab

**Files:**
- Create: `proxy/dashboard/src/components/dashboard.ts`
- Modify: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create dashboard.ts component**

```typescript
import { api } from '../api';

export async function renderDashboard(): Promise<string> {
  let health, config, requests;
  try {
    [health, config, requests] = await Promise.all([
      api.health(),
      api.config(),
      api.requests(5),
    ]);
  } catch (e) {
    return `<div class="empty-state"><div class="icon">⚠</div><h3>Cannot connect to proxy</h3><p>Make sure the proxy is running on port 4000.</p></div>`;
  }

  const uptime = Math.floor(health.uptime / 60);
  const stripMode = config.CONTEXT_STRIP_MODE || 'passthrough';
  const provider = config.PROVIDER || 'none';
  const port = config.PROXY_PORT || '443';

  const statsHtml = `
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
  `;

  const recentHtml = requests.length > 0 ? `
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
  ` : '<div class="empty-state"><p>No requests yet</p></div>';

  return `
    <h1 class="section-title">Dashboard</h1>
    <p class="section-subtitle">Antigravity proxy status and overview</p>
    ${statsHtml}
    <div class="card" style="margin-top: 16px">
      <div class="card-header">
        <span class="card-title">Recent Requests</span>
        <span class="badge badge-info">${stripMode}</span>
      </div>
      ${recentHtml}
    </div>
  `;
}
```

- [ ] **Step 2: Update main.ts to load dashboard component**

Replace the placeholder in `navigate()` with dynamic import:

```typescript
async function navigate(tab: string) {
  currentTab = tab;
  document.getElementById('sidebar')!.innerHTML = renderNav(tab, navigate);
  initNav(navigate);

  const content = document.getElementById('content')!;
  content.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  switch (tab) {
    case 'dashboard':
      const { renderDashboard } = await import('./components/dashboard');
      content.innerHTML = await renderDashboard();
      break;
    default:
      content.innerHTML = `<div class="empty-state"><h3>${tab}</h3><p>Coming soon...</p></div>`;
  }
}
```

- [ ] **Step 3: Verify dashboard loads with stats**

Run: `npm run dev`
Expected: Shows uptime, provider, port stats + recent requests table

- [ ] **Step 4: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add home tab with health stats and recent requests"
```

---

### Task 5: Models Tab — 8+1 Card Design

**Files:**
- Create: `proxy/dashboard/src/components/models.ts`
- Modify: `proxy/dashboard/src/main.ts`

This is the core of the redesign. The model tab shows:
- 8 model cards (one per Antigravity model)
- 1 fallback card (for unmatched requests)
- Toggle: per-model config vs priority chain

- [ ] **Step 1: Create models.ts component**

The component fetches current config, displays model cards, and saves changes.

Key data model:
```typescript
interface ModelCard {
  antigravityModel: string;  // e.g. "claude-sonnet-4-6"
  displayName: string;       // e.g. "Claude Sonnet 4.6"
  provider: string;          // e.g. "zen"
  resolvedModel: string;     // e.g. "mimo-v2.5-free"
  enabled: boolean;
}
```

- [ ] **Step 2: Implement card rendering with provider dropdowns**

Each card shows:
- Model name (read-only)
- Provider dropdown (populated from /api/providers)
- Model name input (for the resolved model)
- Enable/disable toggle

- [ ] **Step 3: Implement fallback card**

The fallback card handles all requests not matching the 8 models. Same UI as other cards but labeled "Fallback".

- [ ] **Step 4: Implement per-model vs priority chain toggle**

A master toggle at the top:
- ON: Each card's provider/model is used directly
- OFF: Priority chain is used (current behavior)

- [ ] **Step 5: Wire up save/load from API**

- [ ] **Step 6: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add models tab with 8+1 card layout"
```

---

### Task 6: Providers Tab

**Files:**
- Create: `proxy/dashboard/src/components/providers.ts`
- Modify: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create providers.ts with API key forms**

Simple form per provider:
- Provider name (read-only)
- API key input (password field with show/hide)
- Base URL input (optional)
- Enable/disable toggle
- Test connection button

- [ ] **Step 2: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add providers tab with API key management"
```

---

### Task 7: Logs Tab

**Files:**
- Create: `proxy/dashboard/src/components/logs.ts`
- Modify: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create logs.ts with live log viewer**

- Auto-refresh every 2 seconds
- Filter by level (INFO, WARN, ERROR)
- Search box
- Clear button
- Monospace font, dark background for log area

- [ ] **Step 2: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add logs tab with live viewer"
```

---

### Task 8: Settings Tab

**Files:**
- Create: `proxy/dashboard/src/components/settings.ts`
- Modify: `proxy/dashboard/src/main.ts`

- [ ] **Step 1: Create settings.ts with config forms**

Sections:
- **Proxy**: Port, retries, backoff
- **Rate Limiting**: Global limit, provider limit, window
- **Context Mode**: Passthrough/Strip toggle
- **Failover**: Webhook URL

- [ ] **Step 2: Commit**

```bash
git add proxy/dashboard/src/
git commit -m "feat(dashboard): add settings tab with config forms"
```

---

### Task 9: Build + Backend Integration

**Files:**
- Modify: `proxy/src/dashboard.ts` — update static file serving
- Modify: `proxy/dashboard/package.json` — add build script

- [ ] **Step 1: Run production build**

Run: `cd proxy/dashboard && npm run build`
Expected: `dist/` directory with `index.html` + `assets/`

- [ ] **Step 2: Update dashboard.ts to serve from dist/**

Change the static file serving path from `dashboard/index.html` to `dashboard/dist/index.html`.

- [ ] **Step 3: Verify production build works**

Run: `cd proxy && npm run dev` (start proxy)
Open: `http://localhost:4000`
Expected: New dashboard loads, all tabs work

- [ ] **Step 4: Commit**

```bash
git add proxy/dashboard/ proxy/src/dashboard.ts
git commit -m "feat(dashboard): build production output and integrate with backend"
```

---

### Task 10: Cleanup + Final Testing

- [ ] **Step 1: Remove old dashboard/index.html** (replaced by dist/)

- [ ] **Step 2: Run full test suite**

Run: `cd proxy && npm test`
Expected: All 199+ tests pass

- [ ] **Step 3: Visual QA**

Check each tab in browser:
- Dashboard: stats load, recent requests show
- Models: 8+1 cards display, provider dropdowns work, save works
- Providers: API keys can be entered, test connection works
- Logs: live logs stream, filter works
- Settings: config saves, context mode toggle works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(dashboard): complete component-based rebuild with Apple-style design"
```
