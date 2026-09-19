import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'WhoBack',
    description: "See who doesn't follow you back on Instagram.",
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'alarms', 'sidePanel', 'scripting'],
    host_permissions: ['https://www.instagram.com/*'],
  },
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
});
