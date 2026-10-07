import React, { useState } from 'react';
import { LogIn, Layers, ShieldCheck, Zap, Mail, Lock, Loader2, Sparkles, Activity } from 'lucide-react';
import { loginWithEmail, sendPasswordResetEmail, auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first to reset password.");
      setResetMessage(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResetMessage(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetMessage("Password reset link sent! Please check your email inbox.");
    } catch (err: any) {
      setError(err.message || "Failed to send password reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(null);
    setResetMessage(null);
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      const errorCode = err.code || (err.message?.includes('invalid-credential') ? 'auth/invalid-credential' : '');
      
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        setError("Invalid email or password. Please check your credentials and try again.");
      } else if (errorCode === 'auth/too-many-requests') {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError(err.message || "An error occurred during login.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden transition-colors duration-200">
      {/* Dynamic ambient background glow */}
      <div className="absolute top-[-15%] left-[-10%] w-[600px] h-[600px] bg-brand-600/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute top-[30%] right-[20%] w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[160px] pointer-events-none"></div>

      {/* Background optical grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ffffff" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass-panel-elevated rounded-3xl shadow-2xl overflow-hidden border border-slate-700/80 relative z-10"
      >
        {/* Header Branding Banner */}
        <div className="bg-gradient-to-b from-brand-600/90 to-brand-800/95 p-8 text-center text-white relative overflow-hidden border-b border-white/10">
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="inline-flex items-center justify-center w-14 h-14 bg-white/10 backdrop-blur-md rounded-2xl mb-4 shadow-inner border border-white/20 ring-4 ring-white/5"
          >
            <Layers className="w-8 h-8 text-white" />
          </motion.div>
          
          <h1 className="text-2xl font-extrabold tracking-tight font-display mb-1 text-white">FIBER SHARING DATABASE</h1>
          <div className="flex items-center justify-center gap-1.5 text-brand-200 text-xs font-semibold">
            <Activity size={13} className="text-brand-300 animate-pulse" />
            <span>GIS Network Management System</span>
          </div>
        </div>
        
        {/* Form Body */}
        <div className="p-8 bg-slate-900/80 backdrop-blur-xl">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-bold text-white tracking-tight font-display">Sign In to Workspace</h2>
              <p className="text-slate-400 text-xs mt-1">Access optical routes, splice enclosures & core matrices</p>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 ml-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-brand-400 transition-colors" />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full bg-slate-950/80 border border-slate-700/80 p-3 pl-10 rounded-xl focus:border-brand-500 focus:outline-none transition-all text-white text-xs placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-semibold text-slate-300">Password</label>
                  <button 
                    type="button" 
                    onClick={handleForgotPassword} 
                    className="text-[10px] text-brand-400 hover:text-brand-300 font-semibold transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-brand-400 transition-colors" />
                  <input 
                    type="password" 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/80 border border-slate-700/80 p-3 pl-10 rounded-xl focus:border-brand-500 focus:outline-none transition-all text-white text-xs placeholder:text-slate-500"
                  />
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="text-rose-300 text-xs font-medium bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-center leading-relaxed"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {resetMessage && (
                  <motion.div 
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="text-emerald-300 text-xs font-medium bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-center leading-relaxed"
                  >
                    {resetMessage}
                  </motion.div>
                )}
              </AnimatePresence>
              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 text-white p-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-500 shadow-lg shadow-brand-600/25 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>Sign In to System</span>
              </button>
            </form>
            
            <div className="pt-2 text-center border-t border-slate-800">
              <p className="text-[11px] text-slate-400">
                Fiber Sharing Database Platform &bull; Multi-Tenant GIS
              </p>
            </div>
          </div>
        </div>
      </motion.div>
      
      <p className="mt-8 text-slate-400 text-xs font-semibold tracking-wider uppercase">
        &copy; 2026 FIBER SHARING DATABASE
      </p>
    </div>
  );
}
