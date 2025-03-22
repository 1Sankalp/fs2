import Link from 'next/link';
import { FiAlertCircle, FiArrowLeft, FiHome } from 'react-icons/fi';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-lg w-full">
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100 p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-danger/10 text-danger rounded-full mb-6">
            <FiAlertCircle size={40} />
          </div>
          
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Page Not Found</h1>
          
          <p className="text-gray-600 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/"
              className="py-3 px-6 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <FiHome /> Go to Home
            </Link>
            
            <button 
              onClick={() => window.history.back()}
              className="py-3 px-6 bg-white text-gray-700 border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <FiArrowLeft /> Go Back
            </button>
          </div>
        </div>
      </div>
    </main>
  );
} 