import type { NextConfig } from "next";

/*
 * Static export is the whole point of this configuration.
 *
 * Everything in this app runs in the browser — Scryfall is called from the
 * client, PDFs are built with pdf-lib on the client, SQLite runs on the client
 * via WASM — so there is nothing for a server to render. `output: "export"`
 * emits plain HTML, CSS and JS with no serverless functions, which is also what
 * keeps Netlify hosting at exactly the cost of the old static site: compute and
 * web requests are metered, static assets are not.
 *
 * The costs (none of which this app uses): no API routes, no middleware, no
 * ISR, and no default image loader — hence `images.unoptimized`.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
