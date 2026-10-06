/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The approved auction UI is a self-contained page in /public/auction.html.
  // Serve it at the site root.
  async rewrites() {
    return [{ source: '/', destination: '/auction.html' }];
  },
  async headers() {
    return [
      { source: '/api/auction/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      // Always revalidate the page + scripts so a new deploy is picked up immediately
      { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/:file(auction.html|debug-panel.js|support.js)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
        ]
      }
    ];
  }
};

export default nextConfig;
