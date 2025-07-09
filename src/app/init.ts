// This file will be loaded once when the app starts
export function initialize() {
    if (typeof window === 'undefined') {
      // Server-side initialization
      import('./api/monitor/route')
        .then(() => console.log('Directory size monitoring initialized'))
        .catch(err => console.error('Failed to initialize directory size monitoring:', err));
    }
  }