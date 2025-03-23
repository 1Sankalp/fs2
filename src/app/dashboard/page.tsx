'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import JobList from '../../components/JobList';
import ScraperForm from '../../components/ScraperForm';
import { FiPlusCircle, FiList, FiLogOut, FiUser, FiMail, FiHome, FiClock, FiLoader, FiAlertCircle, FiInbox, FiChevronRight, FiCalendar, FiCheckCircle, FiInfo, FiRefreshCw, FiDownload, FiTrash2, FiSearch, FiX } from 'react-icons/fi';
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
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [refreshingJobs, setRefreshingJobs] = useState<string[]>([]);

  // Update URL when tab changes
  useEffect(() => {
    const newUrl = activeTab === 'jobs' 
      ? '/dashboard?tab=jobs' 
      : '/dashboard';
    
    window.history.replaceState(null, '', newUrl);
  }, [activeTab]);

  // Get details about a specific job
  const refreshJobDetails = async (jobId: string) => {
    try {
      // Mark this job as refreshing
      setRefreshingJobs(prev => [...prev, jobId]);
      
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch job: ${response.status}`);
      }
      const data = await response.json();
      
      if (data.job) {
        // Update just this job in the state
        setJobs(prevJobs => 
          prevJobs.map(job => 
            job.id === jobId ? data.job : job
          )
        );
        return data.job;
      }
      return null;
    } catch (error) {
      console.error(`Error refreshing job ${jobId}:`, error);
      return null;
    } finally {
      // Remove this job from refreshing state
      setRefreshingJobs(prev => prev.filter(id => id !== jobId));
    }
  };

  // Handle job refresh manually for all jobs
  const refreshJobs = async () => {
    setLoading(true);
    try {
      // First try to import and reload from database
      try {
        const { loadJobsFromDatabase } = await import('@/lib/hardcodedJobs');
        console.log('Reloading jobs from database...');
        await loadJobsFromDatabase();
      } catch (dbError) {
        console.error('Error reloading from database:', dbError);
        // Continue with API call even if database reload fails
      }

      const response = await fetch('/api/jobs');
      if (!response.ok) {
        throw new Error(`Failed to fetch jobs: ${response.status}`);
      }
      const data = await response.json();
      console.log('Refreshed jobs:', data);
      setJobs(data.jobs || []);
      return data.jobs || [];
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError('Failed to load jobs. Please try again.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Handle job deletion
  const handleJobDeleted = async (jobId: string) => {
    // Remove the deleted job from the state
    setJobs((currentJobs) => currentJobs.filter((job: any) => job.id !== jobId));
  };

  // Load jobs when component mounts
  useEffect(() => {
    async function loadJobs() {
      try {
        // Import and call loadJobsFromDatabase when component mounts
        const { loadJobsFromDatabase } = await import('@/lib/hardcodedJobs');
        await loadJobsFromDatabase();
        
        // Then fetch jobs from API
        refreshJobs(); // Use the refreshJobs function to load jobs initially
      } catch (error) {
        console.error('Error loading jobs in dashboard:', error);
      }
    }
    
    loadJobs();
    
    return () => {
      // Clear auto-refresh interval when component unmounts
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, []); // Only run once on mount

  // Set up auto-refresh if enabled
  useEffect(() => {
    // Clear existing interval if any
    if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }
    
    // Set up new interval if auto-refresh is enabled
    if (autoRefreshEnabled) {
      autoRefreshIntervalRef.current = setInterval(() => {
        // Only auto-refresh if the jobs tab is active
        if (activeTab === 'jobs' && jobs.length > 0) {
          // Instead of refreshing all jobs, refresh each one individually
          jobs.forEach(job => {
            if (job.status === 'processing') {
              // Only auto-refresh jobs that are still processing
              refreshJobDetails(job.id);
            }
          });
        }
      }, 5000); // 5 seconds interval
    }
    
    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefreshEnabled, activeTab, jobs]);

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
                  {session.user?.name || session.user?.email}
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
                    refreshJobs(); // Refresh job list after new job creation
                  }} />
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <JobsList 
                    jobs={jobs} 
                    loading={loading} 
                    error={error} 
                    onRefresh={refreshJobs}
                    onDelete={handleJobDeleted}
                    onRefreshJob={refreshJobDetails}
                    refreshingJobs={refreshingJobs}
                  />
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
            <div className="flex items-center space-x-3">
              <div className="text-xs text-slate-500 flex items-center">
                <FiClock className="mr-1" /> Last updated: {new Date().toLocaleDateString()}
              </div>
              <button 
                onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                className={`flex items-center text-xs py-1 px-2 rounded ${
                  autoRefreshEnabled 
                    ? 'bg-green-50 text-green-700' 
                    : 'bg-slate-50 text-slate-700'
                }`}
              >
                <FiRefreshCw className={`mr-1 ${autoRefreshEnabled ? 'text-green-600' : 'text-slate-600'}`} size={12} />
                {autoRefreshEnabled ? 'Auto-refresh on' : 'Auto-refresh off'}
              </button>
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
const JobsList = ({ jobs, loading, error, onRefresh, onDelete, onRefreshJob, refreshingJobs }: { 
  jobs: any[], 
  loading: boolean, 
  error: string | null, 
  onRefresh: () => Promise<any[]>, 
  onDelete: (jobId: string) => Promise<void>,
  onRefreshJob: (jobId: string) => Promise<any>,
  refreshingJobs: string[]
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [deletingJobs, setDeletingJobs] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
  const handleRefreshJobs = async () => {
    setRefreshing(true);
    try {
      const refreshedJobs = await onRefresh();
      console.log('Manually refreshed jobs:', refreshedJobs);
      // Return the data (parent component will update its state)
      return refreshedJobs;
    } catch (error) {
      console.error('Error refreshing jobs:', error);
      // Return empty array on error
      return [];
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshJob = async (jobId: string) => {
    try {
      const refreshedJob = await onRefreshJob(jobId);
      console.log('Refreshed single job:', refreshedJob);
      return refreshedJob;
    } catch (error) {
      console.error(`Error refreshing job ${jobId}:`, error);
      return null;
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (confirm('Are you sure you want to delete this job?')) {
      try {
        // Mark job as deleting
        setDeletingJobs(prev => [...prev, jobId]);
        setDeleteError(null);
        
        // First delete from the server
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to delete job: ${response.status}`);
        }
        
        // Then update the parent component's state
        await onDelete(jobId);
        
        // Provide visual feedback without reloading the page
        console.log(`Successfully deleted job ${jobId}`);
        return jobId;
      } catch (error: any) {
        console.error('Error deleting job:', error);
        setDeleteError(`Failed to delete job: ${error.message || 'Unknown error'}`);
        // Don't alert, we'll show the error in the UI
        return null;
      } finally {
        // Remove from deleting state regardless of outcome
        setDeletingJobs(prev => prev.filter(id => id !== jobId));
      }
    }
    return null;
  };
  
  // Clear delete error when jobs change
  useEffect(() => {
    if (deleteError) setDeleteError(null);
  }, [jobs]);

  if (loading && !refreshing) {
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
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-slate-800">Your Extraction Jobs</h2>
        <button
          onClick={handleRefreshJobs}
          className="flex items-center space-x-2 bg-primary-50 hover:bg-primary-100 text-primary-700 py-2 px-3 rounded-md transition-colors text-sm"
          disabled={refreshing}
        >
          <FiRefreshCw className={`mr-1 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>
      
      {deleteError && (
        <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-md flex items-center">
          <FiAlertCircle className="mr-2" />
          <span>{deleteError}</span>
          <button 
            className="ml-auto text-red-500 hover:text-red-700" 
            onClick={() => setDeleteError(null)}
          >
            <FiX />
          </button>
        </div>
      )}

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
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {jobs.map((job) => {
              const isRefreshing = refreshingJobs.includes(job.id);
              const isDeleting = deletingJobs.includes(job.id);
              
              return (
                <tr key={job.id} className={`hover:bg-slate-50/50 transition-colors ${isRefreshing ? 'bg-slate-50/30' : ''} ${isDeleting ? 'opacity-50 bg-red-50/10' : ''}`}>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {isDeleting ? (
                        <FiTrash2 className="text-red-500 animate-pulse" size={16} />
                      ) : isRefreshing ? (
                        <FiLoader className="text-blue-500 animate-spin" size={16} />
                      ) : (
                        getStatusIcon(job.status || 'pending')
                      )}
                      <span className="ml-2 text-sm text-slate-700">
                        {isDeleting ? 'Deleting...' : isRefreshing ? 'Updating...' : getStatusText(job.status || 'pending')}
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
                          className={`h-1.5 rounded-full ${isDeleting ? 'bg-red-500' : isRefreshing ? 'bg-blue-500' : 'bg-primary-600'}`}
                          style={{ 
                            width: `${(job.totalUrls || job.totalWebsites) > 0 
                              ? Math.round(((job.processedUrls || job.processedWebsites || 0) / (job.totalUrls || job.totalWebsites || 1)) * 100)
                              : 0}%` 
                          }}
                        />
                      </div>
                      {(job.status === 'processing' || isRefreshing) && !isDeleting && (
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
                  <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Link
                        href={`/dashboard/results/${job.id}`}
                        className={`text-primary-600 hover:text-primary-800 ${isDeleting ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <FiSearch size={16} className="inline mr-1" /> View
                      </Link>
                      
                      {job.status === 'completed' && !isDeleting && (
                        <Link
                          href={`/api/jobs/${job.id}/download`}
                          className="text-emerald-600 hover:text-emerald-800 ml-2"
                        >
                          <FiDownload size={16} className="inline mr-1" /> Download
                        </Link>
                      )}
                      
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className={`text-red-600 hover:text-red-800 ml-2 ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={isDeleting || isRefreshing || refreshing}
                      >
                        <FiTrash2 size={16} className={`inline mr-1 ${isDeleting ? 'animate-spin' : ''}`} /> 
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </button>
                      
                      {job.status === 'processing' && !isDeleting && (
                        <button
                          onClick={() => handleRefreshJob(job.id)}
                          className="text-blue-600 hover:text-blue-800 ml-2"
                          disabled={isRefreshing || isDeleting}
                        >
                          <FiRefreshCw size={16} className={`inline mr-1 ${isRefreshing ? 'animate-spin' : ''}`} /> 
                          {isRefreshing ? 'Updating' : 'Update'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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