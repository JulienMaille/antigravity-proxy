const NAV_ITEMS = [
  { id: 'dashboard', icon: '◉', label: 'Dashboard' },
  { id: 'models', icon: '◎', label: 'Models' },
  { id: 'providers', icon: '⬡', label: 'Providers' },
  { id: 'logs', icon: '≡', label: 'Logs' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
];

export function renderNav(activeTab: string): string {
  return `
    <div class="sidebar-logo">Antigravity</div>
    <div class="sidebar-section">General</div>
    ${NAV_ITEMS.slice(0, 2).map(item => `
      <div class="nav-item ${item.id === activeTab ? 'active' : ''}" data-tab="${item.id}">
        <span>${item.icon}</span>
        <span>${item.label}</span>
      </div>
    `).join('')}
    <div class="sidebar-section">Configure</div>
    ${NAV_ITEMS.slice(2).map(item => `
      <div class="nav-item ${item.id === activeTab ? 'active' : ''}" data-tab="${item.id}">
        <span>${item.icon}</span>
        <span>${item.label}</span>
      </div>
    `).join('')}
  `;
}

export function initNav(onNavigate: (tab: string) => void): void {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const tab = (el as HTMLElement).dataset.tab!;
      onNavigate(tab);
    });
  });
}
