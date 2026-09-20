import { createRoot } from 'react-dom/client';
import App from './App';
import './resources/styles/style.css';

// No StrictMode: dev double-mounting would double-initialize the legacy
// Svelte services mounted through SvelteBridge (they assume a single boot).
const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount element');

createRoot(container).render(<App />);
