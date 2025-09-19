
import { 
  getCardId, 
  calculateCardSum, 
  rankValue,
  updateGameState,
  handleCapture,
  handleAddToStagingStack,
  handleCreateStagingStack
} from '../game-logic/index.js';
import { 
  validateTemporaryStackBuild,
  validateAddToOpponentBuild,
  validateAddToOwnBuild,
  validateExtendToMerge
} from '../game-logic/validation.js';
import { canPartitionIntoSums } from '../game-logic/index.js';

/**
 * Handles dropping cards from hand onto targets
 * Extracted from useGameActions.js handleDropOnCard function
 * Manages hand card interactions with temporary stacks, loose cards, and builds
 */
export const handleHandCardDrop = (
  draggedItem, 
  targetInfo, 
  currentGameState, 
  showError, 
  setModalInfo, 
  executeAction,
  importedCreateActionOption,
  importedGeneratePossibleActions
) => {
  const { currentPlayer, playerHands, tableCards, playerCaptures } = currentGameState;
  const draggedCard = draggedItem.card;

  // B.1: Dropped on a temporary stack
  if (targetInfo.type === 'temporary_stack') {
    const stack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === targetInfo.stackId);
    if (!stack) { 
      showError("Stack not found."); 
      return currentGameState; 
    }
    if (stack.owner !== currentPlayer) { 
      showError("You can only interact with your own temporary stacks."); 
      return currentGameState; 
    }

    const actions = [];
    const playerHand = playerHands[currentPlayer];

    // --- Possibility 1: Direct Capture from Temporary Stack ---
    const sumOfStack = calculateCardSum(stack.cards);
    const captureValue = rankValue(draggedCard.rank);

    // Direct capture: if hand card value equals stack sum, perform immediate capture
    if (captureValue === sumOfStack) {
      // Immediately execute capture without going through action selection
      console.log(`Direct capture: ${draggedCard.rank} captures temp stack (sum=${sumOfStack})`);
      return handleCapture(currentGameState, draggedItem, [stack]);
    } 
    
    // Complex capture: if hand card can partition the stack  
    if (sumOfStack % captureValue === 0 && canPartitionIntoSums(stack.cards, captureValue)) {
      actions.push(importedCreateActionOption('capture', `Capture for ${captureValue}`, { draggedItem, targetCard: stack }));
    }

    // --- Possibility 2: Create a permanent build ---
    const buildValidation = validateTemporaryStackBuild(stack, draggedCard, playerHand, tableCards, currentPlayer);
    if (buildValidation.valid) {
      actions.push(importedCreateActionOption('createBuildFromStack', `Build ${buildValidation.newValue}`, { draggedItem, stackToBuildFrom: stack }));
    }

    // --- Decision Logic ---
    if (actions.length === 0) {
      // If no final move is possible, assume the player wants to add the card to the stack.
      
      // Allow adding cards to temp stack without validation during creation
      // Validation will happen at finalization when player clicks tick

      return handleAddToStagingStack(currentGameState, draggedCard, stack);
    } else if (actions.length === 1) {
      return executeAction(currentGameState, actions[0]);
    } else {
      setModalInfo({ title: 'Choose Your Action', message: `What would you like to do with this stack?`, actions: actions });
      return currentGameState;
    }
  }

  // B.2: Dropped on a loose card
  if (targetInfo.type === 'loose') {
    const playerHand = playerHands[currentPlayer];

    // Try to find target card using cardId first (more reliable), then fallback to rank/suit
    let targetCard = null;
    if (targetInfo.cardId) {
      targetCard = tableCards.find(c => !c.type && getCardId(c) === targetInfo.cardId);
    }
    if (!targetCard) {
      // Fallback to rank/suit matching
      targetCard = tableCards.find(c => !c.type && c.rank === targetInfo.rank && c.suit === targetInfo.suit);
    }

    if (!targetCard) {
      showError("Target card not found on table.");
      return currentGameState;
    }

    // --- Handle dropping a temporary stack onto a loose card ---
    if (draggedItem.source === 'temporary_stack') {
      // Find the staging stack by stackId from the table cards
      const stagingStack = tableCards.find(s => 
        s.type === 'temporary_stack' && 
        s.stackId === draggedItem.stackId
      );
      
      if (!stagingStack) {
        showError("Staging stack not found on table.");
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

    // Generate possible actions to help user choose
    const actions = importedGeneratePossibleActions(draggedItem, targetCard, playerHands[currentPlayer], tableCards, playerCaptures, currentPlayer);
    
    // --- TEMP BUILD DECISION LOGIC ---
    // ALWAYS create temp builds for ALL loose card drops to allow build augmentation
    // Players confirm all staged actions with the tick button for maximum strategic control
    // This includes direct captures, builds, and combinations - everything gets staged first
    
    // CASINO RULE: Players can only have one temp build active at a time
    const playerAlreadyHasTempStack = tableCards.some(
      s => s.type === 'temporary_stack' && s.owner === currentPlayer
    );
    if (playerAlreadyHasTempStack) {
      showError("You can only have one staging stack at a time.");
      return currentGameState;
    }
    
    return handleCreateStagingStack(currentGameState, draggedCard, targetCard);
  }

  // B.3: Dropped on a build
  if (targetInfo.type === 'build') {
    const buildToDropOn = tableCards.find(b => b.type === 'build' && b.buildId === targetInfo.buildId);
    if (!buildToDropOn) {
      showError("Target build not found on table. The build may have already been captured.");
      return currentGameState;
    }

    const playerHand = playerHands[currentPlayer];
    const actions = [];

    // Possibility 1: Capture the build
    if (rankValue(draggedCard.rank) === buildToDropOn.value) {
      actions.push(importedCreateActionOption(
        'capture', `Capture Build (${buildToDropOn.value})`,
        { draggedItem, targetCard: buildToDropOn }
      ));
    }

    // Possibility 2: Extend an opponent's build
    if (buildToDropOn.owner !== currentPlayer) {
      const playerOwnsBuild = tableCards.find(c => c.type === 'build' && c.owner === currentPlayer);

      if (playerOwnsBuild) {
        // Player has a build, so this is a potential "Extend-to-Merge"
        const validation = validateExtendToMerge(playerOwnsBuild, buildToDropOn, draggedCard);
        if (validation.valid) {
          actions.push(importedCreateActionOption(
            'extendToMerge',
            `Merge into your build of ${playerOwnsBuild.value}`,
            { draggedItem, opponentBuild: buildToDropOn, ownBuild: playerOwnsBuild }
          ));
        }
      } else {
        // Standard "Add to Opponent Build"
        const validation = validateAddToOpponentBuild(buildToDropOn, draggedCard, playerHand, tableCards, currentPlayer);
        if (validation.valid) {
          const newBuildValue = buildToDropOn.value + rankValue(draggedCard.rank);
          actions.push(importedCreateActionOption('addToOpponentBuild', `Extend to ${newBuildValue}`, { draggedItem, buildToAddTo: buildToDropOn }));
        }
      }
    }

    // Possibility 3: Add to your own build
    if (buildToDropOn.owner === currentPlayer) {
      const validation = validateAddToOwnBuild(buildToDropOn, draggedCard, playerHand);
      if (validation.valid) {
        actions.push(importedCreateActionOption(
          'addToOwnBuild', `Add to Build (${validation.newValue})`,
          { draggedItem, buildToAddTo: buildToDropOn }
        ));
      }
    }

    // --- Decision Logic ---
    if (actions.length === 0) {
      if (buildToDropOn.owner === currentPlayer) {
        // Try to get a more specific error from validation
        const validation = validateAddToOwnBuild(buildToDropOn, draggedCard, playerHand);
        showError(validation.message || "You cannot add this card to your own build.");
      } else {
        const validation = validateAddToOpponentBuild(buildToDropOn, draggedCard, playerHand, tableCards, currentPlayer);
        showError(validation.message || `Invalid move on build of ${buildToDropOn.value}.`);
      }
      return currentGameState;
    } else if (actions.length === 1) {
      return executeAction(currentGameState, actions[0]);
    } else {
      setModalInfo({
        title: 'Choose Your Action',
        message: `What would you like to do with your ${draggedCard.rank}?`,
        actions: actions,
      });
      return currentGameState;
    }
  }

  // Fallback - should not reach here for hand cards
  showError("Invalid target for hand card drop.");
  return currentGameState;
};