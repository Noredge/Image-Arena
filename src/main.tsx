import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeSettings } from './platform/settings';
import { App } from './app/App';
import './ui/styles.css';
import './ui/arenaScene.css';
import './ui/appearance.css';
import './ui/readability.css';
import './ui/mobile.css';

void initializeSettings().finally(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
