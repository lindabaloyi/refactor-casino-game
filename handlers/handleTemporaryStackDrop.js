import { 
  getCardId, 
  updateGameState
} from '../game-logic/index.js';
import { 
  validateReinforceBuildWithStack,
  validateMergeIntoOwnBuild,
  validateReinforceOpponentBuildWithStack
} from '../game-logic/validation.js';
import { 
  handleDisbandStagingStack,
  handleReinforceBuildWithStack,
  handleMergeIntoOwnBuild,
  handleReinforceOpponentBuildWithStack
} from '../game-logic/index.js';

/**
 * Handles dropping temporary stacks onto targets
 * Extracted from useGameActions.js handleDropOnCard function
 * Manages temporary stack interactions with builds and other stacks
 */
export const handleTemporaryStackDrop = (
  draggedItem, 
  targetInfo, 
  currentGameState, 
  showError
) => {
  const { currentPlayer, tableCards } = currentGameState;

  // Handle dropping temporary stacks on builds
  if (targetInfo.type === 'build') {
    const buildToDropOn = tableCards.find(b => b.type === 'build' && b.buildId === targetInfo.buildId);
    if (!buildToDropOn) {
      showError("Target build not found on table. The build may have already been captured.");
      return currentGameState;
    }

    // Find the staging stack by stackId from the table cards
    const stagingStack = tableCards.find(s => 
      s.type === 'temporary_stack' && 
      s.stackId === draggedItem.stackId
    );
    
    if (!stagingStack) {
      showError("Staging stack not found on table.");
      return currentGameState;
    }
    
    const handCardsInStack = stagingStack.cards.filter(c => c.source === 'hand');

    if (handCardsInStack.length > 0) {
      // This is a "Reinforce" action that uses a hand card and ends the turn.
      const validation = validateReinforceBuildWithStack(stagingStack, buildToDropOn);
      if (!validation.valid) {
        showError(validation.message);
        return handleDisbandStagingStack(currentGameState, stagingStack);
      }
      return handleReinforceBuildWithStack(currentGameState, stagingStack, buildToDropOn);
    } else {
      // No hand cards in stack, so this is a staging move.
      if (buildToDropOn.owner === currentPlayer) {
        // This is a "Merge" action with only table cards that does NOT end the turn.
        const validation = validateMergeIntoOwnBuild(stagingStack, buildToDropOn, currentPlayer);
        if (!validation.valid) {
          showError(validation.message);
          return currentGameState; // Snap back on invalid merge
        }
        return handleMergeIntoOwnBuild(currentGameState, stagingStack, buildToDropOn);
      } else {
        // This is the new "Reinforce Opponent's Build" action that does NOT end the turn.
        const validation = validateReinforceOpponentBuildWithStack(stagingStack, buildToDropOn, currentPlayer);
        if (!validation.valid) {
          showError(validation.message);
          return currentGameState; // Snap back
        }
        return handleReinforceOpponentBuildWithStack(currentGameState, stagingStack, buildToDropOn);
      }
    }
  }

  // Handle dropping temporary stacks on other temporary stacks
  if (targetInfo.type === 'temporary_stack') {
    // Find both stacks
    const draggedStack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === draggedItem.stackId);
    const targetStack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === targetInfo.stackId);
    
    if (!draggedStack || !targetStack) {
      showError("Cannot find stack to combine.");
      return currentGameState;
    }

    if (targetStack.owner !== currentPlayer) {
      showError("You cannot add to another player's temporary stack.");
      return currentGameState;
    }

    // Combine the two stacks
    const combinedCards = [...targetStack.cards, ...draggedStack.cards];
    
    const newCombinedStack = {
      stackId: `temp-${Date.now()}`,
      type: 'temporary_stack',
      cards: combinedCards,
      owner: currentPlayer,
    };

    // Remove both stacks and add combined stack
    const finalTableCards = tableCards
      .filter(c => c.stackId !== targetStack.stackId && c.stackId !== draggedStack.stackId)
      .concat([newCombinedStack]);

    return updateGameState(currentGameState, { tableCards: finalTableCards });
  }

  // Handle dropping temporary stacks on loose cards
  if (targetInfo.type === 'loose') {
    // Find the staging stack by stackId from the table cards
    const stagingStack = tableCards.find(s => 
      s.type === 'temporary_stack' && 
      s.stackId === draggedItem.stackId
    );
    
    if (!stagingStack) {
      showError("Staging stack not found on table.");
      return currentGameState;
    }

    const targetCard = tableCards.find(c => !c.type && getCardId(c) === targetInfo.cardId);
    if (!targetCard) {
      showError("Target card not found on table.");
      return currentGameState;
    }

    // Create a new temporary stack by combining the existing stack with the loose card
    // The loose card goes to the bottom (beginning of cards array) as the base
    const combinedCards = [{ ...targetCard, source: 'table' }, ...stagingStack.cards];
    
    const newStack = {
      stackId: `temp-${Date.now()}`,
      type: 'temporary_stack',
      cards: combinedCards,
      owner: currentPlayer,
    };

    // Remove the original stack and loose card, add the new combined stack
    const newTableCards = tableCards
      .filter(c => c.stackId !== stagingStack.stackId && getCardId(c) !== getCardId(targetCard))
      .concat([newStack]);

    return updateGameState(currentGameState, { tableCards: newTableCards });
  }

  // Fallback for unhandled temporary stack drops
  showError("Temporary stack drop not handled properly. This should not occur.");
  return currentGameState;
};