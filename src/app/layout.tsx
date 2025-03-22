import { Inter } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../components/AuthProvider';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Email Scraper - Extract emails from websites',
  description: 'A professional tool to extract emails from websites and Google Sheets with advanced processing capabilities',
  keywords: ['email scraper', 'email extractor', 'website emails', 'contact finder', 'lead generation'],
  authors: [{ name: 'Email Scraper' }],
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#4652f0',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
} 