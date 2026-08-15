import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/primitives.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const configuredBasePath = import.meta.env.VITE_BASE_PATH || '/northgate';
const normalizedBasePath = configuredBasePath.replace(/\/$/, '');
const currentPath = window.location.pathname;
const basename =
  normalizedBasePath && (
    currentPath === normalizedBasePath ||
    currentPath.startsWith(`${normalizedBasePath}/`)
  )
    ? normalizedBasePath
    : undefined;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>,
);
