import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmModal';
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
        <ToastProvider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
