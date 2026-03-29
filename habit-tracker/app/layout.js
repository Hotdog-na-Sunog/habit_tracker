// app/layout.js
import { AuthProvider } from '../lib/AuthContext';
import './globals.css';

export const metadata = {
  title: 'habit.',
  description: 'Your personal habit tracker',
  manifest: '/manifest.json',
  themeColor: '#F7F6F2',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'habit.',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="habit." />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Lexend:wght@100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
