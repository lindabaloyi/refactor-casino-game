import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameState } from '../types/gameTypes';

// Make sure this URL points to your server. Use your machine's IP for mobile testing.
const SERVER_URL = 'http://localhost:3000';

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerNumber, setPlayerNumber] = useState<number | null>(null);

  useEffect(() => {
    // Connect to the server
    socketRef.current = io(SERVER_URL);

    socketRef.current.on('connect', () => {
      console.log('Connected to server with ID:', socketRef.current?.id);
    });

    socketRef.current.on('player-number', (num: number) => {
      console.log(`Assigned player number: ${num}`);
      setPlayerNumber(num);
    });

    socketRef.current.on('game-start', (data: { gameState: GameState; playerNumber: number }) => {
      console.log('Game is starting!');
      setGameState(data.gameState);
    });

    socketRef.current.on('game-update', (newGameState: GameState) => {
      console.log('Received game update.');
      setGameState(newGameState);
    });

    socketRef.current.on('error', (error: { message: string }) => {
        alert(`Server Error: ${error.message}`);
    });

    // Disconnect on cleanup
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const sendAction = (type: string, payload: object) => {
    console.log(`Sending action: ${type}`);
    socketRef.current?.emit('game-action', { type, payload });
  };

  return { gameState, playerNumber, sendAction };
};
