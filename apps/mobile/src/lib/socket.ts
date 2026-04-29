import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://10.0.2.2:4000';

let socket: Socket | null = null;

export function getSocket(token?: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      transports: ['websocket'], // Skip long-polling for mobile performance
    });
  }
  return socket;
}

export function connectSocket(token?: string) {
  const s = getSocket(token);
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const joinMatchRoom = (matchId: string) => socket?.emit('match:join', matchId);
export const leaveMatchRoom = (matchId: string) => socket?.emit('match:leave', matchId);
