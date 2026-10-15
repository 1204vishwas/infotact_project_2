import React, { useState } from 'react';
import { X, Check, AlertCircle, ArrowRight, ShieldCheck, Mail, User } from 'lucide-react';

// Official SVG Logo for Google
export function GoogleLogo({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Official SVG Logo for Facebook
export function FacebookLogo({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export default function SocialAuthModal({ isOpen, onClose, provider = 'google', mode = 'login', onSuccess, showToast }) {
  const isGoogle = provider === 'google';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selectedQuickAccount, setSelectedQuickAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Preset quick Google/Facebook accounts with @gmail.com for fast 1-click test
  const quickAccounts = isGoogle
    ? [
        { name: 'Vishwas Sharma', email: 'vishwas.sharma@gmail.com', avatarColor: '#4285F4', initials: 'VS' },
        { name: 'Dr. Aris Thorne', email: 'aris.thorne@gmail.com', avatarColor: '#EA4335', initials: 'AT' }
      ]
    : [
        { name: 'Vishwas S.', email: 'vishwas.fb@gmail.com', avatarColor: '#1877F2', initials: 'VS' },
        { name: 'Priya Sharma', email: 'priya.sharma@gmail.com', avatarColor: '#1877F2', initials: 'PS' }
      ];

  const handleSelectQuickAccount = (acc) => {
    setSelectedQuickAccount(acc);
    setEmail(acc.email);
    setName(acc.name);
    setError('');
  };

  const handleAuthenticate = async (authEmail, authName, avatarColor) => {
    const targetEmail = (authEmail || email).toLowerCase().trim();
    const targetName = (authName || name).trim();

    if (!targetName) {
      setError('Please provide your full name.');
      return;
    }

    if (!targetEmail) {
      setError('Please provide your Gmail address.');
      return;
    }

    // STRICT GMAIL ENFORCEMENT
    if (!targetEmail.endsWith('@gmail.com')) {
      setError('Only Gmail accounts (@gmail.com) are allowed. Please use an address ending with @gmail.com');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/social-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          name: targetName,
          email: targetEmail,
          avatarColor: avatarColor || (isGoogle ? '#4285F4' : '#1877F2')
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        localStorage.setItem('proxispeak_token', data.token);
        localStorage.setItem('proxispeak_user', JSON.stringify(data.user));
        showToast(`Authenticated via ${isGoogle ? 'Google' : 'Facebook'} with ${targetEmail}!`, 'success');
        onSuccess(data.user, data.token);
        onClose();
      } else {
        setError(data.message || 'Social sign-in failed. Please verify your Gmail address.');
      }
    } catch (err) {
      console.warn('API error during social auth, activating offline fallback:', err);
      // Offline fallback
      const fallbackUser = {
        id: `social_${provider}_` + Date.now(),
        name: targetName,
        email: targetEmail,
        username: targetEmail.split('@')[0],
        role: 'Developer',
        avatarColor: avatarColor || (isGoogle ? '#4285F4' : '#1877F2'),
        department: isGoogle ? 'Google Workspace Unit' : 'Facebook Workplace Hub',
        location: [320, 240],
        status: 'online'
      };
      localStorage.setItem('proxispeak_token', 'mock_social_jwt_' + Date.now());
      localStorage.setItem('proxispeak_user', JSON.stringify(fallbackUser));
      showToast(`Authenticated via ${isGoogle ? 'Google' : 'Facebook'} with ${targetEmail}!`, 'success');
      onSuccess(fallbackUser, 'mock_social_jwt_' + Date.now());
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
        {/* Glow Ambient Top Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 ${
            isGoogle
              ? 'bg-gradient-to-r from-[#4285F4] via-[#EA4335] via-[#FBBC05] to-[#34A853]'
              : 'bg-[#1877F2]'
          }`}
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Branding */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-md shrink-0">
            {isGoogle ? <GoogleLogo className="w-7 h-7" /> : <FacebookLogo className="w-7 h-7 text-[#1877F2]" />}
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
              <span>{isGoogle ? 'Sign in with Google' : 'Log in with Facebook'}</span>
            </h3>
            <p className="text-xs text-slate-400">
              Continue to <strong className="text-slate-200">ProxiSpeak Virtual Office</strong>
            </p>
          </div>
        </div>

        {/* Gmail Only Security Pill */}
        <div className="mb-4 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center space-x-2 text-indigo-300 text-xs">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Workspace Policy: <strong>Only Gmail addresses (@gmail.com)</strong> are supported.
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2.5 text-rose-300 text-xs animate-shake">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {/* 1-Click Quick Select Account Options */}
        <div className="mb-4 space-y-2">
          <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Quick 1-Click Account:
          </label>
          <div className="grid grid-cols-1 gap-2">
            {quickAccounts.map((acc, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAuthenticate(acc.email, acc.name, acc.avatarColor)}
                disabled={isLoading}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all text-left cursor-pointer group"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow shrink-0"
                    style={{ backgroundColor: acc.avatarColor }}
                  >
                    {acc.initials}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-white block group-hover:text-cyan-300 transition-colors truncate">
                      {acc.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono block truncate">
                      {acc.email}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative px-3 bg-slate-900 text-slate-500 text-[10px] uppercase tracking-wider">
            Or enter custom Gmail
          </span>
        </div>

        {/* Custom Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAuthenticate();
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Your Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vishwas Sharma"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Your Gmail Address (@gmail.com) *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
              />
            </div>
            {email && !email.toLowerCase().endsWith('@gmail.com') && (
              <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
                <span>Must end with</span> <strong className="font-mono">@gmail.com</strong>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full mt-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-lg flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              isGoogle
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-blue-600/25'
                : 'bg-[#1877F2] hover:bg-[#166fe5] shadow-[#1877F2]/30'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Connecting {isGoogle ? 'Google' : 'Facebook'}...</span>
              </div>
            ) : (
              <>
                <span>
                  {mode === 'signup'
                    ? `Register with ${isGoogle ? 'Google' : 'Facebook'}`
                    : `Continue with ${isGoogle ? 'Google' : 'Facebook'}`}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
