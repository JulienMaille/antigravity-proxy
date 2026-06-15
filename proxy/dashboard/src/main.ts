import './styles.css';
import { renderNav, initNav } from './components/nav';
import { destroyLogs } from './components/logs';

let currentTab = 'dashboard';

async function navigate(tab: string) {
  // Cleanup previous tab
  destroyLogs();

  currentTab = tab;
  document.getElementById('sidebar')!.innerHTML = renderNav(tab);
  initNav(navigate);

  const content = document.getElementById('content')!;
  content.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

  try {
    switch (tab) {
      case 'dashboard': {
        const { renderDashboard } = await import('./components/dashboard');
        content.innerHTML = await renderDashboard();
        break;
      }
      case 'models': {
        const { renderModels, initModels } = await import('./components/models');
        content.innerHTML = await renderModels();
        initModels();
        break;
      }
      case 'providers': {
        const { renderProviders, initProviders } = await import('./components/providers');
        content.innerHTML = await renderProviders();
        initProviders();
        break;
      }
      case 'logs': {
        const { renderLogs, initLogs } = await import('./components/logs');
        content.innerHTML = await renderLogs();
        initLogs();
        break;
      }
      case 'settings': {
        const { renderSettings, initSettings } = await import('./components/settings');
        content.innerHTML = await renderSettings();
        initSettings();
        break;
      }
      default:
        content.innerHTML = `<div class="empty-state"><h3>Unknown tab</h3></div>`;
    }
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><h3>Error loading ${tab}</h3><p>${e}</p></div>`;
  }
}

navigate('dashboard');
