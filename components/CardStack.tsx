import React, { memo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Card from './card';
import DraggableCard from './DraggableCard';

type CardType = {
  rank: string;
  suit: string;
};

type CardStackProps = {
  stackId: string;
  cards: CardType[];
  onDropStack?: (draggedItem: any) => void;
  buildValue?: number;
  isBuild?: boolean;
  draggable?: boolean;
  onDragStart?: (card: any) => void;
  onDragEnd?: (card: any, position: any) => void;
  onDragMove?: (card: any, position: any) => void;
  currentPlayer?: number;
  dragSource?: string;
};

const CardStack: React.FC<CardStackProps> = memo(({ 
  stackId, 
  cards, 
  onDropStack, 
  buildValue, 
  isBuild = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragMove,
  currentPlayer = 0,
  dragSource = 'table'
}) => {
  // Show only the top card for visual simplicity on mobile
  const topCard = cards[cards.length - 1];
  const cardCount = cards.length;
  const stackRef = useRef<View>(null);

  // Register and cleanup drop zone
  useEffect(() => {
    // Initialize global registry
    if (!(global as any).dropZones) (global as any).dropZones = [];
    
    // Cleanup function to remove this zone
    return () => {
      if ((global as any).dropZones) {
        (global as any).dropZones = (global as any).dropZones.filter((zone: any) => zone.stackId !== stackId);
      }
    };
  }, [stackId]);

  const handleLayout = (event: any) => {
    if (onDropStack) {
      const { x, y, width, height } = event.nativeEvent.layout;
      
      // Get absolute position
      stackRef.current?.measureInWindow((pageX, pageY) => {
        if (!(global as any).dropZones) (global as any).dropZones = [];
        
        const existingIndex = (global as any).dropZones.findIndex((zone: any) => zone.stackId === stackId);
        const dropZone = {
          stackId,
          // Make drop zones 20% larger for more forgiving detection
          bounds: { 
            x: pageX - (width * 0.1), 
            y: pageY - (height * 0.1), 
            width: width * 1.2, 
            height: height * 1.2 
          },
          onDrop: (draggedItem: any) => {
            onDropStack(draggedItem);
            return true; // Mark as handled
          }
        };
        
        if (existingIndex >= 0) {
          (global as any).dropZones[existingIndex] = dropZone;
        } else {
          (global as any).dropZones.push(dropZone);
        }
      });
    }
  };

  const handlePress = () => {
    if (onDropStack) {
      // Simulate a drop action for mobile touch interface
      onDropStack({ source: 'touch', stackId });
    }
  };

  return (
    <TouchableOpacity 
      ref={stackRef}
      style={styles.stackContainer}
      onPress={draggable ? undefined : handlePress}
      onLayout={handleLayout}
      activeOpacity={draggable ? 1.0 : 0.7}
      disabled={draggable}
    >
      {topCard && (
        draggable ? (
          <DraggableCard
            card={topCard}
            size="normal"
            draggable={draggable}
            disabled={false}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragMove={onDragMove}
            currentPlayer={currentPlayer}
            source={dragSource}
            stackId={stackId}
          />
        ) : (
          <Card
            card={topCard}
            size="normal"
            disabled={false}
          />
        )
      )}
      
      {/* Stack indicators */}
      {cardCount > 1 && (
        <View style={styles.stackIndicator}>
          <Text style={styles.stackCount}>{cardCount}+</Text>
        </View>
      )}
      
      {/* Build value indicator */}
      {isBuild && buildValue && (
        <View style={styles.buildValueIndicator}>
          <Text style={styles.buildValue}>{buildValue}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  stackContainer: {
    position: 'relative',
    margin: 4,
  },
  stackIndicator: {
    position: 'absolute',
    bottom: -5,  // 🔄 SWAPPED: Move card counter to bottom-left (closer to card)
    left: -5,
    backgroundColor: '#FF5722',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 1,   // 🎯 OVERLAP: Always appear on top of cards like accept/cancel buttons
  },
  stackCount: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  buildValueIndicator: {
    position: 'absolute',
    top: -5,     // 🔄 SWAPPED: Move build value to top-right
    right: -5,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  buildValue: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default CardStack;