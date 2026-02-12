import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Gem, Lock, Mail, Eye, EyeOff, Loader2,
    CheckCircle, AlertCircle
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

type AuthMode = 'login' | 'signup' | 'forgot';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { signIn, signUp, signOut, resetPassword } = useAuth();

    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loginAttempts, setLoginAttempts] = useState(0);
    const [loginCooldown, setLoginCooldown] = useState(0);

    // Countdown timer for rate limiting
    useEffect(() => {
        if (loginCooldown > 0) {
            const timer = setTimeout(() => {
                setLoginCooldown(loginCooldown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [loginCooldown]);

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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();

        // Rate limiting check
        if (loginCooldown > 0) {
            setError(`Too many failed attempts. Please wait ${loginCooldown} seconds before trying again.`);
            return;
        }

        setLoading(true);
        setError('');
        console.log('Login attempt for:', email);

        try {
            const { error } = await signIn(email, password);

            if (error) {
                console.error('Login error:', error.message);
                setError(error.message);

                // Implement exponential backoff after failed attempts
                const newAttempts = loginAttempts + 1;
                setLoginAttempts(newAttempts);

                if (newAttempts >= 3) {
                    // Exponential backoff: 30s, 60s, 120s, 240s (max 5 minutes)
                    const cooldown = Math.min(30 * Math.pow(2, newAttempts - 3), 300);
                    setLoginCooldown(cooldown);
                }
            } else {
                // Reset attempts on successful login
                setLoginAttempts(0);
                setLoginCooldown(0);
                console.log('Login successful!');
                // Navigate directly to dashboard (MFA removed for simplicity)
                navigate('/dashboard');
            }
        } catch (err) {
            console.error('Login exception:', err);
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Validate password complexity
        const passwordError = validatePassword(password);
        if (passwordError) {
            setError(passwordError);
            setLoading(false);
            return;
        }

        const { error } = await signUp(email, password, fullName);

        if (error) {
            setError(error.message);
        } else {
            setSuccess('Check your email for a confirmation link!');
            setMode('login');
        }
        setLoading(false);
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { error } = await resetPassword(email);

        if (error) {
            setError(error.message);
        } else {
            setSuccess('Password reset email sent!');
        }
        setLoading(false);
    };

    // Auth Form
    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Left Side - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-[#121212] p-12 flex-col justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
                        <Gem size={24} className="text-white" />
                    </div>
                    <span className="text-xl font-bold text-white">Procura</span>
                </div>
                <div>
                    <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
                        Government contracting,
                        <br />
                        <span className="text-gray-400">simplified.</span>
                    </h2>
                    <p className="text-gray-400 text-lg">
                        Automate your capture pipeline and win more contracts with AI-powered tools.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex -space-x-2">
                        {['bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500'].map((color, i) => (
                            <div key={i} className={`h-8 w-8 rounded-full ${color} border-2 border-[#121212]`} />
                        ))}
                    </div>
                    <p className="text-sm text-gray-400">Trusted by 500+ government contractors</p>
                </div>
            </div>

            {/* Right Side - Auth Form */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                    {/* Form Header */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">
                            {mode === 'login' && 'Welcome back'}
                            {mode === 'signup' && 'Create your account'}
                            {mode === 'forgot' && 'Reset your password'}
                        </h1>
                        <p className="text-gray-500">
                            {mode === 'login' && 'Enter your credentials to access your account'}
                            {mode === 'signup' && 'Start your 14-day free trial'}
                            {mode === 'forgot' && "We'll send you a reset link"}
                        </p>
                    </div>

                    {/* Messages */}
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

                    {/* Login Form */}
                    {mode === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full pl-11 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
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
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                                    <span className="text-sm text-gray-600">Remember me</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
                                    className="text-sm font-medium text-gray-600 hover:text-gray-900"
                                >
                                    Forgot password?
                                </button>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-[#121212] text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Sign In'}
                            </button>
                            <p className="text-center text-sm text-gray-500">
                                Don't have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                                    className="font-medium text-gray-900 hover:underline"
                                >
                                    Sign up
                                </button>
                            </p>
                        </form>
                    )}

                    {/* Signup Form */}
                    {mode === 'signup' && (
                        <form onSubmit={handleSignup} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="John Smith"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
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
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-[#121212] text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Create Account'}
                            </button>
                            <p className="text-center text-sm text-gray-500">
                                Already have an account?{' '}
                                <button
                                    type="button"
                                    onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                                    className="font-medium text-gray-900 hover:underline"
                                >
                                    Sign in
                                </button>
                            </p>
                        </form>
                    )}

                    {/* Forgot Password Form */}
                    {mode === 'forgot' && (
                        <form onSubmit={handleForgotPassword} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                                <div className="relative">
                                    <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
                                        required
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3 bg-[#121212] text-white font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send Reset Link'}
                            </button>
                            <p className="text-xs text-gray-500 text-center">
                                Open the reset email link in this browser to set a new password.
                            </p>
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                                className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
                            >
                                Back to sign in
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
