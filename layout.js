export const metadata = { title: 'Skelly Auction House' };

// Only needed because the app/ directory exists for the API routes.
// The auction UI itself is served from /public/auction.html at "/".
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
