import { 
  getCardId, 
  calculateCardSum, 
  rankValue,
  updateGameState
} from '../game-logic/index.js';
import { analyzeCardStack } from '../game-logic/combo-analyzer';

/**
 * Handles dropping cards from table/captured sources onto targets
 * Extracted from useGameActions.js handleDropOnCard function
 * Manages temporary stack creation and manipulation for table cards
 */
export const handleTableCardDrop = (
  draggedItem, 
  targetInfo, 
  currentGameState, 
  showError
) => {
  const { currentPlayer, tableCards, playerCaptures } = currentGameState;
  const draggedCard = draggedItem.card;
  const draggedSource = draggedItem.source;

  let newTableCards = tableCards;
  let newPlayerCaptures = playerCaptures;
  let cardRemoved = false;

  // Step 1: Remove the dragged card from its source
  // NOTE: Opponent capture cards are removed here during staging to avoid double-removal.
  if (draggedSource === 'table') {
    const originalLength = tableCards.length;
    newTableCards = tableCards.filter(c => getCardId(c) !== getCardId(draggedCard));
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
    const targetCard = tableCards.find(c => !c.type && getCardId(c) === targetInfo.cardId);
    if (!targetCard) { 
      showError("Target card for stack not found."); 
      return currentGameState; 
    }
    if (getCardId(draggedCard) === getCardId(targetCard)) {
      return currentGameState; // Prevent self-drop
    }

    // CASINO RULE: Players can only have one temp build active at a time
    const playerAlreadyHasTempStack = newTableCards.some(
      s => s.type === 'temporary_stack' && s.owner === currentPlayer
    );
    if (playerAlreadyHasTempStack) {
      showError("You can only have one staging stack at a time.");
      return currentGameState;
    }

    // Find original index of the target card to preserve position
    const targetIndex = tableCards.findIndex(c => getCardId(c) === getCardId(targetCard));

    // Annotate cards with their source and preserve drag order
    const annotatedTarget = { ...targetCard, source: 'table' };
    const annotatedDragged = { ...draggedCard, source: draggedSource };

    // SMART COMBO DETECTION for first drop
    const initialCards = [annotatedTarget, annotatedDragged];
    const initialAnalysis = analyzeCardStack(initialCards);
    
    // Keep cards in original order - no auto-sorting
    // Player must arrange combos correctly (big→small within each combo)
    const orderedCards = [annotatedTarget, annotatedDragged];
    
    if (initialAnalysis.completeCombos.length > 0) {
      console.log(`🎯 Combo detected: ${initialAnalysis.completeCombos[0].cards.map(c => c.rank).join('+')} = ${initialAnalysis.completeCombos[0].value}`);
    }

    const newStack = {
      stackId: `temp-${Date.now()}`,
      type: 'temporary_stack',
      cards: orderedCards,
      owner: currentPlayer,
    };

    // Replace the target card with the new stack in the array that already had the dragged card removed.
    const finalTableCards = [...newTableCards];
    const insertionIndex = finalTableCards.findIndex(c => getCardId(c) === getCardId(targetCard));
    if (insertionIndex !== -1) {
      finalTableCards.splice(insertionIndex, 1, newStack);
    } else {
      finalTableCards.push(newStack); // Fallback
    }
    return { ...currentGameState, tableCards: finalTableCards, playerCaptures: newPlayerCaptures };
  }

  // A.2: Dropped on an existing temporary stack to add to it
  if (targetInfo.type === 'temporary_stack') {
    const targetStack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === targetInfo.stackId);
    if (!targetStack) { 
      showError("Target stack not found."); 
      return currentGameState; 
    }
    if (targetStack.owner !== currentPlayer) { 
      showError("You cannot add to another player's temporary stack."); 
      return currentGameState; 
    }

    // Handle if dragging another temporary stack onto this one
    if (draggedSource === 'temporary_stack') {
      const draggedStack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === draggedItem.stackId);
      if (!draggedStack) { 
        showError("Dragged stack not found."); 
        return currentGameState; 
      }

      // Simple stack merging - no real-time validation
      // Players can experiment freely, validation happens at tick button
      const proposedCombined = [...targetStack.cards, ...draggedStack.cards];

      // Combine the two temporary stacks without auto-sorting
      // Player must ensure combos are correctly arranged
      const combinedCards = proposedCombined;
      const finalAnalysis = analyzeCardStack(combinedCards);
      
      if (finalAnalysis.completeCombos.length > 0) {
        console.log(`🎯 Stack merge - Combo detected: ${finalAnalysis.completeCombos[0].cards.map(c => c.rank).join('+')} = ${finalAnalysis.completeCombos[0].value}`);
      }
      
      const newCombinedStack = {
        stackId: `temp-${Date.now()}`,
        type: 'temporary_stack',
        cards: combinedCards,
        owner: currentPlayer,
      };

      // Remove both original stacks and add the combined stack
      const finalTableCards = tableCards
        .filter(c => c.stackId !== targetStack.stackId && c.stackId !== draggedStack.stackId)
        .concat([newCombinedStack]);

      return updateGameState(currentGameState, { tableCards: finalTableCards });
    }

    const stackIndex = newTableCards.findIndex(s => s.stackId === targetStack.stackId);
    
    // Check if the new card is equal-value to the stack sum (opponent capture rule)
    const stackSum = calculateCardSum(targetStack.cards);
    const draggedValue = rankValue(draggedCard.rank);
    const isEqualValueCapture = draggedValue === stackSum && (draggedSource === 'captured' || draggedSource === 'opponentCapture');
    
    // SMART COMBO VALIDATION: Real-time analysis with combo detection
    const currentStackAnalysis = analyzeCardStack(targetStack.cards);
    const newCardToAdd = { ...draggedCard, source: draggedSource };
    
    if (isEqualValueCapture) {
      // CASINO RULE: Equal-value captured cards go on TOP (player's choice)
      // No validation needed for captures - just append
      var newCards = [...targetStack.cards, newCardToAdd];
    } else {
      // Add card to stack without real-time validation
      // Players can experiment freely, validation happens at tick button
      var newCards = [...targetStack.cards, newCardToAdd];
      
      // Optional logging for combo detection (no validation)
      const analysis = analyzeCardStack(newCards);
      if (analysis.completeCombos.length > 0) {
        console.log(`🎯 Combo detected: ${analysis.completeCombos[0].cards.map(c => c.rank).join('+')} = ${analysis.completeCombos[0].value}`);
      }
    }
    
    const newStack = { ...targetStack, cards: newCards };
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