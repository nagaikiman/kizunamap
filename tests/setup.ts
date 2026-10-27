import '@testing-library/jest-dom';

// ResizeObserver polyfill for React Flow in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}
