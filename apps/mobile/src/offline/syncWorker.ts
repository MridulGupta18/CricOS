import NetInfo from '@react-native-community/netinfo';
import { getPendingBalls, removePendingBall } from './storage';
import { scoringApi } from '@/lib/api';
import { useScoringStore } from '@/stores/scoringStore';
import { useAuthStore } from '@/stores/authStore';

// ============================================================
// SYNC WORKER — flushes offline queue when back online
// ============================================================

let isSyncing = false;

export async function syncPendingBalls() {
  if (isSyncing) return;
  // Don't sync until auth store has rehydrated — avoids sending unauthenticated requests
  if (!useAuthStore.getState().accessToken) return;
  isSyncing = true;

  try {
    const pending = await getPendingBalls();
    if (pending.length === 0) return;

    console.log(`[Sync] Flushing ${pending.length} offline ball events`);

    for (const ball of pending) {
      try {
        await scoringApi.scoreBall({
          clientId: ball.clientId,
          inningsId: ball.inningsId,
          batsmanId: ball.batsmanId,
          bowlerId: ball.bowlerId,
          runs: ball.runs,
          extraType: ball.extras?.type ?? null,
          extraRuns: ball.extras?.runs ?? 0,
          wicket: ball.wicket ?? null,
        });
        await removePendingBall(ball.clientId);
        useScoringStore.getState().removePendingBall(ball.clientId);
      } catch (err: any) {
        // Permanently failed — remove from both storage and store
        const status = err?.response?.status;
        if (status === 409 || status === 422) {
          await removePendingBall(ball.clientId);
          useScoringStore.getState().removePendingBall(ball.clientId);
        }
        // Network error — leave in queue, retry next sync
      }
    }
  } finally {
    isSyncing = false;
  }
}

// Subscribe to NetInfo — fires immediately + on change
export function initNetworkListener() {
  return NetInfo.addEventListener((state: any) => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    useScoringStore.getState().setOnline(online);
    if (online) syncPendingBalls();
  });
}
