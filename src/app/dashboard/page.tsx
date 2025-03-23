'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import JobList from '../../components/JobList';
import ScraperForm from '../../components/ScraperForm';
import { FiPlusCircle, FiList, FiLogOut, FiUser, FiMail, FiHome, FiClock, FiLoader, FiAlertCircle, FiInbox, FiChevronRight, FiCalendar, FiCheckCircle, FiInfo } from 'react-icons/fi';
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
        if (!response.ok) {
          throw new Error(`Failed to fetch jobs: ${response.status}`);
        }
        const data = await response.json();
        console.log('Fetched jobs:', data);
        setJobs(data.jobs || []);
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

  if (!jobs || jobs.length === 0) {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FiCheckCircle className="text-emerald-500" size={16} />;
      case 'processing':
        return <FiLoader className="text-blue-500 animate-spin" size={16} />;
      case 'pending':
        return <FiClock className="text-amber-500" size={16} />;
      case 'failed':
        return <FiAlertCircle className="text-red-500" size={16} />;
      default:
        return <FiInfo className="text-gray-500" size={16} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'processing':
        return 'Processing';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getEstimatedTimeRemaining = (job: any) => {
    if (job.status !== 'processing' || (job.processedUrls || job.processedWebsites) === 0) {
      return null;
    }
    
    // Calculate elapsed time in seconds
    const createdAt = new Date(job.createdAt).getTime();
    const now = new Date().getTime();
    const elapsedSeconds = (now - createdAt) / 1000;
    
    // Calculate URLs per second
    const processedCount = job.processedUrls || job.processedWebsites || 0;
    const urlsPerSecond = processedCount / elapsedSeconds;
    
    // If the rate is too low, it might be an issue with processing
    if (urlsPerSecond < 0.001) {
      return "Calculating...";
    }
    
    // Calculate remaining time in seconds
    const totalCount = job.totalUrls || job.totalWebsites || 1;
    const remainingUrls = totalCount - processedCount;
    const remainingSeconds = remainingUrls / urlsPerSecond;
    
    // Format the remaining time
    if (remainingSeconds < 60) {
      return "Less than a minute";
    } else if (remainingSeconds < 3600) {
      const minutes = Math.round(remainingSeconds / 60);
      return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.round((remainingSeconds % 3600) / 60);
      return `~${hours} hour${hours > 1 ? 's' : ''} ${minutes > 0 ? `${minutes} min` : ''}`;
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Job Details
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Progress
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              Created
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-100">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  {getStatusIcon(job.status || 'pending')}
                  <span className="ml-2 text-sm text-slate-700">
                    {getStatusText(job.status || 'pending')}
                  </span>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col">
                  <Link href={`/dashboard/results/${job.id}`} className="text-sm text-slate-900 mb-1 font-medium hover:text-primary-600">
                    {job.name || `${job.columnName} extraction`}
                  </Link>
                  <span className="text-xs text-slate-500">
                    Column: {job.columnName}
                  </span>
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap">
                <div className="flex flex-col space-y-1">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{(job.processedUrls || job.processedWebsites || 0)} of {(job.totalUrls || job.totalWebsites || 0)}</span>
                    <span>
                      {(job.totalUrls || job.totalWebsites) > 0
                        ? Math.round(((job.processedUrls || job.processedWebsites || 0) / (job.totalUrls || job.totalWebsites || 1)) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5">
                    <div 
                      className="bg-primary-600 h-1.5 rounded-full"
                      style={{ 
                        width: `${(job.totalUrls || job.totalWebsites) > 0 
                          ? Math.round(((job.processedUrls || job.processedWebsites || 0) / (job.totalUrls || job.totalWebsites || 1)) * 100)
                          : 0}%` 
                      }}
                    />
                  </div>
                  {(job.status === 'processing') && (
                    <div className="mt-1 text-xs text-blue-600 flex items-center">
                      <FiClock className="mr-1" size={12} />
                      <span>ETA: {getEstimatedTimeRemaining(job) || 'Calculating...'}</span>
                    </div>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500">
                {new Date(job.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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