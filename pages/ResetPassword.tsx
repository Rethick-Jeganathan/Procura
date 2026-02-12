import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    CheckCircle,
    Eye,
    EyeOff,
    Gem,
    KeyRound,
    Loader2,
    Lock,
    Mail
} from 'lucide-react';
import { supabase } from '../lib/AuthContext';

const ResetPassword: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [email, setEmail] = useState('');
    const [resendEmail, setResendEmail] = useState('');
    const [resendLoading, setResendLoading] = useState(false);

    // Password complexity validation
    const validatePassword = (password: string): string | null => {
        if (password.length < 12) {
            return 'Password must be at least 12 characters';
        }
        if (!/[a-z]/.test(password)) {
            return 'Password must contain lowercase letters';
        }
        if (!/[A-Z]/.test(password)) {
            return 'Password must contain uppercase letters';
        }
        if (!/[0-9]/.test(password)) {
            return 'Password must contain numbers';
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            return 'Password must contain special characters (!@#$%^&*(),.?":{}|<>)';
        }
        return null;
    };

    useEffect(() => {
        let active = true;

        const initRecovery = async () => {
            setLoading(true);
            setError('');

            try {
                // SECURITY: Extract tokens from URL IMMEDIATELY before any processing
                // This prevents tokens from remaining in browser history if errors occur
                const searchParams = new URLSearchParams(window.location.search);
                const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
                const hashParams = new URLSearchParams(hashQuery);
                const getParam = (key: string) => searchParams.get(key) || hashParams.get(key);
                const code = getParam('code');
                const accessToken = getParam('access_token');
                const refreshToken = getParam('refresh_token');

                // SECURITY: Clear tokens from URL IMMEDIATELY after extraction
                // Do this BEFORE any async operations that might fail
                if (window.location.search || window.location.hash.includes('?')) {
                    const url = new URL(window.location.href);
                    url.search = '';
                    if (url.hash.includes('?')) {
                        url.hash = url.hash.split('?')[0];
                    }
                    window.history.replaceState({}, document.title, url.toString());
                }

                const { data: initial } = await supabase.auth.getSession();
                if (!initial.session) {
                    if (code) {
                        const { error } = await supabase.auth.exchangeCodeForSession(code);
                        if (error && active) {
                            console.error('Exchange error:', error);
                            setError('Reset link is invalid or expired. Request a new one.');
                        }
                    } else if (accessToken && refreshToken) {
                        const { error } = await supabase.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        });
                        if (error && active) {
                            console.error('Session set error:', error);
                            setError('Reset link is invalid or expired. Request a new one.');
                        }
                    }
                }

                const { data } = await supabase.auth.getSession();
                if (!active) return;

                setReady(!!data.session);
                setEmail(data.session?.user?.email ?? '');
                if (data.session) {
                    setError('');
                }
            } catch {
                if (active) {
                    setError('Unable to initialize reset flow. Please request a new reset link.');
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        initRecovery();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
                setReady(!!session);
                setEmail(session?.user?.email ?? '');
                if (session) {
                    setError('');
                }
            }
        });

        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, [location.search]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!ready) {
            setError('Reset link is missing or expired. Request a new one.');
            return;
        }

        // Validate password complexity
        const passwordError = validatePassword(password);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            setError(error.message);
        } else {
            setSuccess('Password updated. Please sign in again.');
            await supabase.auth.signOut();
        }

        setLoading(false);
    };

    const handleResend = async (e: React.FormEvent) => {
        e.preventDefault();
        setResendLoading(true);
        setError('');
        setSuccess('');

        const { error } = await supabase.auth.resetPasswordForEmail(resendEmail, {
            redirectTo: `${window.location.origin}/#/reset-password`,
        });

        if (error) {
            setError(error.message);
        } else {
            setSuccess('Password reset email sent!');
        }

        setResendLoading(false);
    };

    const canSubmit = ready && password.length >= 8 && password === confirmPassword && !loading;

    return (
        <div className="min-h-screen bg-gray-50 flex">
            <div className="hidden lg:flex lg:w-1/2 bg-[#121212] p-12 flex-col justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Gem size={24} className="text-white" />
                    </div>
                    <span className="text-xl font-bold text-white">Procura</span>
                </div>
                <div>
                    <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
                        Secure account recovery,
                        <br />
                        <span className="text-gray-400">in minutes.</span>
                    </h2>
                    <p className="text-gray-400 text-lg">
                        Set a new password and get back to your dashboard quickly.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                        <KeyRound size={18} className="text-white" />
                    </div>
                    <p className="text-sm text-gray-400">Reset links expire for your security.</p>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset your password</h1>
                        <p className="text-gray-500">
                            {ready && email ? `Set a new password for ${email}` : 'Enter a new password for your account.'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 animate-fade-in">
                            <AlertCircle size={18} className="text-red-600 shrink-0" />
                            <p className="text-sm text-red-600">{error}</p>
                        </div>
                    )}
                    {success && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-lg flex items-center gap-3 animate-fade-in">
                            <CheckCircle size={18} className="text-green-600 shrink-0" />
                            <p className="text-sm text-green-600">{success}</p>
                        </div>
                    )}

                    {loading && !ready ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 size={16} className="animate-spin" />
                            Checking reset link...
                        </div>
                    ) : ready ? (
                        <form onSubmit={handleUpdatePassword} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Min. 12 characters with uppercase, lowercase, numbers, and special characters"
                                        className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        minLength={12}
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Repeat password"
                                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        minLength={12}
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={!canSubmit}
                                className="w-full py-3 bg-[#121212] text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Update Password'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleResend} className="space-y-5">
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                This reset link is missing or expired. Request a new one below.
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="email"
                                        value={resendEmail}
                                        onChange={(e) => setResendEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={resendLoading}
                                className="w-full py-3 bg-[#121212] text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {resendLoading ? <Loader2 size={18} className="animate-spin" /> : 'Send New Reset Link'}
                            </button>
                        </form>
                    )}

                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="mt-6 w-full text-center text-sm text-gray-500 hover:text-gray-700"
                    >
                        Back to sign in
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResetPassword;
