'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FiUser, FiLock, FiMail, FiAlertCircle, FiArrowLeft, FiArrowRight } from 'react-icons/fi';
import Link from 'next/link';

export default function SignIn() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: formData.email,
        password: formData.password,
      });

      if (result?.error) {
        setError('Invalid username or password');
      } else {
        router.push('/dashboard');
      }
    } catch (error) {
      setError('An error occurred during sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f8fafc] to-[#f0f5ff]">
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-gradient-to-br from-primary-300/10 to-primary-200/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-[20%] -right-[5%] w-[40%] h-[40%] bg-gradient-to-br from-primary-400/10 to-primary-300/5 rounded-full blur-3xl"></div>
      </div>
      
      {/* Navigation */}
      <div className="w-full max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
        <Link href="/" className="text-gray-800 hover:text-primary transition-colors flex items-center gap-2 font-medium">
          <FiArrowLeft size={18} />
          <span>Back to Home</span>
        </Link>
        <div className="flex items-center">
          <FiMail className="text-primary mr-2" size={22} />
          <span className="font-semibold text-gray-900 text-xl">Email Scraper</span>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-white shadow-lg rounded-full flex items-center justify-center">
                <FiMail className="text-primary" size={28} />
              </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Welcome Back</h1>
            <p className="text-lg text-gray-600">Sign in to your Email Scraper account</p>
          </div>
          
          <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
            <div className="p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg flex items-start animate-fade-in">
                  <FiAlertCircle className="mr-2 mt-0.5 flex-shrink-0" size={18} />
                  <span>{error}</span>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                      <FiUser size={18} />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="text"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-4 py-3.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      placeholder="Enter username (lee or sankalp)"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500">
                      <FiLock size={18} />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full pl-12 pr-4 py-3.5 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-4 px-6 mt-2 bg-gradient-to-r from-primary to-indigo-600 text-white rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
                    isLoading ? 'opacity-80 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center group">
                      <span>Sign In</span>
                      <FiArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                    </span>
                  )}
                </button>
              </form>
            </div>
            
            <div className="bg-gray-50 p-8 border-t border-gray-100">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 mb-4">Demo Application</p>
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-gray-600 text-sm">
                    This is a demo application for email extraction. Contact the administrator for credentials.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-8">
            <p className="text-gray-500 flex items-center justify-center gap-2">
              <FiMail size={16} />
              <span>Need help?</span>
              <a href="#" className="text-primary hover:text-primary-700 font-medium">Contact support</a>
            </p>
          </div>
        </div>
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