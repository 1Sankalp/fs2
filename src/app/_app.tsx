import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { AppProps } from 'next/app';
import { initializeHardcodedJobs } from '@/lib/hardcodedJobs';

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  // Initialize hardcoded jobs on client side
  useEffect(() => {
    try {
      console.log('Initializing hardcoded jobs from localStorage and DB');
      initializeHardcodedJobs();
    } catch (error) {
      console.error('Failed to initialize hardcoded jobs:', error);
    }
  }, []);

  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
} 