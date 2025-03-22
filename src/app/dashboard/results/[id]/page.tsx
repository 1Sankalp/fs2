'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FiDownload, FiArrowLeft, FiCopy, FiClipboard, FiMail, FiCheckCircle, FiAlertCircle, FiExternalLink, FiCalendar, FiGrid, FiSearch } from 'react-icons/fi';

type ResultItem = {
  website: string;
  email: string | null;
};

// Function to find common email from set of similar emails
const findCommonEmail = (emails: string[]): string => {
  if (!emails || emails.length === 0) return '';
  if (emails.length === 1) return emails[0];

  // Sort emails by length (shortest first)
  const sortedEmails = [...emails].sort((a, b) => a.length - b.length);
  const shortestEmail = sortedEmails[0];
  
  // Check if all other emails contain the shortest one
  if (sortedEmails.every(email => email.endsWith(shortestEmail))) {
    return shortestEmail;
  }
  
  // Try to find the common suffix (domain part)
  const domains = emails.map(email => {
    const atIndex = email.indexOf('@');
    return atIndex >= 0 ? email.substring(atIndex) : email;
  });
  
  const commonDomain = domains.reduce((common, domain) => {
    if (!common) return domain;
    // Find the longest common ending between current common and this domain
    let i = 1;
    while (i <= Math.min(common.length, domain.length) && 
           common.slice(-i) === domain.slice(-i)) {
      i++;
    }
    return common.slice(-i + 1);
  }, '');
  
  // Find username parts that are common or contained in others
  const usernames = emails.map(email => {
    const atIndex = email.indexOf('@');
    return atIndex >= 0 ? email.substring(0, atIndex) : '';
  });
  
  // For simplicity, find the shortest username that is contained in all others
  const sortedByUsernameLength = [...emails].sort((a, b) => {
    const aUsername = a.split('@')[0] || '';
    const bUsername = b.split('@')[0] || '';
    return aUsername.length - bUsername.length;
  });
  
  // Try each email, shortest username first
  for (const email of sortedByUsernameLength) {
    const [username, domain] = email.split('@');
    if (domain && domain.endsWith(commonDomain.slice(1)) && 
        sortedByUsernameLength.every(e => 
          e === email || e.includes(username + '@')
        )) {
      return email;
    }
  }
  
  // If no clear pattern, return the shortest email
  return shortestEmail;
};

// Group similar emails by domain
const groupAndCleanEmails = (results: ResultItem[]): ResultItem[] => {
  if (!results || results.length === 0) return [];
  
  // Group by website
  const websiteGroups: Record<string, string[]> = {};
  
  results.forEach(result => {
    if (result.email) {
      if (!websiteGroups[result.website]) {
        websiteGroups[result.website] = [];
      }
      websiteGroups[result.website].push(result.email);
    }
  });
  
  // Clean each group and create new results
  const cleanedResults: ResultItem[] = [];
  
  results.forEach(result => {
    // Skip if already processed
    if (cleanedResults.some(r => r.website === result.website)) {
      return;
    }
    
    const emails = websiteGroups[result.website];
    if (!emails || emails.length === 0) {
      cleanedResults.push(result); // Keep as is if no emails
    } else if (emails.length === 1) {
      cleanedResults.push({
        website: result.website,
        email: emails[0]
      });
    } else {
      // Find the common/cleanest email from the set
      const cleanedEmail = findCommonEmail(emails);
      cleanedResults.push({
        website: result.website,
        email: cleanedEmail
      });
    }
  });
  
  return cleanedResults;
};

