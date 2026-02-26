import ClientApp from './ClientApp';
import AdminApp from './admin/AdminApp';

function App() {
  const isDevAdminPath = window.location.pathname.startsWith('/admin');
  const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');

  if (isDevAdminPath || isAdminSubdomain) {
    return <AdminApp />;
  }

  return <ClientApp />;
}

export default App;
