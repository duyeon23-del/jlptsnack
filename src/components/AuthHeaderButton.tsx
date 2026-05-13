import { useEffect, useRef, useState, type FC } from 'react';
import { User } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';

function profileImageUrl(user: SupabaseUser) {
  const m = user.user_metadata as Record<string, unknown> | undefined;
  if (!m) return null;
  if (typeof m.avatar_url === 'string' && m.avatar_url) return m.avatar_url;
  if (typeof m.picture === 'string' && m.picture) return m.picture;
  return null;
}

export const AuthHeaderButton: FC<{
  user: SupabaseUser | null;
  onGoogleLogin: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}> = ({ user, onGoogleLogin, onSignOut }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => void onGoogleLogin()}
        className="flex items-center gap-2 p-2 pl-2.5 pr-3 sm:pr-4 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm text-sm font-bold"
        title="Google로 로그인"
      >
        <span className="flex h-8 w-8 items-center justify-center shrink-0" aria-hidden>
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
        </span>
        <span className="hidden sm:inline">Google</span>
      </button>
    );
  }

  const src = profileImageUrl(user);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-md transition hover:ring-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        title="계정"
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-600">
            <User className="h-5 w-5" />
          </span>
        )}
      </button>
      {menuOpen ? (
        <div
          className="absolute right-0 top-full z-[60] mt-2 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-xl"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full px-4 py-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-50"
            onClick={() => {
              setMenuOpen(false);
              void onSignOut();
            }}
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
};
