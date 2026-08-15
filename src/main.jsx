import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

window.addEventListener('error', (e) => {
  window.api?.logError(`Uncaught error: ${e.message} at ${e.filename}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  window.api?.logError(`Unhandled rejection: ${e.reason}`);
});

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
