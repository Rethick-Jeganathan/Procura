import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, ShieldAlert, Lock, Briefcase, Gem, ChevronLeft, ChevronRight, LogOut, Settings, FolderOpen, CalendarClock, Mail } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = (user as any)?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const userRole = (user as any)?.user_metadata?.role || 'viewer';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${isActive
      ? 'bg-gray-900 text-white shadow-md'
      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-neutral-800 dark:text-gray-400 dark:hover:text-white'
    } ${isCollapsed ? 'justify-center' : ''}`;

  return (
    <div
      className={`flex h-full flex-col border-r border-gray-200 bg-white dark:bg-[#111111] dark:border-neutral-800 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${isCollapsed ? 'w-[80px]' : 'w-64'}`}
    >
      {/* Logo Area */}
      <div className={`flex h-16 items-center border-b border-gray-100 dark:border-neutral-800 transition-all duration-300 ${isCollapsed ? 'justify-center px-0' : 'px-6 gap-3'}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white shrink-0 shadow-sm transition-transform hover:scale-105">
          <Gem size={20} />
        </div>
        <div className={`flex flex-col overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
          <h1 className="text-gray-900 dark:text-white text-sm font-bold leading-none tracking-tight">Procura</h1>
          <p className="text-gray-500 text-[10px] mt-1 font-medium tracking-wide uppercase">Ops Command</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-1 p-3 overflow-y-auto flex-1 overflow-x-hidden custom-scrollbar">
        {!isCollapsed && <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">Main</p>}
        {isCollapsed && <div className="h-4"></div>}

        <NavLink to="/dashboard" className={navItemClass} title="Browse and qualify opportunities">
          <LayoutDashboard size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Dashboard</span>
        </NavLink>
        <NavLink to="/submissions" className={navItemClass} title="Manage submission workflows">
          <FileText size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Submissions</span>
        </NavLink>
        <NavLink to="/workspace" className={navItemClass} title="Proposal workspace">
          <Briefcase size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Workspace</span>
        </NavLink>
        <NavLink to="/documents" className={navItemClass} title="Reusable document library">
          <FolderOpen size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Documents</span>
        </NavLink>

        {!isCollapsed && <div className="my-2 border-t border-gray-100 dark:border-neutral-800 mx-3"></div>}
        {!isCollapsed && <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">Tracking</p>}

        <NavLink to="/follow-ups" className={navItemClass} title="Application follow-up tracking">
          <CalendarClock size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Follow-ups</span>
        </NavLink>
        <NavLink to="/correspondence" className={navItemClass} title="Awards, communications & notifications">
          <Mail size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Correspondence</span>
        </NavLink>

        {!isCollapsed && <div className="my-2 border-t border-gray-100 dark:border-neutral-800 mx-3"></div>}
        {!isCollapsed && <p className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest animate-in fade-in duration-300">System</p>}

        <NavLink to="/admin" className={navItemClass} title="System administration and settings">
          <ShieldAlert size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Admin</span>
        </NavLink>
        <NavLink to="/audit" className={navItemClass} title="Audit trail and compliance logs">
          <Lock size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Audit Logs</span>
        </NavLink>
        <NavLink to="/settings" className={navItemClass} title="API keys and system settings">
          <Settings size={20} className="shrink-0" />
          <span className={`text-sm font-medium whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>Settings</span>
        </NavLink>
      </div>

      {/* Footer / User Profile */}
      <div className="p-3 border-t border-gray-200 dark:border-neutral-800 flex flex-col gap-2">
        <div className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm ring-2 ring-white dark:ring-neutral-900">{initials}</div>
          <div className={`flex flex-col overflow-hidden whitespace-nowrap transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}`}>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{displayName}</span>
            <span className="text-[10px] text-gray-500 uppercase tracking-wide font-medium">{userRole}</span>
          </div>
          {!isCollapsed && <button onClick={handleLogout} title="Sign out"><LogOut size={14} className="ml-auto text-gray-400 hover:text-red-500 transition-colors" /></button>}
        </div>

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={`flex items-center justify-center h-8 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-gray-900 transition-all active:scale-95 ${isCollapsed ? 'w-full' : 'w-full'}`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <div className="flex items-center gap-2"><ChevronLeft size={16} /><span className="text-xs font-medium">Collapse</span></div>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
