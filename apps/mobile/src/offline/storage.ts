import AsyncStorage from '@react-native-async-storage/async-storage';
import { BallEvent } from '@cricket-os/shared';

// AsyncStorage is used here for Expo Go compatibility.
// These calls are async but we wrap them so the API stays ergonomic.

const QUEUE_KEY = 'pending_balls';

async function readQueue(): Promise<BallEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function writeQueue(balls: BallEvent[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(balls));
}

export async function queueBallEvent(ball: BallEvent): Promise<void> {
  const queue = await readQueue();
  if (queue.some((b) => b.clientId === ball.clientId)) return;
  queue.push(ball);
  await writeQueue(queue);
}

export async function getPendingBalls(matchId?: string): Promise<BallEvent[]> {
  const queue = await readQueue();
  return matchId ? queue.filter((b) => b.matchId === matchId) : queue;
}

export async function removePendingBall(clientId: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((b) => b.clientId !== clientId));
}

export async function clearAllPending(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
