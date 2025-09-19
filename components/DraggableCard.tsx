import React, { useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, Animated, ViewStyle } from 'react-native';
import Card from './card';
import { Card as CardType, DraggedItem } from '../types/gameTypes';

interface DropPosition {
  x: number;
  y: number;
  handled: boolean;
}

interface DropZone {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  onDrop: (draggedItem: DraggedItem) => boolean;
  stackId?: string;
}

interface DraggableCardProps {
  card: CardType;
  onDragStart?: (card: CardType) => void;
  onDragEnd?: (draggedItem: DraggedItem, dropPosition: DropPosition) => void;
  onDragMove?: (card: CardType, position: { x: number; y: number }) => void;
  disabled?: boolean;
  size?: 'normal' | 'small' | 'large';
  draggable?: boolean;
  currentPlayer?: number;
  source?: 'hand' | 'table' | 'captured' | 'opponentCapture' | 'temporary_stack';
  stackId?: string | null;
}

declare global {
  var dropZones: DropZone[] | undefined;
}

const DraggableCard: React.FC<DraggableCardProps> = ({ 
  card, 
  onDragStart, 
  onDragEnd,
  onDragMove,
  disabled = false,
  size = 'normal',
  draggable = true,
  currentPlayer = 0,
  source = 'hand',
  stackId = null
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hasStartedDrag, setHasStartedDrag] = useState<boolean>(false);
  const pan = useRef(new Animated.ValueXY()).current;
  const dragThreshold = 8; // Minimum distance to start actual drag - optimized for instant response

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => draggable && !disabled,
    onStartShouldSetPanResponderCapture: () => false, // Don't capture immediately
    onMoveShouldSetPanResponder: (event, gestureState) => {
      // Only activate drag if moved beyond threshold
      if (!draggable || disabled) return false;
      const distance = Math.sqrt(gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy);
      return distance > dragThreshold;
    },
    
    onPanResponderGrant: (event) => {
      if (disabled || !draggable) return;
      // Don't set dragging immediately - wait for actual movement
      setHasStartedDrag(false);
    },
    
    onPanResponderMove: (event, gestureState) => {
      if (disabled || !draggable) return;
      
      // Check if we've crossed the drag threshold
      const distance = Math.sqrt(gestureState.dx * gestureState.dx + gestureState.dy * gestureState.dy);
      
      if (distance > dragThreshold && !hasStartedDrag) {
        // First time crossing threshold - start the drag
        setHasStartedDrag(true);
        setIsDragging(true);
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        
        if (onDragStart) {
          onDragStart(card);
        }
      }
      
      // Only animate if we've started dragging
      if (hasStartedDrag) {
        // Use Animated.event for smooth performance
        Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        })(event, gestureState);
        
        // Only call onDragMove occasionally to avoid performance issues
        if (onDragMove && gestureState.dx % 5 === 0) {
          onDragMove(card, {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY
          });
        }
      }
    },
    
    onPanResponderRelease: (event, gestureState) => {
      if (disabled || !draggable) return;
      
      setIsDragging(false);
      setHasStartedDrag(false);
      
      // Only process drop if we actually started dragging
      if (!hasStartedDrag) {
        // Just a tap, not a drag - do nothing
        return;
      }
      
      pan.flattenOffset();
      
      const dropPosition: DropPosition = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
        handled: false
      };
      
      // Check if dropped on any registered drop zones with tolerance
      if (global.dropZones) {
        let bestZone: DropZone | null = null;
        let closestDistance = Infinity;
        
        // IMPROVED: Find the best drop zone with priority system and tolerance
        for (const zone of global.dropZones) {
          const { x, y, width, height } = zone.bounds;
          
          // Add tolerance buffer (30px on all sides for more forgiving detection)
          const tolerance = 30;
          const expandedX = x - tolerance;
          const expandedY = y - tolerance;
          const expandedWidth = width + (tolerance * 2);
          const expandedHeight = height + (tolerance * 2);
          
          if (dropPosition.x >= expandedX && dropPosition.x <= expandedX + expandedWidth &&
              dropPosition.y >= expandedY && dropPosition.y <= expandedY + expandedHeight) {
            
            // Calculate distance to center of drop zone for best match
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const distance = Math.sqrt(
              Math.pow(dropPosition.x - centerX, 2) + 
              Math.pow(dropPosition.y - centerY, 2)
            );
            
            // PRIORITY SYSTEM: Prefer smaller zones (cards) over larger zones (general areas)
            // Calculate zone area for priority - smaller areas get priority boost
            const zoneArea = width * height;
            
            // Priority score: lower is better
            // Small zones (cards) get significant priority boost vs large zones (table areas)
            const priorityScore = distance + (zoneArea > 10000 ? 1000 : 0);
            
            if (priorityScore < closestDistance) {
              closestDistance = priorityScore;
              bestZone = zone;
            }
          }
        }
        
        // Try to drop on the closest zone found
        if (bestZone) {
          const draggedItem: DraggedItem = { 
            card, 
            source, 
            player: currentPlayer, 
            stackId: stackId || undefined 
          };
          if (bestZone.onDrop(draggedItem)) {
            dropPosition.handled = true;
          }
        }
      }
      
      // Smoothly return to original position
      Animated.spring(pan, {
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }).start();
      
      if (onDragEnd) {
        const draggedItem: DraggedItem = { 
          card, 
          source, 
          player: currentPlayer, 
          stackId: stackId || undefined 
        };
        onDragEnd(draggedItem, dropPosition);
      }
    },
  });

  if (!draggable) {
    return <Card card={card} size={size} disabled={disabled} />;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        {
          transform: pan.getTranslateTransform(),
          zIndex: isDragging ? 1000 : 1,
          elevation: isDragging ? 10 : 5,
        }
      ]}
    >
      <Card card={card} size={size} disabled={disabled} />
    </Animated.View>
  );
};

export default DraggableCard;