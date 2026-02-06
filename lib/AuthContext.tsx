import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, User, Session, AuthError } from '@supabase/supabase-js';
import { api } from './api';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials missing. Auth will be disabled.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: localStorage,
        storageKey: 'procura-auth-token',
    },
    global: {
        headers: {
            'X-Client-Info': 'procura-app',
        },
    },
});

// Types
interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
    signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
    // MFA
    enrollMFA: () => Promise<{ qrCode: string; secret: string } | null>;
    verifyMFA: (code: string, factorId: string) => Promise<{ error: AuthError | null }>;
    challengeMFA: (factorId: string) => Promise<{ challengeId: string } | null>;
    getMFAFactors: () => Promise<any[]>;
    unenrollMFA: (factorId: string) => Promise<{ error: AuthError | null }>;
    isMFAEnabled: boolean;
    needsMFAVerification: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMFAEnabled, setIsMFAEnabled] = useState(false);
    const [needsMFAVerification, setNeedsMFAVerification] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const safetyTimeout = setTimeout(() => {
            if (!cancelled) {
                console.warn('Auth initialization timed out after 10s. Continuing without session.');
                setLoading(false);
            }
        }, 10000); // Increased to 10 seconds

        const initSession = async () => {
            try {
                console.log('Initializing auth session...');
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('Auth session error:', error);
                }

                if (cancelled) return;

                console.log('Session retrieved:', session ? 'Active' : 'None');
                setSession(session);
                setUser(session?.user ?? null);

                if (session?.access_token) {
                    api.setToken(session.access_token);
                } else {
                    api.clearToken();
                }

                await checkMFAStatus(session?.user ?? null);
            } catch (error) {
                console.error('Failed to initialize auth session:', error);
            } finally {
                if (!cancelled) {
                    clearTimeout(safetyTimeout);
                    setLoading(false);
                }
            }
        };

        initSession();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                try {
                    setSession(session);
                    setUser(session?.user ?? null);
                    if (session?.access_token) {
                        api.setToken(session.access_token);
                    } else {
                        api.clearToken();
                    }

                    if (event === 'SIGNED_IN') {
                        await checkMFAStatus(session?.user ?? null);
                    }

                    if (event === 'SIGNED_OUT') {
                        setIsMFAEnabled(false);
                        setNeedsMFAVerification(false);
                    }
                } catch (error) {
                    console.error('Auth state change handler failed:', error);
                } finally {
                    setLoading(false);
                }
            }
        );

        return () => {
            cancelled = true;
            clearTimeout(safetyTimeout);
            subscription.unsubscribe();
        };
    }, []);

    const checkMFAStatus = async (user: User | null) => {
        if (!user) {
            setIsMFAEnabled(false);
            return;
        }

        try {
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const hasVerifiedFactor = factors?.totp?.some(f => f.status === 'verified') ?? false;
            setIsMFAEnabled(hasVerifiedFactor);
        } catch {
            setIsMFAEnabled(false);
        }
    };

    const signIn = async (email: string, password: string) => {
        try {
            console.log('Attempting sign in with Supabase...');
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            console.log('Sign in response:', {
                success: !error,
                hasSession: !!data.session,
                error: error?.message
            });

            if (!error && data.session) {
                console.log('Login successful, setting session...');
                setSession(data.session);
                setUser(data.user);
                api.setToken(data.session.access_token);

                const { data: factors } = await supabase.auth.mfa.listFactors();
                if (factors?.totp?.some(f => f.status === 'verified')) {
                    setNeedsMFAVerification(true);
                }
            }

            return { error };
        } catch (err) {
            console.error('Sign in exception:', err);
            return { error: err as AuthError };
        }
    };

    const signUp = async (email: string, password: string, fullName: string) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
            },
        });
        return { error };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
        api.clearToken();
        setUser(null);
        setSession(null);
        setIsMFAEnabled(false);
        setNeedsMFAVerification(false);
    };

    const resetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/#/reset-password`,
        });
        return { error };
    };

    // MFA Functions
    const enrollMFA = async () => {
        try {
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'Procura Authenticator',
            });

            if (error || !data) return null;

            return {
                qrCode: data.totp.qr_code,
                secret: data.totp.secret,
            };
        } catch {
            return null;
        }
    };

    const verifyMFA = async (code: string, factorId: string) => {
        const { data: challenge } = await supabase.auth.mfa.challenge({
            factorId,
        });

        if (!challenge) {
            return { error: { message: 'Failed to create challenge' } as AuthError };
        }

        const { error } = await supabase.auth.mfa.verify({
            factorId,
            challengeId: challenge.id,
            code,
        });

        if (!error) {
            setNeedsMFAVerification(false);
            setIsMFAEnabled(true);
        }

        return { error };
    };

    const challengeMFA = async (factorId: string) => {
        const { data, error } = await supabase.auth.mfa.challenge({
            factorId,
        });

        if (error || !data) return null;
        return { challengeId: data.id };
    };

    const getMFAFactors = async () => {
        const { data } = await supabase.auth.mfa.listFactors();
        return data?.totp ?? [];
    };

    const unenrollMFA = async (factorId: string) => {
        const { error } = await supabase.auth.mfa.unenroll({
            factorId,
        });

        if (!error) {
            setIsMFAEnabled(false);
        }

        return { error };
    };

    const value = {
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        enrollMFA,
        verifyMFA,
        challengeMFA,
        getMFAFactors,
        unenrollMFA,
        isMFAEnabled,
        needsMFAVerification,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
