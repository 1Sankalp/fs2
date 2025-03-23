import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { ensureUsersExist } from "@/lib/auth";
import { loadJobsFromDatabase } from "@/lib/hardcodedJobs";

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

// Initialize users and jobs on server startup
try {
  if (typeof window === 'undefined') {
    console.log('Server-side initialization');
    // Create hardcoded users if they don't exist
    ensureUsersExist()
      .then(() => {
        console.log('User initialization complete');
        // Load jobs for hardcoded users from database
        return loadJobsFromDatabase();
      })
      .then(() => {
        console.log('Job initialization complete');
      })
      .catch(error => {
        console.error('Initialization error:', error);
      });
  }
} catch (error) {
  console.error('Top-level initialization error:', error);
}

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