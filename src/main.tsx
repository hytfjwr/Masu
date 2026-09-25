import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { migrateLegacyStorageKeys } from './utils/storageKeys';

// Settings saved under the pre-rename (Tabula / SheetCraft) keys move to the Masu keys before anything reads them
migrateLegacyStorageKeys();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
