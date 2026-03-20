import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Sidebar } from './Sidebar';
import { useTheme } from '../context/ThemeContext';

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const { theme } = useTheme();

  useEffect(() => {
    const fetchUserDetails = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || '');
        setUserName(user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User');
      }
    };
    fetchUserDetails();

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505] text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar 
        userName={userName} 
        userEmail={userEmail} 
        sidebarOpen={sidebarOpen} 
        setSidebarOpen={setSidebarOpen} 
      />

      {/* Mobile Menu Button */}
      <button
        className="md:hidden fixed top-4 right-4 z-50 bg-[#0B0C10] border border-white/10 rounded-full p-2 shadow-lg"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6 text-white" />
      </button>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-64 h-screen overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
