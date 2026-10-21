import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Keep this callback synchronous (Supabase recommendation).
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const profileQuery = useQuery({
    queryKey: ['me', userId],
    enabled: Boolean(userId),
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 30_000 : false),
    queryFn: async () => {
      const profile = unwrap(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
      if (!profile) return profile;
      // Ask the login system whether this person still has to choose a password
      // (true for anyone who came in through an approval or invitation email).
      const { data: needs, error } = await supabase.rpc('needs_password');
      return { ...profile, needs_password: error ? false : Boolean(needs) };
    },
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    qc.clear();
  }, [qc]);

  const value = useMemo(() => {
    const profile = profileQuery.data ?? null;
    const active = profile?.status === 'active';
    return {
      session,
      user: session?.user ?? null,
      profile,
      loading: session === undefined || (Boolean(userId) && profileQuery.isLoading),
      profileError: profileQuery.error,
      isActive: active,
      isAdmin: active && profile.role === 'admin',
      canEdit: active && (profile.role === 'admin' || profile.role === 'member'),
      recovering,
      finishRecovery: () => setRecovering(false),
      refreshProfile: () => profileQuery.refetch(),
      signOut,
    };
  }, [session, userId, profileQuery, recovering, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
