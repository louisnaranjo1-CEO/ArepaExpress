export const isDemoMode = () => {
  const hostname = window.location.hostname;
  return hostname === 'demo.deliexpress.app' || hostname === 'localhost' || hostname === '127.0.0.1';
};
