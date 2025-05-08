
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster'; // Import Toaster
import { AuthProvider } from '@/context/AuthContext'; // Import AuthProvider

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const PROD_BASE_URL = 'https://retro.patchwork.ai';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const metadata: Metadata = {
  metadataBase: IS_PRODUCTION ? new URL(PROD_BASE_URL) : undefined,
  title: 'RetroSpectify', // Updated App Name
  description: 'Team Retrospective App', // Updated Description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-secondary`}
      >
        <AuthProvider> {/* Wrap children with AuthProvider */}
          {children}
          <Toaster /> {/* Add Toaster here */}
        </AuthProvider>
      </body>
    </html>
  );
}
