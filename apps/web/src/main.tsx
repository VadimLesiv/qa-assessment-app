import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { PlayerProvider } from './lib/PlayerContext';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
