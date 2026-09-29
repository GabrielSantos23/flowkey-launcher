import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './app';
import { connectHost } from './bridge';

connectHost();

const container = document.getElementById('root');
if (!container) {
  throw new Error('settings host page is missing #root');
}
createRoot(container).render(createElement(App));
