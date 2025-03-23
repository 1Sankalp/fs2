'use client';

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FiCheckCircle, FiDownload, FiInfo, FiLoader, FiAlertTriangle, FiX, FiClock, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface Job {
  id: string;
  status: string;
  sheetUrl: string;
  columnName: string;
  totalUrls: number;
  processedUrls: number;
  createdAt: string;
  updatedAt: string;
  name?: string;
}

export default function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<string | null>(null);

  const fetchJobs = async (retryCount = 0, maxRetries = 2) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching jobs, attempt:", retryCount + 1);
      const res = await fetch('/api/jobs');
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch jobs');
      }
      
      const data = await res.json();
      console.log("Received jobs:", data.jobs?.length || 0);
      
      if (data.jobs && Array.isArray(data.jobs)) {
        // Log detailed job info for debugging
        data.jobs.forEach((job: Job) => {
          console.log(`Job: ${job.id}, User: ${(job as any).userId || 'unknown'}, Status: ${job.status}`);
        });
        
        setJobs(data.jobs);
      } else {
        console.error('Invalid jobs data structure:', data);
        setJobs([]);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
      
      if (retryCount < maxRetries) {
        console.log(`Retrying fetch jobs (attempt ${retryCount + 1} of ${maxRetries})`);
        setTimeout(() => {
          fetchJobs(retryCount + 1, maxRetries);
        }, 1000 * (retryCount + 1)); // Exponential backoff
        return;
      }
      
      setError('Failed to load jobs. Please try again.');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      return;
    }
    
    setDeletingJob(jobId);
    
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete job');
      }
      
      // Remove the job from the list
      setJobs(jobs.filter(job => job.id !== jobId));
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Failed to delete the job. Please try again.');
    } finally {
      setDeletingJob(null);
    }
  };

  useEffect(() => {
    fetchJobs();
    
    // Set up polling for job updates
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchJobs();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FiCheckCircle className="text-emerald-500" size={20} />;
      case 'processing':
        return <FiLoader className="text-blue-500 animate-spin" size={20} />;
      case 'pending':
        return <FiClock className="text-amber-500" size={20} />;
      case 'failed':
        return <FiAlertTriangle className="text-red-500" size={20} />;
      default:
        return <FiInfo className="text-gray-500" size={20} />;
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

  const getEstimatedTimeRemaining = (job: Job) => {
    if (job.status !== 'processing' || job.processedUrls === 0) {
      return null;
    }
    
    // Calculate elapsed time in seconds
    const createdAt = new Date(job.createdAt).getTime();
    const now = new Date().getTime();
    const elapsedSeconds = (now - createdAt) / 1000;
    
    // Calculate URLs per second
    const urlsPerSecond = job.processedUrls / elapsedSeconds;
    
    // If the rate is too low, it might be an issue with processing
    if (urlsPerSecond < 0.001) {
      return "Calculating...";
    }
    
    // Calculate remaining time in seconds
    const remainingUrls = job.totalUrls - job.processedUrls;
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

  if (loading && jobs.length === 0) {
    return (
      <div className="w-full flex items-center justify-center p-12">
        <div className="flex flex-col items-center">
          <FiLoader className="animate-spin text-primary-600 mb-3" size={32} />
          <p className="text-gray-600">Loading job history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full rounded-lg bg-red-50 p-4 border border-red-200 mb-6 flex items-center"
      >
        <FiAlertTriangle className="text-red-500 mr-3" size={20} />
        <span className="text-red-700">{error}</span>
        <button 
          onClick={() => fetchJobs()}
          className="ml-auto bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded-md text-sm flex items-center"
        >
          <FiRefreshCw className="mr-1" size={14} /> Retry
        </button>
      </motion.div>
    );
  }

  if (jobs.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-8 flex flex-col items-center justify-center"
      >
        <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-100 max-w-md mx-auto">
          <FiInfo className="mx-auto text-gray-400 mb-3" size={32} />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No jobs found</h3>
          <p className="text-gray-600 mb-4">You haven't created any email extraction jobs yet.</p>
          <Link 
            href="/"
            className="btn inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Start New Extraction
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full overflow-hidden bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm"
    >
      <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-800">Your Extraction Jobs</h2>
        <button
          onClick={() => fetchJobs()}
          className="flex items-center space-x-2 bg-primary-50 hover:bg-primary-100 text-primary-700 py-2 px-3 rounded-md transition-colors text-sm"
        >
          <FiRefreshCw className="mr-1" />
          <span>Refresh</span>
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Progress
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {jobs.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {getStatusIcon(job.status)}
                    <span className="ml-2 text-sm text-gray-700">
                      {getStatusText(job.status)}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-gray-900 mb-1 truncate max-w-[200px] font-medium">
                      {job.name || `${job.columnName} extraction`}
                    </span>
                    <span className="text-xs text-gray-500">
                      Source: {job.sheetUrl.replace(/^https?:\/\//, '').split('/')[0]}
                    </span>
                    <span className="text-xs text-gray-500">
                      Column: {job.columnName}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col space-y-1">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{job.processedUrls || 0} of {job.totalUrls}</span>
                      <span>
                        {job.totalUrls > 0
                          ? Math.round((job.processedUrls || 0) / job.totalUrls * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className="bg-primary-600 h-1.5 rounded-full"
                        style={{ 
                          width: `${job.totalUrls > 0 
                            ? Math.round((job.processedUrls || 0) / job.totalUrls * 100)
                            : 0}%` 
                        }}
                      />
                    </div>
                    {job.status === 'processing' && (
                      <div className="mt-1 text-xs text-blue-600 flex items-center">
                        <FiClock className="mr-1" size={12} />
                        <span>ETA: {getEstimatedTimeRemaining(job)}</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {format(new Date(job.createdAt), 'MMM d, yyyy h:mm a')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <Link 
                    href={`/dashboard/results/${job.id}`}
                    className="text-primary-600 hover:text-primary-800 mr-3"
                  >
                    <FiInfo size={18} className="inline" /> View
                  </Link>
                  {job.status === 'completed' && (
                    <Link 
                      href={`/api/jobs/${job.id}/download`}
                      className="text-emerald-600 hover:text-emerald-800"
                    >
                      <FiDownload size={18} className="inline" /> Download
                    </Link>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteJob(job.id);
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <FiTrash2 size={18} className="inline" /> Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
} 