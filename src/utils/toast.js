// Lightweight global toast notifications via CustomEvent.
// Usage: toast('Saved!', 'success') | toast('Failed', 'error') | toast('Heads up', 'info')
export const toast = (message, type = 'info') => {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
};
