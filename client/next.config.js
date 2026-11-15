const { buildHeaders } = require('./security-headers')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildHeaders({
          isDev: process.env.NODE_ENV !== 'production',
          enforce: process.env.CSP_ENFORCE === 'true',
          graphqlUrl: process.env.NEXT_PUBLIC_GRAPHQL_URL,
        }),
      },
    ]
  },
}

module.exports = nextConfig
