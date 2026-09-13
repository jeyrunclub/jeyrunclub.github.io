// What happened while you were away.
//
// Rows are written by database triggers, so a notification cannot be missed
// because some client forgot to send it — posting an announcement, commenting,
// announcing a record day, writing a week's plan and asking to join all
// produce one as a side effect of the write itself.

export async function fetchNotifications(supabase, limit = 30) {
  const { data, error } = await supabase.from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function unreadCount(supabase) {
  const { count, error } = await supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) { console.error(error); return 0; }
  return count || 0;
}

export async function markAllRead(supabase, userId) {
  return await supabase.from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).is('read_at', null);
}

// Live while the app is open. Returns an unsubscribe.
export function watchNotifications(supabase, userId, onInsert) {
  const channel = supabase.channel(`notif:${userId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => onInsert(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
