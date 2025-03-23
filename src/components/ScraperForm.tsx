'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiLink, FiSearch, FiPlay, FiExternalLink, FiTable, FiAlertCircle, FiInfo, FiArrowRight, FiTag } from 'react-icons/fi';

interface ScraperFormProps {
  onSuccess?: () => void;
}

export default function ScraperForm({ onSuccess }: ScraperFormProps) {
  const router = useRouter();
  const [sheetUrl, setSheetUrl] = useState('');
  const [columnName, setColumnName] = useState('');
  const [jobName, setJobName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState<string[] | null>(null);
  const [columnOptions, setColumnOptions] = useState<string[]>([]);

  const handleSheetUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSheetUrl(e.target.value);
    setPreviewData(null);
    setColumnOptions([]);
    setColumnName('');
  };

  const handlePreview = async () => {
    if (!sheetUrl.includes('docs.google.com/spreadsheets')) {
      setError('Please enter a valid Google Sheets URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/sheets/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to preview sheet');
      }

      setColumnOptions(data.columns || []);
      setPreviewData(data.preview || []);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Failed to preview sheet');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl || !columnName || !jobName) {
      setError('Please fill out all required fields');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sheetUrl,
          columnName,
          name: jobName,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create job');
      }
      
      console.log('Job created successfully:', data);
      
      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      } else {
        // Default behavior if no callback provided
        router.push(`/dashboard/results/${data.id}`);
      }
    } catch (error) {
      console.error('Error creating job:', error);
      setError(error instanceof Error ? error.message : 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden border border-gray-100 relative z-10">
      <div className="p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 rounded-lg text-sm flex items-start animate-fade-in">
            <FiAlertCircle className="mr-2 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="sheetUrl" className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
              <div className="w-6 h-6 bg-primary/10 text-primary rounded-md flex items-center justify-center mr-2">
                <FiLink size={14} />
              </div>
              Google Sheet URL
            </label>
            <div className="mt-1">
              <div className="relative group">
                <input
                  id="sheetUrl"
                  name="sheetUrl"
                  type="text"
                  required
                  value={sheetUrl}
                  onChange={handleSheetUrlChange}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="block w-full px-4 py-3 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white/70 backdrop-blur-sm"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500 flex items-center ml-1">
                <FiInfo className="mr-1.5 text-primary/60" size={12} />
                Make sure your Google Sheet is shared with "Anyone with the link can view"
              </p>
            </div>
          </div>
          
          <div className="flex justify-start">
            <button
              type="button"
              onClick={handlePreview}
              disabled={isLoading || !sheetUrl}
              className={`py-2.5 px-5 rounded-xl flex items-center font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all shadow-sm ${
                isLoading || !sheetUrl 
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                  : 'bg-white text-primary border border-primary/20 hover:bg-primary/5 focus:ring-primary/40'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading...
                </span>
              ) : (
                <>
                  <FiSearch className="mr-2" />
                  Preview Sheet
                </>
              )}
            </button>
          </div>
          
          {columnOptions.length > 0 && (
            <div className="mt-6">
              <label htmlFor="columnName" className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center">
                  <FiTable className="text-gray-400 mr-2" />
                  <span>Select Column with Website URLs</span>
                </div>
              </label>
              <select
                id="columnName"
                className="block w-full pl-3 pr-10 py-2.5 text-base border border-gray-300 focus:outline-none focus:ring-primary/20 focus:border-primary sm:text-sm rounded-lg"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
              >
                <option value="">-- Select a column --</option>
                {columnOptions.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {columnName && (
            <div className="mt-6">
              <label htmlFor="jobName" className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center">
                  <FiTag className="text-gray-400 mr-2" />
                  <span>Job Name (Optional)</span>
                </div>
              </label>
              <input
                id="jobName"
                type="text"
                className="block w-full pl-3 pr-3 py-2.5 text-base border border-gray-300 focus:outline-none focus:ring-primary/20 focus:border-primary sm:text-sm rounded-lg"
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                placeholder={`${columnName} extraction`}
              />
              <p className="mt-1 text-xs text-gray-500">Give this job a name to easily identify it later</p>
            </div>
          )}
          
          {previewData && previewData.length > 0 && (
            <div className="pt-6 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <div className="w-6 h-6 bg-primary/10 text-primary rounded-md flex items-center justify-center mr-2">
                  <FiExternalLink size={14} />
                </div>
                Total Websites: {previewData.length}
              </h3>
              <div className="bg-white/70 backdrop-blur-sm rounded-xl overflow-hidden border border-gray-200 shadow-sm p-4">
                <p className="text-sm text-gray-600">
                  The system will process {previewData.length} website{previewData.length !== 1 ? 's' : ''} from the selected column.
                  <br />
                  Each website will be analyzed for contact emails.
                </p>
              </div>
            </div>
          )}
          
          <div className="pt-6 border-t border-gray-100">
            <button
              type="submit"
              disabled={isSubmitting || !sheetUrl || !columnName}
              className={`w-full py-3 px-4 rounded-xl flex items-center justify-center font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 transition-all shadow-md ${
                isSubmitting || !sheetUrl || !columnName 
                  ? 'bg-gradient-to-r from-primary/60 to-indigo-500/60 text-white cursor-not-allowed' 
                  : 'bg-gradient-to-r from-primary to-indigo-600 text-white hover:shadow-lg'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                <>
                  <span>Start Scraping Job</span>
                  <div className="ml-2 p-1 bg-white/20 rounded-full">
                    <FiArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
} 