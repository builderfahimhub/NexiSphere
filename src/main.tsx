import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* @ts-ignore - next-themes ThemeProvider children type mismatch in React 19 */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
