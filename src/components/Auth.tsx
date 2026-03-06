import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for Supabase session changes and redirect if logged in
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate('/summarizer');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const validatePassword = (password: string) => {
    if (password.length < 6) {
      return 'Password must be at least 6 characters long';
    }
    return null;
  };

  const validateForm = () => {
    if (!email || !password) {
      setError('Please fill in all required fields');
      return false;
    }

    // if (mode === 'signup') {
    //   if (!name) {
    //     setError('Please enter your full name');
    //     return false;
    //   }
    //   if (password !== confirmPassword) {
    //     setError('Passwords do not match');
    //     return false;
    //   }
    // }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return false;
    }

    return true;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message === 'Invalid login credentials') {
        setError('Invalid email or password. Please try again or create a new account.');
      } else if (error.message === 'Email not confirmed') {
        setError('Email not confirmed. Please check your inbox or disable "Confirm email" in your Supabase Dashboard (Authentication -> Providers -> Email).');
        setMessage('Note: If you are running locally, you can disable email confirmation in Supabase settings to log in immediately.');
      } else {
        setError(error.message);
      }
    } else {
      // Redirect to meeting summarizer after successful login
      navigate('/summarizer');
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: name,
        }
      }
    });

    if (error) {
      if (error.message === 'User already registered') {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(error.message);
      }
    } else {
      setMessage('Account created! Please check your email and verify your address before signing in.');
      setError('Tip: If you don\'t receive an email, disable "Confirm email" in your Supabase Dashboard to skip this step.');
    }
    setLoading(false);
  };



  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setError(null);
    setMessage(null);
  };

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode);
    resetForm();
  };

  return (
    <div className={`min-h-screen w-full flex overflow-hidden relative font-sans selection:bg-indigo-500/30 transition-colors duration-300 ${theme === 'dark' ? 'bg-[#050505]' : 'bg-slate-50'}`}>
      {/* Massive Background Branding Text - RED THEME */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-0 select-none">
        <div className="text-[25vw] font-black text-red-500/[0.03] whitespace-nowrap leading-none tracking-tighter transform -rotate-12 translate-x-[-5%] translate-y-[5%] select-none animate-pulse-slow">
          3.0LABS
        </div>
      </div>

      {/* Additional Watermark */}
      <div className="absolute top-[10%] right-[-5%] text-[15vw] font-black text-red-500/[0.02] whitespace-nowrap leading-none tracking-tighter transform rotate-12 pointer-events-none select-none">
        AI AGENT
      </div>

      {/* Spy Robot - Watching from the top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-1000 animate-robot-slide-down">
        <div className="relative group">
          {/* Robot Head */}
          <div className="w-24 h-16 bg-[#1a1c24] border-b-4 border-red-500/50 rounded-b-3xl shadow-[0_10px_30px_rgba(239,68,68,0.2)] flex items-center justify-center relative overflow-hidden">
            {/* Glowing Eyes */}
            <div className="flex gap-4">
              <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-robot-blink"></div>
              <div className="w-3 h-3 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-robot-blink"></div>
            </div>
            {/* Scanner Line */}
            <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-red-500/50 animate-scanner"></div>
          </div>
          {/* Robot Neck/Pipe */}
          <div className="w-2 h-4 bg-gradient-to-b from-[#0a0a0c] to-[#1a1c24] mx-auto"></div>
          {/* Top Anchor */}
          <div className="w-10 h-2 bg-red-500/20 rounded-full mx-auto blur-sm"></div>
        </div>
      </div>


      {/* Aero-layer: Flying Planes & Clouds */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-1/4 -left-20 animate-plane-fly opacity-20">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-red-500 transform -rotate-45">
            <path d="M22 2L2 8.66025L11.5 12.5L22 2Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M22 2L11.5 12.5V22L15.3397 14.8397L22 2Z" fill="currentColor" fillOpacity="0.3" />
            <path d="M22 2L2 8.66025L11.5 12.5L15.3397 14.8397L22 2Z" stroke="currentColor" />
          </svg>
        </div>
        <div className="absolute top-2/3 -right-20 animate-plane-fly-alt opacity-10" style={{ animationDelay: '7s' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-purple-500 transform rotate-[135deg]">
            <path d="M22 2L2 8.66025L11.5 12.5L22 2Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M22 2L11.5 12.5V22L15.3397 14.8397L22 2Z" fill="currentColor" fillOpacity="0.3" />
            <path d="M22 2L2 8.66025L11.5 12.5L15.3397 14.8397L22 2Z" stroke="currentColor" />
          </svg>
        </div>
        <div className="absolute top-1/2 left-1/3 animate-plane-fly opacity-15" style={{ animationDelay: '12s', animationDuration: '20s' }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-pink-500 transform -rotate-12">
            <path d="M22 2L2 8.66025L11.5 12.5L22 2Z" fill="currentColor" fillOpacity="0.2" />
            <path d="M22 2L11.5 12.5V22L15.3397 14.8397L22 2Z" fill="currentColor" fillOpacity="0.3" />
            <path d="M22 2L2 8.66025L11.5 12.5L15.3397 14.8397L22 2Z" stroke="currentColor" />
          </svg>
        </div>

        {/* Drifting Particles/Clouds */}
        <div className="absolute top-20 left-10 w-64 h-32 bg-red-600/5 blur-[60px] rounded-full animate-cloud"></div>
        <div className="absolute bottom-40 right-20 w-80 h-40 bg-purple-600/5 blur-[80px] rounded-full animate-cloud" style={{ animationDelay: '5s' }}></div>
      </div>
      <div className="flex flex-col justify-center px-6 sm:px-12 md:px-16 py-12 w-full lg:max-w-xl bg-white/[0.01] backdrop-blur-[40px] border-r border-white/10 relative z-10 transition-all animate-reveal shadow-[20px_0_50px_rgba(0,0,0,0.5)]">
        {/* Animated Gradient Line on Border */}
        <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-indigo-500/50 to-transparent animate-shimmer-v"></div>

        {/* Ambient Orbs — Red/Purple Palette */}
        <div className="absolute -top-10 -left-10 w-80 h-80 bg-red-500/10 rounded-full blur-[100px] animate-float pointer-events-none"></div>
        <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-purple-500/20 rounded-full blur-[80px] animate-float-slow pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-r from-red-600/5 via-purple-600/10 to-red-600/5 rounded-full blur-[120px] animate-orb-pulse pointer-events-none"></div>


        {/* Branding for Mobile */}
        <div className="lg:hidden flex items-center justify-center mb-8 gap-3 animate-fade-in-down">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg animate-breathe">
            <span className="text-white font-bold text-xs">3.0</span>
          </div>
          <span className="font-extrabold text-2xl bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 tracking-tighter animate-gradient">3.0Labs</span>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 text-center tracking-tight animate-fade-in-up stagger-1">
          {mode === 'signup' ? 'Create your account' : 'Welcome back'}
        </h2>
        <p className="text-gray-400 text-sm text-center mb-8 animate-fade-in-up stagger-2">
          {mode === 'signup'
            ? 'Start your journey with AI-powered meeting insights'
            : 'Sign in to access your meeting dashboard'
          }
        </p>
        {/* Mode Toggle */}
        <div className="flex justify-center mb-8">
          <div className="bg-black/40 p-1 rounded-xl flex items-center w-full max-w-xs border border-white/10 ring-1 ring-white/5">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${mode === 'signin'
                ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                : 'text-gray-400 hover:text-gray-200'
                }`}
              onClick={() => switchMode('signin')}
            >
              Sign In
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${mode === 'signup'
                ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
                : 'text-gray-400 hover:text-gray-200'
                }`}
              onClick={() => switchMode('signup')}
            >
              Sign Up
            </button>
          </div>
        </div>
        {/* Form */}
        <form className="space-y-4" onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 ml-1">Full Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder-gray-500"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5 ml-1">
              Email Address
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                <Mail className="h-5 w-5" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder-gray-500"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5 ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder-gray-500"
                placeholder="••••••••"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 focus:outline-none transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {mode === 'signup' && (
              <p className="mt-1 text-xs text-gray-500 ml-1">Must be at least 6 characters long</p>
            )}
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 ml-1">Confirm Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-indigo-400 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-black/20 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-white placeholder-gray-500"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 focus:outline-none transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'signin' && (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/10 bg-black/20 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-400">
                  Remember me
                </label>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start p-3 bg-red-500/10 border border-red-500/20 rounded-lg backdrop-blur-sm">
              <AlertCircle className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
              <span className="text-red-200 text-sm">{error}</span>
            </div>
          )}

          {message && (
            <div className="flex items-start p-3 bg-green-500/10 border border-green-500/20 rounded-lg backdrop-blur-sm">
              <CheckCircle className="w-5 h-5 text-emerald-400 mr-2 flex-shrink-0" />
              <span className="text-emerald-200 text-sm">{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] hover:bg-indigo-500 hover:shadow-[0_0_25px_rgba(79,70,229,0.5)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0B0C10] transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none animate-fade-in-up stagger-6 animate-glow"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Processing...
              </div>
            ) : (
              mode === 'signin' ? 'Sign In' : 'Create Account'
            )}
          </button>


        </form>

        {mode === 'signup' && (
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              By creating an account, you agree to our{' '}
              <button className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Terms of Service
              </button>
              {' '}and{' '}
              <button className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Privacy Policy
              </button>
            </p>
          </div>
        )}
      </div>
      {/* Right: Visual Section */}
      <div className="flex-1 relative hidden lg:flex items-center justify-center bg-black/40 overflow-hidden z-0">
        {/* Dramatic floating ambient orbs — red themed */}
        <div className="absolute top-[10%] left-[15%] w-96 h-96 bg-red-600/20 rounded-full blur-[140px] animate-float pointer-events-none"></div>
        <div className="absolute bottom-[15%] right-[10%] w-[500px] h-[500px] bg-purple-600/15 rounded-full blur-[160px] animate-float-slow pointer-events-none"></div>
        <div className="absolute top-[40%] right-[30%] w-60 h-60 bg-red-400/10 rounded-full blur-[100px] animate-orb-pulse pointer-events-none"></div>
        <div className="absolute bottom-[30%] left-[25%] w-48 h-48 bg-pink-500/10 rounded-full blur-[80px] animate-float pointer-events-none" style={{ animationDelay: '3s' }}></div>

        {/* Visual Content - RED Gradient */}
        <div className="relative z-10 text-center px-12 animate-fade-in-up">
          <div className="text-8xl font-black text-red-500 mb-6 tracking-tighter leading-none opacity-5 blur-sm absolute inset-0 flex items-center justify-center transform -translate-y-4">3.0</div>
          <div className="relative font-black text-7xl md:text-8xl tracking-tighter">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-red-200 to-white/70">3.0</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-purple-500 to-red-500 animate-gradient">Labs</span>
          </div>
          <p className="mt-8 text-xl text-gray-400 font-medium max-w-md mx-auto leading-relaxed">
            Elevating meetings with <span className="text-white border-b-2 border-red-500/50">Next-Gen Intelligence</span>.
          </p>
        </div>

        {/* Animated gradient line at top - RED */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent animate-shimmer"></div>
      </div>
    </div>
  );
}
