import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? 'http://10.0.2.2:4000';

let socket: Socket | null = null;
let currentToken: string | undefined;

export function connectSocket(token?: string): Socket {
  // Re-create the socket if the auth token has changed (e.g. after login/logout)
  if (socket && token !== currentToken) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentToken = token;
    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      transports: ['websocket'],
    });
  }

  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentToken = undefined;
}

export const joinMatchRoom = (matchId: string) => socket?.emit('match:join', matchId);
export const leaveMatchRoom = (matchId: string) => socket?.emit('match:leave', matchId);
