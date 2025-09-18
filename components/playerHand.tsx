import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import DraggableCard from './DraggableCard';
import { CardType } from './card';

interface PlayerHandProps {
  player: number;
  cards: CardType[];
  isCurrent: boolean;
  onDragStart?: (card: CardType) => void;
  onDragEnd?: (draggedItem: any, dropPosition: any) => void;
  onDragMove?: (card: CardType, position: { x: number; y: number }) => void;
  currentPlayer: number;
}

const PlayerHand = memo<PlayerHandProps>(({ 
  player, 
  cards, 
  isCurrent, 
  onDragStart,
  onDragEnd,
  onDragMove,
  currentPlayer
}) => {
  return (
    <View style={styles.playerHand}>
      {cards.map((card, index) => {
        return (
          <DraggableCard
            key={`${card.rank}-${card.suit}`}
            card={card}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragMove={onDragMove}
            disabled={!isCurrent}
            draggable={isCurrent}
            size="normal"
            currentPlayer={currentPlayer}
            source="hand"
          />
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  playerHand: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
});

export default PlayerHand;
export type { PlayerHandProps };