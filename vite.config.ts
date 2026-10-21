import { defineConfig } from 'vite';

// Relative base so the build works when served from a sub-path (e.g. itch.io's iframe).
export default defineConfig({
  base: './',
});
