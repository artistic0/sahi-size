import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import { privacy } from './integrations/privacy.ts'
import { lastModified } from './src/data/sitemap.ts'
import { CSP_DIRECTIVES } from './src/security.ts'

// GitHub Pages serves the site at https://artistic0.github.io/sahi-size/. For an own domain, set
// SITE_URL=https://example.in and BASE_PATH=/ at build time.
const site = process.env.SITE_URL || 'https://artistic0.github.io'
const base = process.env.BASE_PATH || '/sahi-size/'

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Every style is a same-origin file, so the CSP needs no inline styles.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  // No Markdown code blocks here; Shiki's inline styles would also clash with the CSP.
  markdown: { syntaxHighlight: false },
  integrations: [
    react(),
    sitemap({
      filter: (page) => !page.endsWith('/404/'),
      serialize: (item) => ({ ...item, lastmod: lastModified(item.url) }),
    }),
    privacy(),
  ],
  security: {
    csp: {
      directives: CSP_DIRECTIVES as never,
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: ["'self'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      target: 'es2022',
      // No data: URLs for code or styles: every byte the site runs is a plain same-origin file.
      assetsInlineLimit: 0,
    },
    worker: { format: 'es' },
  },
  server: { port: 4320 },
})
