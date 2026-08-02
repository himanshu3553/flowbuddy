// Astro static build for flowbuddyai.com. Output stays `dist/` so the Render
// static service (staticPublishPath: packages/landing/dist) needs no change.
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://flowbuddyai.com',
  vite: {
    plugins: [tailwindcss()],
  },
});
