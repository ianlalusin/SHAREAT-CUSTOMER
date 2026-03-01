import type { Metadata, Viewport } from 'next';
import { Inter, Baloo_Thambi_2 } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { FirebaseClientProvider } from '@/firebase/client-provider';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const balooThambi = Baloo_Thambi_2({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-baloo',
});

export const metadata: Metadata = {
  title: 'SharEat Customer Hub',
  description: 'Manage your dining session with ease.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SharEat Hub',
  },
};

export const viewport: Viewport = {
  themeColor: '#E00000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${balooThambi.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased bg-zinc-50">
        <FirebaseClientProvider>
          <div className="main-content">
            {children}
            <Toaster />
          </div>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
