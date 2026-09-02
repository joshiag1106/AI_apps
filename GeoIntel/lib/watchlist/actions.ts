'use server';

import { revalidatePath } from 'next/cache';
import { currentUser } from '@/lib/auth';
import { addWatch, removeWatch, clearWatch, adoptWatch, type WatchItem } from '@/lib/watchlist/store';

/**
 * Mutations for the account-bound watchlist.
 *
 * Every one re-reads the session rather than trusting a user id from the client, so a
 * forged form post can only ever act on the poster's own list. Signed-out callers are a
 * no-op: their pins live in localStorage and never reach the server at all.
 */

export async function toggleWatchAction(item: WatchItem, on: boolean) {
  const user = await currentUser();
  if (!user) return;
  if (on) addWatch(user.id, item);
  else removeWatch(user.id, item.kind, item.id);
  // The dashboard renders the panel server-side, so it has to be refreshed too.
  revalidatePath('/dashboard');
}

export async function clearWatchAction() {
  const user = await currentUser();
  if (!user) return;
  clearWatch(user.id);
  revalidatePath('/dashboard');
}

/**
 * Take over the pins someone made before signing in. Called once by the browser after a
 * session exists; adopting twice is harmless because already-pinned items are left alone.
 */
export async function adoptWatchAction(items: WatchItem[]) {
  const user = await currentUser();
  if (!user) return;
  adoptWatch(user.id, items);
  revalidatePath('/dashboard');
}
