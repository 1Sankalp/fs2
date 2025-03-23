'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import JobList from '../../components/JobList';
import ScraperForm from '../../components/ScraperForm';
import { FiPlusCircle, FiList, FiLogOut, FiUser, FiMail, FiHome, FiClock, FiLoader, FiAlertCircle, FiInbox, FiChevronRight, FiCalendar } from 'react-icons/fi';
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update URL when tab changes
  useEffect(() => {
    const newUrl = activeTab === 'jobs' 
      ? '/dashboard?tab=jobs' 
      : '/dashboard';
    
    window.history.replaceState(null, '', newUrl);
  }, [activeTab]);

  // Load jobs when component mounts
  useEffect(() => {
    async function loadJobs() {
      try {
        // Import and call loadJobsFromDatabase when component mounts
        const { loadJobsFromDatabase } = await import('@/lib/hardcodedJobs');
        await loadJobsFromDatabase();
        setRefreshTrigger(prev => prev + 1); // Trigger a refresh after loading
      } catch (error) {
        console.error('Error loading jobs in dashboard:', error);
      }
    }
    
    loadJobs();
    
    // Refresh job list every 30 seconds to catch any changes
    const refreshInterval = setInterval(() => setRefreshTrigger(prev => prev + 1), 30000);
    return () => clearInterval(refreshInterval);
  }, []);

  // Get job list
  useEffect(() => {
    const getJobs = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/jobs');
        const data = await response.json();
        console.log('Fetched jobs:', data);
        setJobs(data || []);
      } catch (error) {
        console.error('Error fetching jobs:', error);
        setError('Failed to load jobs. Please try again.');
        setJobs([]);
      } finally {
        setLoading(false);
      }
    };
    
    getJobs();
  }, [session, refreshTrigger]);

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
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ScraperForm onSuccess={() => {
                    setActiveTab('jobs');
                    setRefreshTrigger(prev => prev + 1); // Refresh job list after new job creation
                  }} />
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <JobsList jobs={jobs} loading={loading} error={error} />
                </motion.div>
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

// Add the JobsList component
const JobsList = ({ jobs, loading, error }: { jobs: any[], loading: boolean, error: string | null }) => {
  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-pulse flex justify-center mb-3">
          <FiLoader className="text-primary-500 text-2xl" />
        </div>
        <p className="text-slate-600">Loading your jobs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="flex justify-center mb-3 text-red-500">
          <FiAlertCircle className="text-2xl" />
        </div>
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="flex justify-center mb-3 text-slate-400">
          <FiInbox className="text-3xl" />
        </div>
        <p className="text-slate-600 mb-2">No jobs found</p>
        <p className="text-slate-500 text-sm">Create a new job to get started</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {jobs.map((job) => (
        <div key={job.id} className="p-4 hover:bg-slate-50 transition-colors">
          <Link href={`/dashboard/results/${job.id}`} className="block">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium text-slate-800">{job.name}</h3>
                <div className="text-sm text-slate-500 mt-1 flex items-center">
                  <FiCalendar className="mr-1" size={14} />
                  <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                  <span className="mx-2">•</span>
                  <StatusBadge status={job.status} />
                </div>
              </div>
              <div className="flex items-center">
                <div className="text-right mr-4">
                  <div className="text-sm font-medium text-slate-700">
                    {job.processedUrls || 0}/{job.totalUrls || 0} processed
                  </div>
                  <div className="w-24 bg-slate-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-primary-500 h-2 rounded-full"
                      style={{ width: `${job.progress || 0}%` }}
                    ></div>
                  </div>
                </div>
                <FiChevronRight className="text-slate-400" />
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
};

// Add the StatusBadge component
const StatusBadge = ({ status }: { status: string }) => {
  let color = '';
  let label = status;
  
  switch (status.toLowerCase()) {
    case 'completed':
      color = 'bg-green-100 text-green-800';
      break;
    case 'processing':
      color = 'bg-blue-100 text-blue-800';
      break;
    case 'pending':
      color = 'bg-yellow-100 text-yellow-800';
      break;
    case 'failed':
      color = 'bg-red-100 text-red-800';
      break;
    default:
      color = 'bg-slate-100 text-slate-800';
  }
  
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  );
};

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