import type { Metadata } from 'next';
import { Inter, Permanent_Marker } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Sidebar } from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const permanentMarker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-graffiti' });

export const metadata: Metadata = {
  title: 'Battle Skratch - DJ Battles',
  description: 'Community DJ battles platform where participants upload video submissions and vote for winners',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${permanentMarker.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}

