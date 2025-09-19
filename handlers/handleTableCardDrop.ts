
import { 
  getCardId, 
  calculateCardSum, 
  rankValue,
  updateGameState
} from '../game-logic/index.js';
import { analyzeCardStack } from '../game-logic/combo-analyzer';
import {
  DraggedItem,
  TargetInfo,
  GameState,
  Card,
  TemporaryStack,
  TableEntity
} from '../types/gameTypes';

/**
 * Handles dropping cards from table/captured sources onto targets
 * Extracted from useGameActions.js handleDropOnCard function
 * Manages temporary stack creation and manipulation for table cards
 * Now fully typed for TypeScript safety
 */
export const handleTableCardDrop = (
  draggedItem: DraggedItem, 
  targetInfo: TargetInfo, 
  currentGameState: GameState, 
  showError: (message: string) => void
): GameState => {
  const { currentPlayer, tableCards, playerCaptures } = currentGameState;
  const draggedCard = draggedItem.card;
  const draggedSource = draggedItem.source;

  if (!draggedCard) {
    showError("No card found in dragged item.");
    return currentGameState;
  }

  let newTableCards = tableCards;
  let newPlayerCaptures = playerCaptures;
  let cardRemoved = false;

  // Step 1: Remove the dragged card from its source
  // NOTE: Opponent capture cards are removed here during staging to avoid double-removal.
  if (draggedSource === 'table') {
    const originalLength = tableCards.length;
    newTableCards = tableCards.filter(c => getCardId(c as Card) !== getCardId(draggedCard));
    cardRemoved = newTableCards.length < originalLength;
    
    if (!cardRemoved) {
      showError("Could not find the dragged card's source to move it.");
      return currentGameState;
    }
  } else if (draggedSource === 'opponentCapture' || draggedSource === 'captured') {
    // For opponent capture cards, remove them here to avoid double-removal
    const opponentIndex = 1 - currentPlayer;
    const opponentCaps = [...playerCaptures[opponentIndex]];
    if (opponentCaps.length > 0) {
      const lastGroup = [...opponentCaps[opponentCaps.length - 1]];
      if (lastGroup.length > 0) {
        lastGroup.pop(); // Remove the top card
        if (lastGroup.length > 0) {
          opponentCaps[opponentCaps.length - 1] = lastGroup;
        } else {
          opponentCaps.pop(); // Remove empty group
        }
        const updatedCaptures = [...playerCaptures];
        updatedCaptures[opponentIndex] = opponentCaps;
        newPlayerCaptures = updatedCaptures;
        cardRemoved = true;
      }
    }
    if (!cardRemoved) {
      showError("Could not find the dragged card in opponent's capture pile.");
      return currentGameState;
    }
  } else {
    showError("Unknown card source for temp stack operation.");
    return currentGameState;
  }

  // Step 2: Add the card to the target on the table
  // A.1: Dropped on a loose card to create a new stack
  if (targetInfo.type === 'loose') {
    const targetCard = tableCards.find(c => !(c as any).type && getCardId(c as Card) === targetInfo.cardId) as Card;
    if (!targetCard) { 
      showError("Target card for stack not found."); 
      return currentGameState; 
    }
    if (getCardId(draggedCard) === getCardId(targetCard)) {
      return currentGameState; // Prevent self-drop
    }

    // CASINO RULE: Players can only have one temp build active at a time
    const playerAlreadyHasTempStack = newTableCards.some(
      s => (s as TemporaryStack).type === 'temporary_stack' && (s as TemporaryStack).owner === currentPlayer
    );
    if (playerAlreadyHasTempStack) {
      showError("You can only have one staging stack at a time.");
      return currentGameState;
    }

    // Find original index of the target card to preserve position
    const targetIndex = tableCards.findIndex(c => getCardId(c as Card) === getCardId(targetCard));

    // Annotate cards with their source and preserve drag order
    const annotatedTarget: Card = { ...targetCard, source: 'table' };
    const annotatedDragged: Card = { ...draggedCard, source: draggedSource };

    // SMART COMBO DETECTION for first drop
    const initialCards = [annotatedTarget, annotatedDragged];
    const initialAnalysis = analyzeCardStack(initialCards);
    
    // Keep cards in original order - no auto-sorting
    // Player must arrange combos correctly (big→small within each combo)
    const orderedCards = [annotatedTarget, annotatedDragged];
    
    if (initialAnalysis.completeCombos.length > 0) {
      console.log(`🎯 Combo detected: ${initialAnalysis.completeCombos[0].cards.map(c => c.rank).join('+')} = ${initialAnalysis.completeCombos[0].value}`);
    }

    const newStack: TemporaryStack = {
      stackId: `temp-${Date.now()}`,
      type: 'temporary_stack',
      cards: orderedCards,
      owner: currentPlayer,
    };

    // Replace the target card with the new stack in the array that already had the dragged card removed.
    const finalTableCards = [...newTableCards];
    const insertionIndex = finalTableCards.findIndex(c => getCardId(c as Card) === getCardId(targetCard));
    if (insertionIndex !== -1) {
      finalTableCards.splice(insertionIndex, 1, newStack);
    } else {
      finalTableCards.push(newStack); // Fallback
    }
    return { ...currentGameState, tableCards: finalTableCards, playerCaptures: newPlayerCaptures };
  }

  // A.2: Dropped on an existing temporary stack to add to it
  if (targetInfo.type === 'temporary_stack') {
    const targetStack = tableCards.find(s => 
      (s as TemporaryStack).type === 'temporary_stack' && 
      (s as TemporaryStack).stackId === targetInfo.stackId
    ) as TemporaryStack;
    
    if (!targetStack) { 
      showError("Target stack not found."); 
      return currentGameState; 
    }
    if (targetStack.owner !== currentPlayer) { 
      showError("You cannot add to another player's temporary stack."); 
      return currentGameState; 
    }


    const stackIndex = newTableCards.findIndex(s =>
      (s as TemporaryStack).stackId === targetStack.stackId
    );
    
    // Check if the new card is equal-value to the stack sum (opponent capture rule)
    const stackSum = calculateCardSum(targetStack.cards);
    const draggedValue = rankValue(draggedCard.rank);
    const isEqualValueCapture = draggedValue === stackSum && (draggedSource === 'captured' || draggedSource === 'opponentCapture');
    
    // SMART COMBO VALIDATION: Real-time analysis with combo detection
    const currentStackAnalysis = analyzeCardStack(targetStack.cards);
    const newCardToAdd: Card = { ...draggedCard, source: draggedSource };
    
    let newCards: Card[];
    if (isEqualValueCapture) {
      // CASINO RULE: Equal-value captured cards go on TOP (player's choice)
      // No validation needed for captures - just append
      newCards = [...targetStack.cards, newCardToAdd];
    } else {
      // Add card to stack without real-time validation
      // Players can experiment freely, validation happens at tick button
      newCards = [...targetStack.cards, newCardToAdd];
      
      // Optional logging for combo detection (no validation)
      const analysis = analyzeCardStack(newCards);
      if (analysis.completeCombos.length > 0) {
        console.log(`🎯 Combo detected: ${analysis.completeCombos[0].cards.map(c => c.rank).join('+')} = ${analysis.completeCombos[0].value}`);
      }
    }
    
    const newStack: TemporaryStack = { ...targetStack, cards: newCards };
    const finalTableCards = [...newTableCards];
    if (stackIndex !== -1) {
      finalTableCards[stackIndex] = newStack;
    } else {
      // Fallback
      finalTableCards.push(newStack);
    }
    return { ...currentGameState, tableCards: finalTableCards, playerCaptures: newPlayerCaptures };
  }

  showError("Invalid move: Cards can only be stacked on loose cards or other temporary stacks.");
  return currentGameState;
};