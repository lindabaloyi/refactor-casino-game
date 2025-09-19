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

// Game Over Section - exactly like web version
const GameOverSection = React.memo(({ winner, scoreDetails, onRestart }: { winner: number | null, scoreDetails: any, onRestart: () => void }) => {
  if (!scoreDetails) {
    return (
      <View style={styles.gameOverSection}>
        <Text style={styles.gameOverTitle}>Game Over</Text>
        <Text style={styles.gameOverText}>Calculating scores...</Text>
      </View>
    );
  }

  const renderPlayerScores = (playerIndex) => {
    const details = scoreDetails[playerIndex];
    return (
      <View key={playerIndex} style={styles.playerScoreColumn}>
        <Text style={styles.playerScoreTitle}>Player {playerIndex + 1}</Text>
        <View style={styles.pointsTally}>
          <Text style={styles.pointsLabel}>Points</Text>
          <Text style={styles.totalScore}>{details.total}</Text>
        </View>
        <View style={styles.scoreBreakdown}>
          <Text style={styles.scoreItem}>Cards ({details.cardCount}): {details.mostCards} pt</Text>
          <Text style={styles.scoreItem}>Spades ({details.spadeCount}): {details.mostSpades} pts</Text>
          <Text style={styles.scoreItem}>Aces: {details.aces} pts</Text>
          {details.bigCasino > 0 && <Text style={styles.scoreItem}>Big Casino (10♦): {details.bigCasino} pts</Text>}
          {details.littleCasino > 0 && <Text style={styles.scoreItem}>Little Casino (2♠): {details.littleCasino} pts</Text>}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.gameOverSection}>
      <Text style={styles.gameOverTitle}>Game Over</Text>
      <View style={styles.finalScoresContainer}>
        {renderPlayerScores(0)}
        {renderPlayerScores(1)}
      </View>
      <Text style={styles.winnerDeclaration}>
        {winner !== null ? `Winner: Player ${winner + 1}` : "It's a Tie!"}
      </Text>
      <TouchableOpacity
        style={styles.playAgainButton}
        onPress={onRestart}
      >
        <Text style={styles.playAgainButtonText}>Play Again</Text>
      </TouchableOpacity>
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

  // State for round transition animation
  const [showRoundTransition, setShowRoundTransition] = React.useState(false);

  // Effect to show round transition animation when round changes to 2
  React.useEffect(() => {
    if (gameState.round === 2 && !showRoundTransition) {
      setShowRoundTransition(true);
      const timer = setTimeout(() => {
        setShowRoundTransition(false);
      }, 4000); // Show animation for 4 seconds
      return () => clearTimeout(timer);
    }
  }, [gameState.round, showRoundTransition]);

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

  const handleDragEnd = useCallback((args?: any) => {
    // Handle both old format (two params) and new format (single args object)
    let draggedItem, dropPosition;
    
    if (args && typeof args === 'object' && args.draggedItem) {
      // New format: { draggedItem, dropPosition }
      draggedItem = args.draggedItem;
      dropPosition = args.dropPosition;
    } else {
      // Old format: just the dragged item
      draggedItem = args;
      dropPosition = {};
    }
    
    // Check if drop was handled by a component drop zone
    if (dropPosition && dropPosition.handled) {
      // Reset drag state only
      setDraggedCard(null);
      return;
    }
    
    // Only trail if card came from hand and was not handled by any drop zone
    if (draggedItem && draggedItem.source === 'hand') {
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

        {showRoundTransition && (
          <View style={styles.roundTransition}>
            <Text style={styles.roundTransitionTitle}>Round 2</Text>
            <Text style={styles.roundTransitionText}>Table cards carried over from Round 1</Text>
          </View>
        )}

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
    minWidth: 60,
    paddingLeft: 8,
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
  roundTransition: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -100 }, { translateY: -50 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    zIndex: 1000,
  },
  roundTransitionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  roundTransitionText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  gameOverSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 20,
    margin: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  gameOverTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
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
    marginBottom: 20,
  },
  playerScoreColumn: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  playerScoreTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  pointsTally: {
    alignItems: 'center',
    marginBottom: 15,
  },
  pointsLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 5,
  },
  totalScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  scoreBreakdown: {
    alignItems: 'flex-start',
  },
  scoreItem: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  winnerDeclaration: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 20,
    textAlign: 'center',
  },
  playAgainButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
  },
  playAgainButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default React.memo(GameBoard);