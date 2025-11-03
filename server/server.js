const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Server is running.');
});

const { initializeGame } = require('./game-logic/game-state');
const { handleTrail, handleCapture } = require('./game-logic/game-actions');

let players = [];
let gameState = null;

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);
  players.push(socket);

  // Assign player number
  const playerNumber = players.length;
  socket.emit('player-number', playerNumber);

  if (players.length === 2) {
    // Start the game
    gameState = initializeGame();
    console.log('Two players connected. Starting game...');

    // Emit game state to both players
    players.forEach((playerSocket, index) => {
      playerSocket.emit('game-start', { gameState, playerNumber: index + 1 });
    });
  }

  socket.on('game-action', (action) => {
    if (!gameState || players.length < 2) return;

    // Basic validation: ensure the action is from the current player
    const playerIndex = players.findIndex(p => p.id === socket.id);
    if (playerIndex + 1 !== gameState.currentPlayer) {
      return socket.emit('error', { message: "It's not your turn." });
    }

    console.log(`Received action: ${action.type} from player ${gameState.currentPlayer}`);

    let newGameState = gameState;

    try {
      switch (action.type) {
        case 'trail':
          newGameState = handleTrail(gameState, action.payload.card);
          break;

        case 'drop_on_card':
          // This is a simplification for the MVP.
          // A real implementation would have more complex logic to differentiate between capture, build, etc.
          const { draggedItem, targetInfo } = action.payload;
          // For now, we'll assume any drop on a card is an attempt to capture.
          // We'll treat the target as the `selectedTableCards`.
          newGameState = handleCapture(gameState, draggedItem, [targetInfo.card]);
          break;

        default:
          console.log(`Unknown action type: ${action.type}`);
          break;
      }
    } catch (e) {
        console.error("Error processing game action:", e);
        // Optionally emit an error back to the specific player
        socket.emit('action-error', { message: e.message });
    }

    gameState = newGameState;

    // Broadcast the updated state to all players
    io.emit('game-update', gameState);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    players = players.filter(p => p.id !== socket.id);
    // Simple reset for MVP. A real implementation would handle this more gracefully.
    if (players.length < 2) {
        gameState = null;
        console.log('A player disconnected. Game reset.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});
