// The club feed on a page of its own.
//
// It started under the hero on both the student and coach pages, which made
// every visit to "what am I running today" scroll past whatever Salar last
// posted. News keeps, a workout does not.

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { AppHeader } from './AppHeader';
import { Feed } from './Feed';

type Me = { id: string; full_name: string | null; avatar_path: string | null };

export function NewsPage() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.replace('/app/login'); return; }
      const { data: p } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (!p) { setLoading(false); return; }
      if (p.role !== 'coach' && p.status !== 'approved') {
        window.location.replace('/app/pending');
        return;
      }
      setMe({ id: p.id, full_name: p.full_name, avatar_path: p.avatar_path ?? null });
      setIsCoach(p.role === 'coach');
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen">
      <AppHeader isCoach={isCoach} />
      <main className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pb-28 pt-6 sm:pb-20">
        <div className="flex items-center gap-2 px-1">
          <Megaphone className="size-5 text-primary" />
          <h1 className="display text-3xl">اطلاعیه‌ها</h1>
        </div>

        {loading || !me ? (
          <>
            <div className="h-10 animate-pulse rounded-2xl bg-muted" />
            <div className="h-40 animate-pulse rounded-2xl bg-muted" />
          </>
        ) : (
          <Feed me={me} isCoach={isCoach} page />
        )}
      </main>
    </div>
  );
}
