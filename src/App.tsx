import ClientApp from './ClientApp';
import AdminApp from './admin/AdminApp';
import CpanelApp from './cpanel/CpanelApp';

function App() {
  const isDevAdminPath = window.location.pathname.startsWith('/admin');
  const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');
  const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.') || window.location.pathname.startsWith('/cpanel');

  if (isCpanelSubdomain) {
    return <CpanelApp />;
  }

  if (isDevAdminPath || isAdminSubdomain) {
    return <AdminApp />;
  }

  return <ClientApp />;
}

export default App;