export default function JobResults({ params }: { params: { id: string } }) {
  // Replace the direct Promise.resolve with a simple variable assignment
  const jobId = params.id;
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobData, setJobData] = useState<{
    id: string;
    sheetUrl: string;
    columnName: string;
    status: string;
    createdAt: string;
    totalUrls: number;
    processedUrls: number;
  } | null>(null);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [cleanedResults, setCleanedResults] = useState<ResultItem[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Fetch job results
  useEffect(() => {
    if (session && jobId) {
      const fetchJobResults = async () => {
        try {
          setIsLoading(true);
          const response = await fetch(`/api/jobs/${jobId}`);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch job results');
          }

          setJobData(data.job);
          setResults(data.results || []);
        } catch (error) {
          if (error instanceof Error) {
            setError(error.message);
          } else {
            setError('Failed to fetch job results');
          }
        } finally {
          setIsLoading(false);
        }
      };

      fetchJobResults();
    }
  }, [session, jobId]);

  // Clean and group emails when results change
  useEffect(() => {
    if (results.length > 0) {
      const cleaned = groupAndCleanEmails(results);
      setCleanedResults(cleaned);
    } else {
      setCleanedResults([]);
    }
  }, [results]);

  const handleCopyEmail = (email: string, index: number) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  const handleCopyAllToClipboard = () => {
    if (cleanedResults.length === 0) return;

    // Format as a two-column table with tab delimiter
    // Each row has a website and its corresponding email
    const tableContent = cleanedResults
      .map(result => `${result.website || ''}\t${result.email || ''}`)
      .join('\n');
    
    // This creates a proper table structure when pasted into applications like Excel or Google Sheets
    navigator.clipboard.writeText(tableContent).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  };

  // Filter results by search term
  const filteredResults = searchTerm
    ? cleanedResults.filter(result => 
        (result.website?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        result.email?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : cleanedResults;

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading job results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-8">
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-100 max-w-2xl mx-auto">
          <div className="flex items-center text-red-700 mb-2">
            <FiAlertCircle className="mr-2" size={20} />
            <h3 className="font-semibold">Error Loading Results</h3>
          </div>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-white text-primary hover:bg-gray-50 border border-primary/20 rounded-lg transition-colors flex items-center text-sm font-medium shadow-sm"
          >
            <FiArrowLeft className="mr-2" /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <header className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center">
            <FiMail className="text-primary text-xl mr-2" />
            <h1 className="text-xl font-bold text-gray-800">Email Scraper</h1>
          </div>
          <button
            onClick={() => router.push('/dashboard?tab=jobs')}
            className="text-gray-600 hover:text-primary transition-colors flex items-center font-medium"
          >
            <FiArrowLeft className="mr-2" /> Back to Jobs
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
        <div className="px-4 py-4 sm:px-0">
          {jobData && (
            <div className="bg-white shadow-md rounded-xl p-6 mb-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                <FiGrid className="mr-2 text-primary" />
                Job Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-medium text-gray-500 uppercase flex items-center">
                    <FiExternalLink className="mr-1.5 text-gray-400" size={14} />
                    Google Sheet
                  </h3>
                  <p className="mt-1 text-sm text-gray-900 break-all font-medium">{jobData.sheetUrl}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-medium text-gray-500 uppercase flex items-center">
                    <FiGrid className="mr-1.5 text-gray-400" size={14} />
                    Column Used
                  </h3>
                  <p className="mt-1 text-sm text-gray-900 font-medium">{jobData.columnName}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-medium text-gray-500 uppercase flex items-center">
                    <FiCalendar className="mr-1.5 text-gray-400" size={14} />
                    Created
                  </h3>
                  <p className="mt-1 text-sm text-gray-900 font-medium">
                    {new Date(jobData.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-500 flex items-center">
                  <FiCheckCircle className="text-green-500 mr-2" />
                  <span>Found <span className="font-bold text-gray-700">{cleanedResults.length}</span> emails from <span className="font-bold text-gray-700">{jobData.totalUrls || 0}</span> websites</span>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCopyAllToClipboard}
                    className="flex items-center px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm border border-gray-200"
                  >
                    <FiClipboard className="mr-2" /> 
                    {allCopied ? 'Copied!' : 'Copy All'}
                  </button>
                  <a
                    href={`/api/jobs/${jobData.id}/download`}
                    className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm shadow-sm"
                    download={`emails-${jobData.id}.csv`}
                  >
                    <FiDownload className="mr-2" /> Download CSV
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <FiMail className="text-primary mr-2" />
                Email Results
                <span className="ml-2 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-0.5 rounded">
                  {filteredResults.length} emails found
                </span>
              </h2>
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FiSearch className="text-gray-400" size={16} />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  placeholder="Search website or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            {filteredResults.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-gray-400 mb-2">
                  <FiMail size={40} className="mx-auto" />
                </div>
                <p className="text-gray-700 font-medium">No emails found{searchTerm ? ' matching your search' : ' for this job'}.</p>
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="mt-2 text-primary hover:underline text-sm"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* Fixed height container (10 rows) */}
                <div className="h-[400px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 compact-table">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Website
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                          Copy
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredResults.map((result, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                            <a 
                              href={result.website.startsWith('http') ? result.website : `http://${result.website}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-primary hover:underline transition-colors flex items-center"
                            >
                              {result.website}
                              <FiExternalLink className="ml-1.5" size={12} />
                            </a>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 truncate max-w-xs font-medium">
                            {result.email || (
                              <span className="text-gray-400 italic">No email found</span>
                            )}
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500">
                            {result.email && (
                              <button
                                onClick={() => handleCopyEmail(result.email!, index)}
                                className="p-1.5 rounded-md text-gray-600 hover:text-primary hover:bg-gray-100 transition-colors"
                                title="Copy email"
                              >
                                {copiedIndex === index ? (
                                  <FiCheckCircle className="text-green-500" size={16} />
                                ) : (
                                  <FiCopy size={16} />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-center text-sm text-gray-500 mt-6">
            <p>Need help? Check our <a href="#" className="text-primary hover:underline">documentation</a> or <a href="#" className="text-primary hover:underline">contact support</a>.</p>
          </div>
        </div>
      </main>
    </div>
  );
} 