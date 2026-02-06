import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Users, Database, Cpu, Settings, Shield,
    Activity, Bell, FileText, ChevronLeft, Search, MoreHorizontal,
    TrendingUp, TrendingDown, Minus, CheckCircle, XCircle, Clock,
    Zap, RefreshCw, Download, Upload, Loader2, ChevronRight,
    ToggleLeft, ToggleRight, Play, Pause, Trash2, Edit2, Plus,
    AlertTriangle, Info, Gem, LogOut, Moon, Sun, ExternalLink, X
} from 'lucide-react';
import { api } from '../lib/api';

type AdminSection = 'overview' | 'users' | 'discovery' | 'ai' | 'settings' | 'security' | 'audit';

interface Metric {
    label: string;
    value: string | number;
    change?: number;
    trend?: 'up' | 'down' | 'neutral';
}

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    status: 'active' | 'pending' | 'disabled';
    lastLogin?: string;
}

interface DiscoverySource {
    name: string;
    enabled: boolean;
    last_sync?: string;
    status: 'healthy' | 'error' | 'disabled';
}

interface AIConfig {
    provider: string;
    model: string;
    qualification_threshold?: number;
    auto_qualify_above?: number;
    auto_reject_below?: number;
}

interface DiscoveryConfig {
    sources: DiscoverySource[];
    naics_filters?: string[];
    schedule?: string;
}

interface AdminMetrics {
    total_opportunities?: number;
    active_submissions?: number;
    ai_qualifications?: number;
    system_uptime?: string;
}

const AdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState<AdminSection>('overview');
    const [darkMode, setDarkMode] = useState(false);

    // Loading and error states
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [usersLoading, setUsersLoading] = useState(false);
    const [discoveryLoading, setDiscoveryLoading] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);

    // Data states
    const [metrics, setMetrics] = useState<Metric[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
    const [discoveryConfig, setDiscoveryConfig] = useState<DiscoveryConfig | null>(null);

    // User management states
    const [userSearch, setUserSearch] = useState('');
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('viewer');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [actionDropdownUserId, setActionDropdownUserId] = useState<string | null>(null);
    const [showRoleChangeModal, setShowRoleChangeModal] = useState(false);
    const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
    const [roleChangeValue, setRoleChangeValue] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Load metrics
    useEffect(() => {
        if (activeSection === 'overview') {
            loadMetrics();
        }
    }, [activeSection]);

    // Load users when section is active
    useEffect(() => {
        if (activeSection === 'users') {
            loadUsers();
        }
    }, [activeSection]);

    // Load discovery config when section is active
    useEffect(() => {
        if (activeSection === 'discovery') {
            loadDiscoveryConfig();
        }
    }, [activeSection]);

    // Load AI config when section is active
    useEffect(() => {
        if (activeSection === 'ai') {
            loadAIConfig();
        }
    }, [activeSection]);

    const loadMetrics = async () => {
        setMetricsLoading(true);
        setError(null);
        try {
            const response = await api.getAdminMetrics();
            if (response.error) {
                setError(response.error);
                // Set default metrics on error
                setMetrics([
                    { label: 'Total Opportunities', value: 0, trend: 'neutral' },
                    { label: 'Active Submissions', value: 0, trend: 'neutral' },
                    { label: 'AI Qualifications', value: 0, trend: 'neutral' },
                    { label: 'System Status', value: 'Error', trend: 'neutral' },
                ]);
            } else if (response.data) {
                const data: AdminMetrics = response.data;
                setMetrics([
                    { label: 'Total Opportunities', value: data.total_opportunities || 0, trend: 'neutral' },
                    { label: 'Active Submissions', value: data.active_submissions || 0, trend: 'neutral' },
                    { label: 'AI Qualifications', value: data.ai_qualifications || 0, trend: 'neutral' },
                    { label: 'System Uptime', value: data.system_uptime || 'N/A', trend: 'neutral' },
                ]);
            }
        } catch (err) {
            setError('Failed to load metrics');
            setMetrics([
                { label: 'Total Opportunities', value: 0, trend: 'neutral' },
                { label: 'Active Submissions', value: 0, trend: 'neutral' },
                { label: 'AI Qualifications', value: 0, trend: 'neutral' },
                { label: 'System Status', value: 'Error', trend: 'neutral' },
            ]);
        } finally {
            setMetricsLoading(false);
        }
    };

    const loadUsers = async () => {
        setUsersLoading(true);
        setError(null);
        try {
            const response = await api.getUsers();
            if (response.error) {
                setError(response.error);
                setUsers([]);
            } else if (response.data) {
                setUsers(response.data);
            }
        } catch (err) {
            setError('Failed to load users');
            setUsers([]);
        } finally {
            setUsersLoading(false);
        }
    };

    const loadDiscoveryConfig = async () => {
        setDiscoveryLoading(true);
        setError(null);
        try {
            const response = await api.getDiscoveryConfig();
            if (response.error) {
                setError(response.error);
                setDiscoveryConfig(null);
            } else if (response.data) {
                setDiscoveryConfig(response.data);
            }
        } catch (err) {
            setError('Failed to load discovery configuration');
            setDiscoveryConfig(null);
        } finally {
            setDiscoveryLoading(false);
        }
    };

    const loadAIConfig = async () => {
        setAiLoading(true);
        setError(null);
        try {
            const response = await api.getAIConfig();
            if (response.error) {
                setError(response.error);
                setAiConfig(null);
            } else if (response.data) {
                setAiConfig(response.data);
            }
        } catch (err) {
            setError('Failed to load AI configuration');
            setAiConfig(null);
        } finally {
            setAiLoading(false);
        }
    };

    // Filtered users based on search
    const filteredUsers = users.filter(user => {
        if (!userSearch.trim()) return true;
        const query = userSearch.toLowerCase();
        return (
            user.name?.toLowerCase().includes(query) ||
            user.email?.toLowerCase().includes(query) ||
            user.role?.toLowerCase().includes(query)
        );
    });

    // Invite user handler
    const handleInviteUser = async () => {
        if (!inviteEmail.trim()) return;
        setInviteLoading(true);
        setError(null);
        try {
            const response = await api.inviteUser(inviteEmail.trim(), inviteRole);
            if (response.error) {
                setError(response.error);
            } else {
                setShowInviteModal(false);
                setInviteEmail('');
                setInviteRole('viewer');
                await loadUsers();
            }
        } catch (err) {
            setError('Failed to invite user');
        } finally {
            setInviteLoading(false);
        }
    };

    // Change user role handler
    const handleChangeRole = async () => {
        if (!roleChangeUser || !roleChangeValue) return;
        setActionLoading(true);
        setError(null);
        try {
            const response = await api.updateUser(roleChangeUser.id, { role: roleChangeValue });
            if (response.error) {
                setError(response.error);
            } else {
                setShowRoleChangeModal(false);
                setRoleChangeUser(null);
                setRoleChangeValue('');
                await loadUsers();
            }
        } catch (err) {
            setError('Failed to update user role');
        } finally {
            setActionLoading(false);
        }
    };

    // Delete user handler
    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
        setActionLoading(true);
        setActionDropdownUserId(null);
        setError(null);
        try {
            const response = await api.deleteUser(userId);
            if (response.error) {
                setError(response.error);
            } else {
                await loadUsers();
            }
        } catch (err) {
            setError('Failed to delete user');
        } finally {
            setActionLoading(false);
        }
    };

    // Open role change modal for a user
    const openRoleChangeModal = (user: User) => {
        setRoleChangeUser(user);
        setRoleChangeValue(user.role);
        setShowRoleChangeModal(true);
        setActionDropdownUserId(null);
    };

    const navItems = [
        { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
        { id: 'users', icon: Users, label: 'Users' },
        { id: 'discovery', icon: Database, label: 'Discovery' },
        { id: 'ai', icon: Cpu, label: 'AI Config' },
        { id: 'security', icon: Shield, label: 'Security' },
        { id: 'audit', icon: FileText, label: 'Audit Log' },
        { id: 'settings', icon: Settings, label: 'Settings' },
    ];

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            'active': 'bg-green-100 text-green-700',
            'running': 'bg-blue-100 text-blue-700',
            'completed': 'bg-green-100 text-green-700',
            'healthy': 'bg-green-100 text-green-700',
            'pending': 'bg-amber-100 text-amber-700',
            'scheduled': 'bg-gray-100 text-gray-700',
            'failed': 'bg-red-100 text-red-700',
            'disabled': 'bg-gray-100 text-gray-500',
        };
        return colors[status] || 'bg-gray-100 text-gray-700';
    };

    const getTrendIcon = (trend?: 'up' | 'down' | 'neutral') => {
        if (trend === 'up') return <TrendingUp size={14} className="text-green-600" />;
        if (trend === 'down') return <TrendingDown size={14} className="text-red-600" />;
        return <Minus size={14} className="text-gray-400" />;
    };

    return (
        <div className={`flex h-screen ${darkMode ? 'dark bg-[#0a0a0a]' : 'bg-gray-50'}`}>
            {/* Sidebar */}
            <div className={`w-64 flex flex-col border-r ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                {/* Logo */}
                <div className={`h-16 flex items-center gap-3 px-5 border-b ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                    <div className="h-9 w-9 rounded-xl bg-gray-900 flex items-center justify-center">
                        <Gem size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Procura</h1>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Admin</p>
                    </div>
                </div>

                {/* Nav */}
                <div className="flex-1 py-4 px-3 overflow-y-auto">
                    <div className="space-y-1">
                        {navItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id as AdminSection)}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${activeSection === item.id
                                        ? 'bg-gray-900 text-white shadow-sm'
                                        : darkMode
                                            ? 'text-gray-400 hover:bg-neutral-800 hover:text-white'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`}
                            >
                                <item.icon size={18} />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className={`p-3 border-t ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${darkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        <ChevronLeft size={16} />
                        Back to App
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <div className={`h-16 flex items-center justify-between px-6 border-b ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                    <div>
                        <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {navItems.find(n => n.id === activeSection)?.label}
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setDarkMode(!darkMode)}
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
                        >
                            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}>
                            <Bell size={18} />
                        </button>
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                            AM
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Overview */}
                    {activeSection === 'overview' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Error Message */}
                            {error && (
                                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={18} className="text-red-600" />
                                        <p className={`text-sm font-medium ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{error}</p>
                                    </div>
                                </div>
                            )}

                            {/* Metrics Grid */}
                            {metricsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={32} className="animate-spin text-gray-400" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-4">
                                    {metrics.map((metric, i) => (
                                        <div key={i} className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                            <p className="text-sm text-gray-500 mb-1">{metric.label}</p>
                                            <div className="flex items-end justify-between">
                                                <p className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{metric.value}</p>
                                                {metric.change !== undefined && (
                                                    <div className="flex items-center gap-1">
                                                        {getTrendIcon(metric.trend)}
                                                        <span className={`text-xs font-medium ${metric.trend === 'up' ? 'text-green-600' : metric.trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
                                                            {metric.change > 0 ? '+' : ''}{metric.change}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* System Status */}
                            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>System Status</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                            <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>API</p>
                                        </div>
                                        <p className="text-xs text-gray-500">Operational</p>
                                    </div>
                                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                            <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Database</p>
                                        </div>
                                        <p className="text-xs text-gray-500">Connected</p>
                                    </div>
                                    <div className={`p-4 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                            <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>AI Service</p>
                                        </div>
                                        <p className="text-xs text-gray-500">Active</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Users */}
                    {activeSection === 'users' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Error Message */}
                            {error && (
                                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={18} className="text-red-600" />
                                        <p className={`text-sm font-medium ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{error}</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className={`pl-9 pr-4 py-2 border rounded-lg text-sm w-64 ${darkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200'
                                            }`}
                                    />
                                </div>
                                <button
                                    onClick={() => setShowInviteModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all"
                                >
                                    <Plus size={16} />
                                    Invite User
                                </button>
                            </div>

                            {usersLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={32} className="animate-spin text-gray-400" />
                                </div>
                            ) : filteredUsers.length === 0 ? (
                                <div className={`p-8 rounded-xl border text-center ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                    <Users size={32} className="mx-auto mb-3 text-gray-400" />
                                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                        {userSearch.trim() ? 'No users match your search' : 'No users found'}
                                    </p>
                                </div>
                            ) : (
                                <div className={`rounded-xl border overflow-hidden ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                    <table className="w-full">
                                        <thead>
                                            <tr className={darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}>
                                                <th className={`text-left text-xs font-semibold uppercase tracking-wider px-6 py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>User</th>
                                                <th className={`text-left text-xs font-semibold uppercase tracking-wider px-6 py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Role</th>
                                                <th className={`text-left text-xs font-semibold uppercase tracking-wider px-6 py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Status</th>
                                                <th className={`text-left text-xs font-semibold uppercase tracking-wider px-6 py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Last Login</th>
                                                <th className="px-6 py-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${darkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                                            {filteredUsers.map(user => (
                                                <tr key={user.id} className={`transition-colors ${darkMode ? 'hover:bg-neutral-800/30' : 'hover:bg-gray-50'}`}>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-sm font-medium">
                                                                {user.name?.split(' ').map(n => n[0]).join('') || '?'}
                                                            </div>
                                                            <div>
                                                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user.name}</p>
                                                                <p className="text-sm text-gray-500">{user.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{user.role}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(user.status)}`}>
                                                            {user.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-sm text-gray-500">{user.lastLogin || 'Never'}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="relative">
                                                            <button
                                                                onClick={() => setActionDropdownUserId(actionDropdownUserId === user.id ? null : user.id)}
                                                                className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-neutral-700' : 'hover:bg-gray-100'}`}
                                                            >
                                                                <MoreHorizontal size={16} className="text-gray-400" />
                                                            </button>
                                                            {actionDropdownUserId === user.id && (
                                                                <div className={`absolute right-0 top-full mt-1 w-48 rounded-lg border shadow-lg z-10 py-1 ${darkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'}`}>
                                                                    <button
                                                                        onClick={() => openRoleChangeModal(user)}
                                                                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${darkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'}`}
                                                                    >
                                                                        <Edit2 size={14} />
                                                                        Change Role
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteUser(user.id)}
                                                                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                        Delete User
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Discovery */}
                    {activeSection === 'discovery' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Error Message */}
                            {error && (
                                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={18} className="text-red-600" />
                                        <p className={`text-sm font-medium ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{error}</p>
                                    </div>
                                </div>
                            )}

                            {discoveryLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={32} className="animate-spin text-gray-400" />
                                </div>
                            ) : !discoveryConfig ? (
                                <div className={`p-8 rounded-xl border text-center ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                    <Database size={32} className="mx-auto mb-3 text-gray-400" />
                                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Discovery configuration not available</p>
                                </div>
                            ) : (
                                <>
                                    <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                        <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Data Sources</h3>
                                        <div className="space-y-3">
                                            {discoveryConfig.sources.map((source, i) => (
                                                <div key={i} className={`flex items-center justify-between p-4 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${source.enabled ? 'bg-green-100' : 'bg-gray-200'}`}>
                                                            <Database size={20} className={source.enabled ? 'text-green-600' : 'text-gray-400'} />
                                                        </div>
                                                        <div>
                                                            <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{source.name}</p>
                                                            <p className="text-sm text-gray-500">Last sync: {source.last_sync || 'Never'}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(source.status)}`}>
                                                            {source.status}
                                                        </span>
                                                        <button className={source.enabled ? 'text-green-500' : 'text-gray-400'}>
                                                            {source.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {discoveryConfig.naics_filters && discoveryConfig.naics_filters.length > 0 && (
                                        <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                            <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>NAICS Filters</h3>
                                            <div className="flex flex-wrap gap-2">
                                                {discoveryConfig.naics_filters.map((code, i) => (
                                                    <span key={i} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${darkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                                                        {code}
                                                        <button className="hover:text-red-500 ml-1">×</button>
                                                    </span>
                                                ))}
                                                <button className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 border-dashed ${darkMode ? 'border-neutral-700 text-gray-500' : 'border-gray-300 text-gray-500'} hover:border-gray-400`}>
                                                    + Add Code
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* AI Config */}
                    {activeSection === 'ai' && (
                        <div className="space-y-6 animate-fade-in">
                            {/* Error Message */}
                            {error && (
                                <div className={`p-4 rounded-xl border ${darkMode ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}`}>
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle size={18} className="text-red-600" />
                                        <p className={`text-sm font-medium ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{error}</p>
                                    </div>
                                </div>
                            )}

                            {aiLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 size={32} className="animate-spin text-gray-400" />
                                </div>
                            ) : !aiConfig ? (
                                <div className={`p-8 rounded-xl border text-center ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                    <Cpu size={32} className="mx-auto mb-3 text-gray-400" />
                                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>AI configuration not available</p>
                                </div>
                            ) : (
                                <>
                                    <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                        <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>LLM Configuration</h3>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-500 mb-2">Provider</label>
                                                <div className={`p-3 rounded-lg ${darkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                                                    <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{aiConfig.provider}</p>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-500 mb-2">Model</label>
                                                <div className={`p-3 rounded-lg ${darkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                                                    <p className={`font-medium font-mono ${darkMode ? 'text-white' : 'text-gray-900'}`}>{aiConfig.model}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {(aiConfig.qualification_threshold !== undefined ||
                                      aiConfig.auto_qualify_above !== undefined ||
                                      aiConfig.auto_reject_below !== undefined) && (
                                        <div className={`p-5 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                            <h3 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Qualification Thresholds</h3>
                                            <div className="space-y-6">
                                                {aiConfig.auto_qualify_above !== undefined && (
                                                    <div>
                                                        <div className="flex justify-between mb-2">
                                                            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Auto-Qualify Above</span>
                                                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{aiConfig.auto_qualify_above}%</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${aiConfig.auto_qualify_above}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {aiConfig.qualification_threshold !== undefined && (
                                                    <div>
                                                        <div className="flex justify-between mb-2">
                                                            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Qualification Threshold</span>
                                                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{aiConfig.qualification_threshold}%</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${aiConfig.qualification_threshold}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                                {aiConfig.auto_reject_below !== undefined && (
                                                    <div>
                                                        <div className="flex justify-between mb-2">
                                                            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Auto-Reject Below</span>
                                                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{aiConfig.auto_reject_below}%</span>
                                                        </div>
                                                        <div className="h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-red-500 rounded-full" style={{ width: `${aiConfig.auto_reject_below}%` }} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Settings section - redirect to Settings page */}
                    {activeSection === 'settings' && (
                        <div className="space-y-6">
                            <div className={`p-6 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Platform Settings</h3>
                                <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    API keys, LLM configuration, and automation settings are managed from the dedicated Settings page.
                                </p>
                                <button
                                    onClick={() => navigate('/settings')}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all"
                                >
                                    <ExternalLink size={16} />
                                    Open Settings
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Security section */}
                    {activeSection === 'security' && (
                        <div className="space-y-6">
                            <div className={`p-6 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Security Status</h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'JWT Authentication', status: 'active', detail: 'Supabase Auth with PKCE flow' },
                                        { label: 'Row-Level Security', status: 'active', detail: 'PostgreSQL RLS policies enforced' },
                                        { label: 'Credential Vault', status: 'active', detail: 'Fernet AES-128 encryption at rest' },
                                        { label: 'Audit Log Signing', status: 'active', detail: 'HMAC-SHA256 integrity verification' },
                                        { label: 'MFA (TOTP)', status: 'active', detail: 'Multi-factor authentication enabled' },
                                        { label: 'HTTPS Enforcement', status: 'active', detail: 'TLS for all API communication' },
                                    ].map((item) => (
                                        <div key={item.label} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                            <div>
                                                <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.label}</p>
                                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.detail}</p>
                                            </div>
                                            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                                                <CheckCircle size={14} /> Active
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className={`p-6 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Compliance Readiness</h3>
                                <p className={`text-xs mb-3 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Estimated readiness — connect compliance tooling for live tracking.</p>
                                <div className="space-y-3">
                                    {[
                                        { label: 'SOC 2 Type II', progress: 75 },
                                        { label: 'NIST 800-171', progress: 60 },
                                        { label: 'FedRAMP', progress: 40 },
                                    ].map((item) => (
                                        <div key={item.label}>
                                            <div className="flex justify-between mb-1">
                                                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{item.label}</span>
                                                <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.progress}%</span>
                                            </div>
                                            <div className={`h-2 rounded-full ${darkMode ? 'bg-neutral-700' : 'bg-gray-200'}`}>
                                                <div className={`h-full rounded-full ${item.progress >= 70 ? 'bg-green-500' : item.progress >= 50 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${item.progress}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audit section - redirect to Audit Vault */}
                    {activeSection === 'audit' && (
                        <div className="space-y-6">
                            <div className={`p-6 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Audit & Compliance</h3>
                                <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    View the full audit trail with HMAC-verified integrity checks and compliance evidence.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => navigate('/audit')}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all"
                                    >
                                        <ExternalLink size={16} />
                                        Open Audit Vault
                                    </button>
                                </div>
                            </div>
                            <div className={`p-6 rounded-xl border ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-100'}`}>
                                <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Audit Features</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { icon: Shield, label: 'Immutable Logs', desc: 'HMAC-SHA256 signed entries' },
                                        { icon: FileText, label: 'Evidence Storage', desc: 'Screenshots, PDFs, receipts' },
                                        { icon: Download, label: 'JSON Export', desc: 'Full audit trail export' },
                                        { icon: CheckCircle, label: 'Tamper Detection', desc: 'Cryptographic verification' },
                                    ].map((item) => (
                                        <div key={item.label} className={`p-3 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                            <item.icon size={20} className={`mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                                            <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.label}</p>
                                            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Invite User Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowInviteModal(false)} />
                    <div className={`relative w-full max-w-md mx-4 rounded-xl border shadow-2xl ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-200'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Invite User</h3>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email Address</label>
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="user@example.com"
                                    className={`w-full px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 placeholder-gray-400'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Role</label>
                                <select
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200'}`}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="contract_officer">Contract Officer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleInviteUser}
                                disabled={inviteLoading || !inviteEmail.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {inviteLoading && <Loader2 size={14} className="animate-spin" />}
                                {inviteLoading ? 'Sending...' : 'Send Invite'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Role Modal */}
            {showRoleChangeModal && roleChangeUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => { setShowRoleChangeModal(false); setRoleChangeUser(null); }} />
                    <div className={`relative w-full max-w-md mx-4 rounded-xl border shadow-2xl ${darkMode ? 'bg-[#111] border-neutral-800' : 'bg-white border-gray-200'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                            <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Change Role</h3>
                            <button
                                onClick={() => { setShowRoleChangeModal(false); setRoleChangeUser(null); }}
                                className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className={`p-3 rounded-lg ${darkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                                <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{roleChangeUser.name}</p>
                                <p className="text-xs text-gray-500">{roleChangeUser.email}</p>
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>New Role</label>
                                <select
                                    value={roleChangeValue}
                                    onChange={(e) => setRoleChangeValue(e.target.value)}
                                    className={`w-full px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200'}`}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="contract_officer">Contract Officer</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${darkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                            <button
                                onClick={() => { setShowRoleChangeModal(false); setRoleChangeUser(null); }}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleChangeRole}
                                disabled={actionLoading || roleChangeValue === roleChangeUser.role}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                                {actionLoading ? 'Updating...' : 'Update Role'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Click-away listener for action dropdown */}
            {actionDropdownUserId && (
                <div className="fixed inset-0 z-0" onClick={() => setActionDropdownUserId(null)} />
            )}
        </div>
    );
};

export default AdminDashboard;
