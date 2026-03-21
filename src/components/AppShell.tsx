import { NavLink, Outlet, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { signOut } from '../lib/supabase';
import { useAppStore } from '../store/appStore';

const LOCK = '🔒';

export function AppShell() {
  const user = useAppStore((s) => s.user);
  const activeSource = useAppStore((s) => s.activeSource);
  
  const location = useLocation();
  const unlocked = Boolean(activeSource);

  const tabs = [
    { to: '/', label: '홈', alwaysOn: true },
    { to: '/bucket', label: '티어', alwaysOn: false },
    { to: '/match', label: '소팅', alwaysOn: false },
    { to: '/ranking', label: '랭킹', alwaysOn: false },
  ];

  return (
    <div className="min-h-screen bg-warm-50">
      {/* ── 상단 내비 ── */}
      <header className="sticky top-0 z-50 bg-warm-50/95 backdrop-blur border-b border-warm-200">
        <div className="mx-auto max-w-lg px-4">
          {/* 로고 + 소스칩 + 유저 */}
          <div className="flex items-center justify-between py-3">
            <span className="font-display text-lg text-warm-800 tracking-tight">
              Sorter<span className="text-brand-500">.</span>
            </span>
            <div className="flex items-center gap-2">
              {activeSource && (
                <NavLink
                  to="/"
                  className="flex items-center gap-1.5 rounded-full border border-warm-200 bg-white px-3 py-1 text-xs text-warm-500"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  <span className="max-w-[120px] truncate font-medium text-warm-700">{activeSource.name}</span>
                </NavLink>
              )}
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    void signOut().catch(() => undefined).finally(() => {
                      useAppStore.getState().setAuth(undefined);
                      useAppStore.getState().setUser(undefined);
                    });
                  }}
                  className="rounded-full border border-warm-200 bg-white px-3 py-1 text-xs text-warm-500 hover:text-warm-700"
                >
                  {user.isPremium ? '✦ ' : ''}{user.email?.split('@')[0] ?? '내 계정'} · 로그아웃
                </button>
              )}
            </div>
          </div>

          {/* 탭 바 */}
          <div className="flex">
            {tabs.map((tab) => {
              const disabled = !tab.alwaysOn && !unlocked;
              const isActive = tab.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(tab.to);

              return (
                <NavLink
                  key={tab.to}
                  to={disabled ? '#' : tab.to}
                  onClick={(e) => { if (disabled) e.preventDefault(); }}
                  className={clsx(
                    'flex flex-1 items-center justify-center gap-1 border-b-2 pb-2.5 pt-0.5 text-xs font-medium transition-colors',
                    isActive && !disabled
                      ? 'border-warm-800 text-warm-800'
                      : 'border-transparent text-warm-400',
                    disabled ? 'cursor-default' : 'hover:text-warm-600',
                  )}
                >
                  {tab.label}
                  {disabled && <span className="text-[9px] opacity-60">{LOCK}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── 페이지 콘텐츠 ── */}
      <main className="mx-auto max-w-lg px-4 pb-10 pt-5">
        <Outlet />
      </main>
    </div>
  );
}
