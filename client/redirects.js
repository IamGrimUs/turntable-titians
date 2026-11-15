const CANONICAL_HOST = 'www.battleskratch.com'
const BARE_HOST = 'battleskratch.com'

/**
 * Send the bare domain to www. The API only allows the www origin (CORS), so a visitor
 * who lands on battleskratch.com would otherwise see "Load failed" on every data request.
 */
function buildRedirects() {
  return [
    {
      source: '/:path*',
      has: [{ type: 'host', value: BARE_HOST }],
      destination: `https://${CANONICAL_HOST}/:path*`,
      permanent: true,
    },
  ]
}

module.exports = { buildRedirects, CANONICAL_HOST, BARE_HOST }
