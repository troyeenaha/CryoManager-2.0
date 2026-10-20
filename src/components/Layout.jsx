import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChartColumn, Boxes, Container, Grid3x3, LayoutList, LogOut, Menu as MenuIcon, Settings, Users, X, WifiOff,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BrandMark, LabLogo } from './Brand.jsx';
import { roleLabel } from '../lib/format.js';
import { useLiveInventory } from '../api/data.js';
import { cx } from './ui.jsx';

const NAV = [
  { section: 'Storage', items: [
    { to: '/tanks', label: 'Tanks', icon: Container },
    { to: '/racks', label: 'Racks', icon: LayoutList },
    { to: '/boxes', label: 'Boxes', icon: Boxes },
    { to: '/grid', label: 'Grid View', icon: Grid3x3 },
  ] },
  { section: 'Analytics', items: [{ to: '/reports', label: 'Reports', icon: ChartColumn }] },
  { section: 'Administration', items: [
    { to: '/users', label: 'Users', icon: Users, admin: true },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] },
];

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

function Sidebar({ onNavigate }) {
  const { profile, isAdmin, signOut } = useAuth();
  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-100 shrink-0">
        <BrandMark />
        <div className="leading-tight">
          <div className="font-semibold text-slate-900 tracking-tight">CryoManager</div>
          <div className="text-xs text-slate-500">Lab Storage System</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Main">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.section}</div>
            <ul className="space-y-0.5">
              {group.items.filter((i) => !i.admin || isAdmin).map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        isActive ? 'brand-gradient text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3 shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="h-8 min-w-8 px-1 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-semibold shrink-0">
            {profile?.initials || (profile?.full_name || profile?.email || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 truncate">{profile?.full_name || profile?.email}</div>
            <div className="text-xs text-slate-500">{roleLabel[profile?.role]}</div>
          </div>
          <button onClick={signOut} aria-label="Sign out" title="Sign out" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 pt-4 pb-1 border-t border-slate-100">
          <LabLogo />
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const online = useOnline();
  useLiveInventory(true);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 h-14 px-4 bg-white/90 backdrop-blur border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-lg p-2 -ml-2 text-slate-600 hover:bg-slate-100">
            <MenuIcon className="h-5 w-5" />
          </button>
          <BrandMark className="h-7 w-7" />
          <span className="font-semibold text-slate-900">CryoManager</span>
        </header>
        {!online && (
          <div className="sticky top-14 lg:top-0 z-20 flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm py-2 px-4">
            <WifiOff className="h-4 w-4" /> You are offline. Changes cannot be saved until the connection returns.
          </div>
        )}
        <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8 max-w-[1400px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
