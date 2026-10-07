import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Prevent AbortError from showing up as an unhandled rejection
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.name === 'AbortError') {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  if (event.error && event.error.name === 'AbortError') {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
