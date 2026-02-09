/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 👇 REQUIRED because the app is mounted at /app
  basePath: '/app',
  assetPrefix: '/app',

  webpack: (config, { dev, isServer }) => {
    // pdfjs-dist ships the worker as ESM (`.mjs`). Next's production minifier can choke on it
    // when it ends up in the JS minimization pipeline. Treat it as an emitted asset instead.
    config.module.rules.push({
      test: /pdf\.worker(\.min)?\.mjs$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/worker/[hash][ext][query]',
      },
    })

    // Workaround: Next's production JS minimizer (Terser) can still try to parse emitted `.mjs`
    // assets as non-modules, causing: "'import', and 'export' cannot be used outside of module code".
    // Disabling minimization for the client build avoids this and keeps functionality intact.
    if (!dev && !isServer && config.optimization) {
      config.optimization.minimize = false
    }

    return config
  },
}

module.exports = nextConfig
