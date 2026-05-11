import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET_INTERNAL as JWT_SECRET } from '../middleware/auth';

// ============================================================
// SOCKET.IO HANDLERS
//
// Match rooms: "match:{matchId}"
// Viewers join and receive live ball events.
// Scorers emit ball events (authenticated via JWT handshake).
// ============================================================

export function initSocketHandlers(io: Server) {
  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        (socket as any).user = payload;
      } catch {
        // Unauthenticated viewers are allowed — they just can't score
      }
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    // Join a match room to receive live updates
    socket.on('match:join', (matchId: string) => {
      socket.join(`match:${matchId}`);
      socket.emit('match:joined', { matchId });
    });

    // Leave a match room
    socket.on('match:leave', (matchId: string) => {
      socket.leave(`match:${matchId}`);
    });

    // Ping/pong for connection health check
    socket.on('ping', () => socket.emit('pong'));

    socket.on('disconnect', () => {
      // Cleanup handled automatically by Socket.io room management
    });
  });
}
