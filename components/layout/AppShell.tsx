'use client';
// components/layout/AppShell.tsx
// Navigation mirrors the original desktop ribbon tabs exactly.
// Fixed Shifts modal is managed here so it works from any page.

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Load FixedShiftsModal lazily so it doesn't bloat initial bundle
const FixedShiftsModal = dynamic(
  () => import('@/components/employees/FixedShiftsModal'),
  { ssr: false }
);

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconSchedule() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8"  y1="2" x2="8"  y2="6"/>
      <line x1="3"  y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function IconEmployees() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  );
}
function IconCompany() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83
               0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4
               0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0
               01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2
               0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0
               012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0
               014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0
               012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2
               0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  );
}
function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

// ─── Nav structure ────────────────────────────────────────────────────────────

interface SubItem {
  href:         string;
  label:        string;
  fixedShifts?: boolean;
}
interface NavSection {
  id:       string;
  label:    string;
  icon:     React.ReactNode;
  href?:    string;
  children?: SubItem[];
}

const NAV: NavSection[] = [
  {
    id: 'schedule', label: 'Schedule', icon: <IconSchedule />, href: '/schedule',
  },
  {
    id: 'employees', label: 'Employees', icon: <IconEmployees />,
    children: [
      { href: '/employees/list',     label: 'Employee List' },
      { href: '/employees/skills',   label: 'Skills'        },
      { href: '/employees/time-off', label: 'Time Off'      },
      { href: '/employees/fixed-shifts', label: 'Fixed Shifts', fixedShifts: true },
    ],
  },
  {
    id: 'company', label: 'Company', icon: <IconCompany />,
    children: [
      { href: '/company/edit',         label: 'Edit Company'  },
      { href: '/company/breaks',       label: 'Breaks'        },
      { href: '/company/positions',    label: 'Positions'     },
      { href: '/company/email-server', label: 'Email Server'  },
    ],
  },
  {
    id: 'settings', label: 'Settings', icon: <IconSettings />, href: '/settings',
  },
];

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children:       React.ReactNode;
  companyName?:   string;
  onFixedShifts?: () => void; // optional override — if not provided, AppShell manages it
}

export default function AppShell({ children, companyName }: AppShellProps) {
  const pathname   = usePathname();
  const router     = useRouter();
  const [expanded, setExpanded]         = useState<string[]>([]);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [loggingOut, setLoggingOut]     = useState(false);
  const [showFixedShifts, setShowFixedShifts] = useState(false);

  useEffect(() => {
    for (const section of NAV) {
      if (section.children) {
        const active = section.children.some(
          c => !c.fixedShifts && pathname.startsWith(c.href)
        );
        if (active) setExpanded(prev => prev.includes(section.id) ? prev : [...prev, section.id]);
      }
    }
  }, [pathname]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function toggleExpand(id: string) {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }
  function isSectionActive(section: NavSection): boolean {
    if (section.href) return isActive(section.href);
    return section.children?.some(c => !c.fixedShifts && isActive(c.href)) ?? false;
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[var(--surface-sidebar)]">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[var(--brand-500)] flex items-center
                          justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="2.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8"  y1="2" x2="8"  y2="6"/>
              <line x1="3"  y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold leading-tight truncate">TASScheduler</p>
            {companyName && (
              <p className="text-[var(--text-sidebar)] text-[11px] truncate leading-tight mt-0.5">
                {companyName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
        {NAV.map(section => {
          const active     = isSectionActive(section);
          const isExpanded = expanded.includes(section.id);
          return (
            <div key={section.id}>
              {section.href ? (
                <Link href={section.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
                              transition-colors w-full
                              ${active
                                ? 'bg-[var(--surface-active)] text-white font-medium'
                                : 'text-[var(--text-sidebar)] hover:bg-white/8 hover:text-white'}`}>
                  <span className={active ? 'text-white' : 'text-[var(--text-sidebar)]'}>
                    {section.icon}
                  </span>
                  {section.label}
                </Link>
              ) : (
                <button onClick={() => toggleExpand(section.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm
                              transition-colors w-full
                              ${active
                                ? 'text-white font-medium'
                                : 'text-[var(--text-sidebar)] hover:bg-white/8 hover:text-white'}`}>
                  <span className={active ? 'text-white' : 'text-[var(--text-sidebar)]'}>
                    {section.icon}
                  </span>
                  <span className="flex-1 text-left">{section.label}</span>
                  <span className={active ? 'text-white/60' : 'text-[var(--text-sidebar)]/60'}>
                    <IconChevron open={isExpanded} />
                  </span>
                </button>
              )}

              {section.children && isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
                  {section.children.map(child => {
                    if (child.fixedShifts) {
                      return (
                        <button key="fixed-shifts"
                          onClick={() => setShowFixedShifts(true)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs
                                     text-[var(--text-sidebar)] hover:bg-white/8 hover:text-white
                                     transition-colors w-full text-left">
                          <span className="w-1 h-1 rounded-full bg-current opacity-50" />
                          {child.label}
                        </button>
                      );
                    }
                    const childActive = isActive(child.href);
                    return (
                      <Link key={child.href} href={child.href}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs
                                    transition-colors
                                    ${childActive
                                      ? 'bg-[var(--surface-active)] text-white font-medium'
                                      : 'text-[var(--text-sidebar)] hover:bg-white/8 hover:text-white'}`}>
                        <span className={`w-1 h-1 rounded-full
                                          ${childActive ? 'bg-white' : 'bg-current opacity-50'}`} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="px-2 pb-3 pt-2 border-t border-white/10 shrink-0">
        <button onClick={handleLogout} disabled={loggingOut}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-sm
                     text-[var(--text-sidebar)] hover:bg-white/8 hover:text-white
                     transition-colors disabled:opacity-50">
          <IconSignOut />
          {loggingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-bg)]">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden"
             onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 flex flex-col
                         transition-transform duration-200
                         ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
             style={{ width: 'var(--sidebar-width)' }}>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-[var(--border)] flex items-center px-4 shrink-0"
                style={{ height: 'var(--header-height)' }}>
          <button className="lg:hidden mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={() => setMobileOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6"  x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <PageTitle pathname={pathname} />
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {showFixedShifts && (
        <FixedShiftsModal onClose={() => setShowFixedShifts(false)} />
      )}
    </div>
  );
}

function PageTitle({ pathname }: { pathname: string }) {
  const labels: Record<string, string> = {
    '/schedule':               'Schedule',
    '/employees/list':         'Employee List',
    '/employees/skills':       'Skills',
    '/employees/time-off':     'Time Off',
    '/company/edit':           'Edit Company',
    '/company/breaks':         'Breaks',
    '/company/positions':      'Positions',
    '/company/email-server':   'Email Server',
    '/settings':               'Settings',
  };
  let label = 'TASScheduler';
  for (const [path, name] of Object.entries(labels)) {
    if (pathname === path || pathname.startsWith(path + '/')) { label = name; break; }
  }
  return <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>;
}
