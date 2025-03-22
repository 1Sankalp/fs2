'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import JobList from '../../components/JobList';
import ScraperForm from '../../components/ScraperForm';
import { FiPlusCircle, FiList, FiLogOut, FiUser, FiMail, FiHome, FiClock } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Link from 'next/link';

// Create a separate component for the parts that use useSearchParams
function DashboardContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'new' | 'jobs'>(
    tabParam === 'jobs' ? 'jobs' : 'new'
  );

  // Update URL when tab changes
  useEffect(() => {
    const newUrl = activeTab === 'jobs' 
      ? '/dashboard?tab=jobs' 
      : '/dashboard';
    
    window.history.replaceState(null, '', newUrl);
  }, [activeTab]);

  if (!session) {
    return null; // Will redirect to login page due to the useEffect in parent
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Modern glass-effect header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="bg-primary-50 p-2 rounded-full text-primary-600 mr-3">
                <FiMail className="text-xl" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">FunnelStrike Email Scraper</h1>
            </div>
            
            <div className="flex items-center space-x-3">
              <Link
                href="/"
                className="flex items-center text-sm bg-white py-2 px-4 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <FiHome className="mr-2 text-primary-600" />
                Home
              </Link>
              
              <div className="flex items-center text-sm bg-white py-2 px-4 rounded-full border border-slate-200 shadow-sm">
                <FiUser className="mr-2 text-primary-600" />
                <span className="font-medium text-slate-700 truncate max-w-[200px]">
                  {session.user.name || session.user.email}
                </span>
              </div>
              
              <button
                onClick={() => router.push('/api/auth/signout')}
                className="flex items-center text-sm bg-white py-2 px-4 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <FiLogOut className="mr-2 text-red-500" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-white/80 backdrop-blur-sm shadow-md rounded-xl overflow-hidden border border-slate-200">
            {/* Modern tab navigation */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1.5">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex items-center py-2.5 px-5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'new'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                }`}
              >
                <FiPlusCircle className={`mr-2 ${activeTab === 'new' ? 'text-primary-600' : 'text-slate-400'}`} />
                New Extraction
              </button>
              <button
                onClick={() => setActiveTab('jobs')}
                className={`flex items-center py-2.5 px-5 text-sm font-medium rounded-lg transition-all ${
                  activeTab === 'jobs'
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
                }`}
              >
                <FiList className={`mr-2 ${activeTab === 'jobs' ? 'text-primary-600' : 'text-slate-400'}`} />
                My Jobs
              </button>
            </div>

            <div className="p-6">
              {activeTab === 'new' ? (
                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Start a New Email Extraction</h2>
                    <p className="text-slate-600">
                      Import a list of websites from a Google Sheet and start extracting email addresses.
                    </p>
                  </div>
                  <ScraperForm />
                </div>
              ) : (
                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Your Extraction Jobs</h2>
                    <p className="text-slate-600">
                      View and manage your email extraction jobs. Download results when complete.
                    </p>
                  </div>
                  <JobList />
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </main>
      
      <footer className="border-t border-slate-200 bg-white/30 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="text-xs text-slate-500">
              &copy; {new Date().getFullYear()} FunnelStrike. All rights reserved.
            </div>
            <div className="flex items-center text-xs text-slate-500">
              <FiClock className="mr-1" /> Last updated: {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Loading fallback component
function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-slate-600 font-medium">Loading dashboard...</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <DashboardLoading />;
  }

  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
} 