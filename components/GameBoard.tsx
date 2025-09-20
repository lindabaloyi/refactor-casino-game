import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert,
  TouchableOpacity 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import PlayerHand from './playerHand';
import TableCards from './TableCards';
import CapturedCards from './CapturedCards';
import ActionModal, { ModalInfoType } from './actionModal';
import ErrorModal from './ErrorModal';
import BurgerMenu from './BurgerMenu';

// Import the original game logic hook
import { useGameActions } from './useGameActions';

// Status Section Component - exactly like web version
const StatusSection = React.memo(({ round, currentPlayer }: { round: number, currentPlayer: number }) => {
  const getPlayerColor = (player: number) => {
    return player === 0 ? '#FF5722' : '#2196F3';
  };

  return (
    <View style={styles.statusSection}>
      <View style={styles.statusContent}>
        <Text style={styles.statusText}>Round: {round}</Text>
        <View style={[styles.playerTurnTag, { backgroundColor: getPlayerColor(currentPlayer) }]}>
          <Text style={styles.playerTurnText}>P{currentPlayer + 1}</Text>
        </View>
      </View>
    </View>
  );
});

// Opponent Captured Cards Section - Only opponent, minimal styling
const OpponentCapturedSection = React.memo(({ playerCaptures, currentPlayer, onCardPress = () => {}, onDragStart, onDragEnd, onDragMove }: { playerCaptures: any[], currentPlayer: number, onCardPress?: (card: any, source: string) => void, onDragStart: (card: any) => void, onDragEnd: (card: any, position: any) => void, onDragMove: (card: any, position: any) => void }) => {
  const opponentIndex = 1 - currentPlayer;
  const capturedGroups = playerCaptures[opponentIndex] || [];
  const allCapturedCards = capturedGroups.flat();
  const hasCards = allCapturedCards.length > 0;

  return (
    <View style={styles.opponentCapturedList}>
      <CapturedCards
        captures={capturedGroups}
        playerIndex={opponentIndex}
        hasCards={hasCards}
        topCard={hasCards ? allCapturedCards[allCapturedCards.length - 1] : null}
        isOpponent={true}
        onCardPress={onCardPress}
        isMinimal={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        currentPlayer={currentPlayer}
      />
    </View>
  );
});

// Active Player Captured Cards - Next to player hand
const PlayerCapturedSection = React.memo(({ playerCaptures, currentPlayer, onCardPress = () => {} }: { playerCaptures: any[], currentPlayer: number, onCardPress?: (card: any, source: string) => void }) => {
  const capturedGroups = playerCaptures[currentPlayer] || [];
  const allCapturedCards = capturedGroups.flat();
  const hasCards = allCapturedCards.length > 0;

  return (
    <View style={styles.playerCapturedArea}>
      <CapturedCards
        captures={capturedGroups}
        playerIndex={currentPlayer}
        hasCards={hasCards}
        topCard={hasCards ? allCapturedCards[allCapturedCards.length - 1] : null}
        isOpponent={false}
        onCardPress={onCardPress}
        isMinimal={false}
      />
    </View>
  );
});

// Table Cards Section - exactly like web version
const TableCardsSection = React.memo(({
  tableCards,
  onDropOnCard,
  currentPlayer,
  onCancelStack,
  onConfirmStack,
  onDragStart,
  onDragEnd,
  onDragMove,
  isDragging = false
}: { tableCards: any[], onDropOnCard: (draggedItem: any, targetInfo: any) => void, currentPlayer: number, onCancelStack: (stack: any) => void, onConfirmStack: (stack: any) => void, onCardPress?: (card: any, source: string) => void, onDragStart: (card: any) => void, onDragEnd: (args?: any) => void, onDragMove: (args?: any) => void, isDragging: boolean }) => (
  <View style={styles.tableCardsSection}>
    <TableCards
      cards={tableCards}
      onDropOnCard={onDropOnCard}
      currentPlayer={currentPlayer}
      onCancelStack={onCancelStack}
      onConfirmStack={onConfirmStack}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
      isDragging={isDragging}
    />
  </View>
));

// Player Hands Section - Show active player hand with their captures on the right
const PlayerHandsSection = React.memo(({ playerHands, currentPlayer, onDragStart, onDragEnd, onDragMove, playerCaptures, tableCards, onCardPress = () => {} }: { playerHands: any[], currentPlayer: number, onDragStart: (card: any) => void, onDragEnd: (card: any, position: any) => void, onDragMove: (card: any, position: any) => void, playerCaptures: any[], tableCards: any[], onCardPress?: (card: any, source: string) => void }) => {
  const getPlayerColor = (player: number) => {
    return player === 0 ? '#FF5722' : '#2196F3';
  };

  return (
    <View style={styles.playerHandsSection}>
      <View style={styles.playerHandArea}>
        <View style={styles.playerHandHeader}>
          <Text style={styles.playerHandTitle}>Your Hand</Text>
          <View style={[styles.playerTurnBadge, { backgroundColor: getPlayerColor(currentPlayer) }]}>
            <Text style={styles.playerTurnBadgeText}>P{currentPlayer + 1}</Text>
          </View>
        </View>
        <PlayerHand
          player={currentPlayer}
          cards={playerHands[currentPlayer]}
          isCurrent={true}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragMove={onDragMove}
          currentPlayer={currentPlayer}
          tableCards={tableCards}
        />
      </View>
      <PlayerCapturedSection
        playerCaptures={playerCaptures}
        currentPlayer={currentPlayer}
        onCardPress={onCardPress}
      />
    </View>
  );
});

// Game Over Section - Casino-styled scoring UI
const GameOverSection = React.memo(({ winner, scoreDetails, onRestart }: { winner: number | null, scoreDetails: any, onRestart: () => void }) => {
  const renderPlayerScores = (playerIndex) => {
    const details = scoreDetails[playerIndex];
    return (
      <View key={playerIndex} style={styles.playerScoreColumn}>
        <Text style={styles.playerScoreTitle}>🎰 Player {playerIndex + 1} 🎰</Text>
        <View style={styles.pointsTally}>
          <Text style={styles.pointsLabel}>Total Points</Text>
          <Text style={styles.totalScore}>{details.total}</Text>
        </View>
        <View style={styles.scoreBreakdown}>
          <Text style={styles.scoreItem}>🃏 Cards ({details.cardCount}): {details.mostCards} pts</Text>
          <Text style={styles.scoreItem}>♠️ Spades ({details.spadeCount}): {details.mostSpades} pts</Text>
          <Text style={styles.scoreItem}>🃏 Aces: {details.aces} pts</Text>
          {details.bigCasino > 0 && <Text style={styles.scoreItem}>💎 Big Casino (10♦): {details.bigCasino} pts</Text>}
          {details.littleCasino > 0 && <Text style={styles.scoreItem}>🎯 Little Casino (2♠): {details.littleCasino} pts</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.gameOverSection}>
      <Text style={styles.gameOverTitle}>🎰 GAME OVER 🎰</Text>
      <Text style={styles.gameOverSubtitle}>Final Scores</Text>
      <View style={styles.finalScoresContainer}>
        {renderPlayerScores(0)}
        {renderPlayerScores(1)}
      </View>
      <View style={styles.winnerContainer}>
        <Text style={styles.winnerDeclaration}>
          {winner !== null ? `🏆 Winner: Player ${winner + 1} 🏆` : "🤝 It's a Tie! 🤝"}
        </Text>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.playAgainButton}
          onPress={onRestart}
          activeOpacity={0.8}
        >
          <Text style={styles.playAgainButtonText}>🎮 Play Again 🎮</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.newGameButton}
          onPress={onRestart}
          activeOpacity={0.8}
        >
          <Text style={styles.newGameButtonText}>🎲 New Game 🎲</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

function GameBoard({ onRestart }: { onRestart: () => void }) {
  const {
    gameState,
    modalInfo,
    errorModal,
    handleTrailCard,
    handleDropOnCard,
    handleModalAction,
    setModalInfo,
    handleStageOpponentCardAction,
    handleCancelStagingStackAction,
    handleConfirmStagingStackAction,
    closeErrorModal,
  } = useGameActions();

  // Mobile-specific state for drag interactions
  const [draggedCard, setDraggedCard] = useState(null);
  
  // Track dragging state for UI optimization
  const isDragging = !!draggedCard;

  // Removed roundTransition state and effect - using ErrorModal for round transitions instead

  // Keyboard navigation handler (adapted for mobile)
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape' && modalInfo) {
      setModalInfo(null);
    }
  }, [modalInfo, setModalInfo]);

  // Drag handlers - restore original drag mechanics
  const handleDragStart = useCallback((card) => {
    setDraggedCard(card);
  }, []);

  const handleDragMove = useCallback((args?: any) => {
    // TODO: Add drop zone highlighting logic if needed
    // args could contain { card, position } or just be the card
  }, []);

  const handleDragEnd = useCallback((draggedItem?: any, dropPosition?: any) => {
    // Handle the two-parameter format from DraggableCard: onDragEnd(draggedItem, dropPosition)
    // This matches the working code format
    
    console.log(`🎯 GAME BOARD: handleDragEnd called with dropPosition.handled=${dropPosition?.handled}`);
    
    // Check if drop was handled by a component drop zone
    if (dropPosition && dropPosition.handled) {
      console.log(`✅ GAME BOARD: Drop was handled, skipping trail`);
      // Reset drag state only
      setDraggedCard(null);
      return;
    }
    
    // Only trail if card came from hand and was not handled by any drop zone
    if (draggedItem && draggedItem.source === 'hand') {
      console.log(`🎯 GAME BOARD: Drop not handled, trailing card ${draggedItem.card?.rank}`);
      handleTrailCard(draggedItem.card, draggedItem.player, dropPosition);
    }
    
    // Reset drag state
    setDraggedCard(null);
  }, [handleTrailCard]);

  // Handle ending the game
  const handleEndGame = useCallback(() => {
    // Use the modal system to trigger end game action
    const endGameAction = {
      type: 'end_game',
      label: 'End Game',
      payload: {
        draggedItem: { source: 'hand' as const, player: 0 }
      }
    };
    handleModalAction(endGameAction);
  }, [handleModalAction]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />
      
      {/* Burger Menu */}
      <BurgerMenu onRestart={onRestart} onEndGame={handleEndGame} />
      
      <View style={styles.gameContainer}>
        <StatusSection round={gameState.round} currentPlayer={gameState.currentPlayer} />
        
        <View style={styles.mainGameArea}>
          <TableCardsSection
            tableCards={gameState.tableCards}
            onDropOnCard={handleDropOnCard}
            currentPlayer={gameState.currentPlayer}
            onCancelStack={handleCancelStagingStackAction}
            onConfirmStack={handleConfirmStagingStackAction}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
            isDragging={isDragging}
          />
          
          <OpponentCapturedSection 
            playerCaptures={gameState.playerCaptures} 
            currentPlayer={gameState.currentPlayer}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragMove={handleDragMove}
          />
        </View>
        
        <PlayerHandsSection
          playerHands={gameState.playerHands}
          currentPlayer={gameState.currentPlayer}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragMove={handleDragMove}
          playerCaptures={gameState.playerCaptures}
          tableCards={gameState.tableCards}
        />

        {/* Drag indicator */}

        {modalInfo && (
          <ActionModal
            modalInfo={modalInfo as ModalInfoType}
            onAction={handleModalAction}
            onCancel={() => setModalInfo(null)}
          />
        )}

        {/* Removed roundTransition overlay - using ErrorModal for round transitions instead */}

        {gameState.gameOver && (
          <GameOverSection
            winner={gameState.winner}
            scoreDetails={gameState.scoreDetails}
            onRestart={onRestart}
          />
        )}

        <ErrorModal
          visible={errorModal.visible}
          title={errorModal.title}
          message={errorModal.message}
          onClose={closeErrorModal}
          autoDismissMs={errorModal.autoDismissMs}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B5E20',
  },
  gameContainer: {
    flex: 1,
  },
  statusSection: {
    padding: 8,
    alignItems: 'center',
    backgroundColor: '#2E7D32',
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginRight: 12,
  },
  playerTurnTag: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  playerTurnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  mainGameArea: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tableCardsSection: {
    flex: 3,
    paddingRight: 8,
  },
  opponentCapturedList: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 80,
    padding: 4,
  },
  playerHandsSection: {
    flexDirection: 'row',
    paddingVertical: 2,
    alignItems: 'center',
  },
  playerHandArea: {
    flex: 1,
  },
  playerHandHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#4CAF50',
  },
  playerHandTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playerTurnBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  playerTurnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  playerCapturedArea: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
    marginLeft: 8,
    marginRight: 4,
  },
  playerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#666',
    textAlign: 'center',
  },
  selectedCardIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#37474F',
    padding: 15,
    margin: 10,
    borderRadius: 10,
  },
  selectedCardText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearSelectionButton: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearSelectionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  // Removed roundTransition styles - using ErrorModal for round transitions instead
  gameOverSection: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1B5E20', // Casino green background
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  gameOverTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700', // Gold text
    textAlign: 'center',
    marginBottom: 10,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  gameOverSubtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 30,
    opacity: 0.9,
  },
  gameOverText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  finalScoresContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  playerScoreColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 15,
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    padding: 15,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  playerScoreTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 15,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  pointsTally: {
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#1B5E20',
    borderRadius: 10,
    padding: 10,
    minWidth: 80,
  },
  pointsLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 5,
    opacity: 0.8,
  },
  totalScore: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD700',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  scoreBreakdown: {
    alignItems: 'flex-start',
    width: '100%',
  },
  scoreItem: {
    fontSize: 11,
    color: '#FFFFFF',
    marginBottom: 4,
    opacity: 0.9,
    textAlign: 'center',
  },
  winnerContainer: {
    backgroundColor: '#2E7D32',
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#FFD700',
    padding: 15,
    marginBottom: 30,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  winnerDeclaration: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 20,
  },
  playAgainButton: {
    backgroundColor: '#FFD700',
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#B8860B',
    paddingHorizontal: 30,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    minWidth: 140,
  },
  playAgainButtonText: {
    color: '#2E7D32',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  newGameButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#B8860B',
    paddingHorizontal: 30,
    paddingVertical: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    minWidth: 140,
  },
  newGameButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});

export default React.memo(GameBoard);