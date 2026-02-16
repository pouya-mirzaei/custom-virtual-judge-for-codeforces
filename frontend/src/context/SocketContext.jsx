import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

/**
 * Provides a singleton Socket.io connection.
 * Children can call useSocket() to get the socket instance.
 */
export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    // Connect to the backend (Vite proxies /socket.io to localhost:5000)
    const s = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      console.log('[Socket.io] Connected:', s.id);
    });

    s.on('disconnect', (reason) => {
      console.log('[Socket.io] Disconnected:', reason);
    });

    socketRef.current = s;
    setSocket(s);

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/**
 * Hook to access the socket instance.
 * Returns null until connection is established.
 */
export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Hook to join/leave a contest room and listen for events.
 *
 * @param {string} contestId - The contest to join
 * @param {Object} handlers - { onSubmissionUpdate, onStandingsUpdate }
 */
export function useContestSocket(contestId, handlers = {}) {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !contestId) return;

    // Join contest room
    socket.emit('join-contest', contestId);

    // Register event listeners
    if (handlers.onSubmissionUpdate) {
      socket.on('submission-update', handlers.onSubmissionUpdate);
    }
    if (handlers.onStandingsUpdate) {
      socket.on('standings-update', handlers.onStandingsUpdate);
    }

    return () => {
      socket.emit('leave-contest', contestId);
      socket.off('submission-update', handlers.onSubmissionUpdate);
      socket.off('standings-update', handlers.onStandingsUpdate);
    };
  }, [socket, contestId]);
}
