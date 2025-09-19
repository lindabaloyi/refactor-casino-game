import { useState, useCallback, useEffect } from 'react';
import { getErrorInfo } from '../utils/errorMapping';
import { hasAnyContact } from '../utils/simpleContactDetection';
import { useNotifications as importedUseNotifications } from '../hooks/useNotifications';
import { useModalManager } from '../hooks/useModalManager';
import {
  createActionOption as importedCreateActionOption,
  canCreateBuild as importedCanCreateBuild,
  generatePossibleActions as importedGeneratePossibleActions
} from '../utils/gameActionHelpers';
import {
  initializeGame,
  updateGameState,
  handleBuild,
  handleCapture,
  handleTrail,
  handleBaseBuild,
  handleAddToOpponentBuild,
  startNextRound,
  handleSweep,
  calculateScores,
  endGame,
  handleAddToOwnBuild,
  handleCreateBuildFromStack,
  handleCreateStagingStack,
  handleReinforceBuildWithStack,
  handleAddToStagingStack,
  handleDisbandStagingStack,
  handleCancelStagingStack,
  handleMergeIntoOwnBuild,
  handleStageOpponentCard,
  handleExtendToMerge,
  handleReinforceOpponentBuildWithStack,
  handleFinalizeStagingStack,
  handleCreateBuildWithValue,
  handleStageSingleCardFromHand,
  handleFinalizeTrail
} from '../game-logic/index.js';

import { 
  rankValue, 
  findBaseBuilds, 
  findOpponentMatchingCards, 
  countIdenticalCardsInHand, 
  getCardId, 
  calculateCardSum, 
  canPartitionIntoSums 
} from '../game-logic/index.js';

import { 
  validateAddToOpponentBuild, 
  validateTrail, 
  validateAddToOwnBuild, 
  validateTemporaryStackBuild, 
  validateReinforceBuildWithStack, 
  validateMergeIntoOwnBuild, 
  validateExtendToMerge, 
  validateReinforceOpponentBuildWithStack, 
  findPossibleBuildsFromStack 
} from '../game-logic/validation.js';

import { analyzeCardStack, validateNewCardAddition, getCandidateTargetValues, validateComboSorting } from '../game-logic/combo-analyzer';


export const useGameActions = () => {
  const [gameState, setGameState] = useState(initializeGame());
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const { modalInfo, setModalInfo, handleModalAction: modalHandleAction, showModal, closeModal } = useModalManager();
  const { showError, showWarning, showInfo } = importedUseNotifications(setErrorModal);

  // Effect to handle end of round and end of game
  useEffect(() => {
    const { playerHands, deck, gameOver, round } = gameState;

    // Don't run if game is already over
    if (gameOver) return;

    // Condition for end of a round: both hands are empty
    if (playerHands[0].length === 0 && playerHands[1].length === 0) {
      // Use a timeout to allow players to see the final board state
      const timer = setTimeout(() => {
        setGameState(currentState => {
          // Re-check to prevent race conditions
          if (currentState.gameOver || (currentState.playerHands[0].length !== 0 || currentState.playerHands[1].length !== 0)) {
            return currentState;
          }

          // After round 1, start round 2
          if (currentState.round === 1) {
            showInfo("Round 1 over. Starting Round 2!");
            return startNextRound(currentState);
          }
          // After round 2, end the game
          else if (currentState.round === 2) {
            let finalState = { ...currentState };
            // Sweep remaining cards if any
            if (finalState.tableCards.length > 0 && finalState.lastCapturer !== null) {
              showInfo(`Player ${finalState.lastCapturer + 1} sweeps the table.`);
              finalState = handleSweep(finalState);
            }
            showInfo("Game over! Tallying points...");
            return endGame(finalState);
          }
        });
      }, 2000); // 2-second delay

      return () => clearTimeout(timer); // Cleanup timer on unmount or re-render
    }
  }, [gameState, showInfo]);

  const handleTrailCard = useCallback((card, player, dropPosition = null) => {
    setGameState(currentGameState => {
      if (player !== currentGameState.currentPlayer) {
        showError("It's not your turn!");
        return currentGameState;
      }

      const { tableCards, round, currentPlayer, playerHands } = currentGameState;

      // In Round 2, trailing a card creates a temporary stack instead.
      if (round === 2) {
        const playerAlreadyHasTempStack = tableCards.some(
          s => s.type === 'temporary_stack' && s.owner === currentPlayer
        );
        if (playerAlreadyHasTempStack) {
          showError("You can only have one staging stack at a time.");
          return currentGameState;
        }
        return handleStageSingleCardFromHand(currentGameState, card);
      }

      // SIMPLE CONTACT CHECK
      // If dropped card has ANY contact with table entities, don't trail
      if (dropPosition && hasAnyContact(dropPosition, tableCards)) {
        // Contact detected - let normal game logic handle capture/build
        console.log(`Contact detected for ${card.rank} - routing to capture/build logic`);
        return currentGameState; // Don't trail, let drop zone handlers manage this
      }

      // No contact - proceed with trail validation
      const validation = validateTrail(tableCards, card, player, round);

      if (!validation.valid) {
        showError(validation.message);
        return currentGameState;
      }

      // Trail validation passed - show confirmation modal
      const confirmationModalInfo = {
        type: 'trail_confirmation',
        title: 'Trail Card',
        message: `Trail your ${card.rank} to the table?`,
        card: card,
        currentPlayer: currentPlayer,
        actions: [
          {
            type: 'confirm_trail',
            label: 'Yes, Trail Card',
            payload: { card, currentPlayer }
          },
          {
            type: 'cancel_trail', 
            label: 'Cancel',
            payload: null
          }
        ]
      };

      setModalInfo(confirmationModalInfo);
      return currentGameState; // Don't trail yet, wait for confirmation
    });
  }, [showError]);


  // Centralized helper to execute actions and update state.
  // Wrapped in useCallback to be stable and prevent re-renders of dependent hooks.
  const executeAction = useCallback((currentGameState, action) => {
    if (!action) return currentGameState;
    // Special case for end_game which doesn't need payload
    if (action.type === 'end_game') {
      // Handle end game immediately without payload requirements
      console.log('Manual game end triggered');
      let finalState = { ...currentGameState };
      
      // If there are cards on the table and someone captured last, sweep them first
      if (finalState.tableCards.length > 0 && finalState.lastCapturer !== null) {
        console.log(`Sweeping remaining ${finalState.tableCards.length} table cards to player ${finalState.lastCapturer + 1}`);
        finalState = handleSweep(finalState);
      }
      
      return endGame(finalState);
    }
    
    if (!action.payload) return currentGameState;
    const { draggedItem } = action.payload;

    switch (action.type) {
      case 'capture':
        return handleCapture(currentGameState, draggedItem, [action.payload.targetCard]);
      case 'build':
        return handleBuild(
          currentGameState,
          draggedItem,
          [action.payload.targetCard],
          action.payload.buildValue,
          action.payload.biggerCard,
          action.payload.smallerCard
        );
      case 'baseBuild':
        return handleBaseBuild(currentGameState, draggedItem, action.payload.baseCard, action.payload.otherCardsInBuild);
      case 'addToOpponentBuild':
        return handleAddToOpponentBuild(currentGameState, draggedItem, action.payload.buildToAddTo);
      case 'addToOwnBuild':
        return handleAddToOwnBuild(currentGameState, draggedItem, action.payload.buildToAddTo);
      case 'createBuildFromStack':
        return handleCreateBuildFromStack(currentGameState, draggedItem, action.payload.stackToBuildFrom);
      case 'extendToMerge':
        return handleExtendToMerge(currentGameState, draggedItem.card, action.payload.opponentBuild, action.payload.ownBuild);
      case 'createBuildWithValue':
        return handleCreateBuildWithValue(currentGameState, action.payload.stack, action.payload.buildValue);
      case 'confirm_trail':
        // Execute the trail action after confirmation
        return handleTrail(currentGameState, action.payload.card);
      case 'cancel_trail':
        // Do nothing, just close modal
        return currentGameState;
      default:
        return currentGameState;
    }
  }, []);

  const handleModalAction = useCallback((action) => {
    modalHandleAction(action, (action) => {
      setGameState(currentGameState => executeAction(currentGameState, action));
    });
  }, [modalHandleAction, executeAction]);


  const handleDropOnCard = useCallback((draggedItem, targetInfo) => {
    if (!targetInfo || !draggedItem) {
      console.warn("Drop action is missing target or dragged item information.");
      return;
    }
    // This check is now more robust. It allows items that are either a single card, a stack, or a temporary stack.
    if (!draggedItem.card && !draggedItem.stack && draggedItem.source !== 'temporary_stack') {
      console.warn("Drop on card stack was ambiguous, no action taken. Dragged item is missing 'card' or 'stack' property.", draggedItem);
      return;
    }

    // Get fresh game state for turn validation
    setGameState(currentGameState => {
      const { currentPlayer, playerHands, tableCards, playerCaptures } = currentGameState;
      // Handle different payload structures: regular cards vs temporary stacks
      const draggedCard = draggedItem.card; // May be undefined for temporary stacks
      const draggedSource = draggedItem.source;

      // Debug logging for troubleshooting

      if (draggedItem.player !== currentPlayer) {
        console.error(`Drop turn validation failed - dragged player: ${draggedItem.player}, current player: ${currentPlayer}`);
        showError("It's not your turn!");
        return currentGameState;
      }

      // --- NEW LOGIC FOR TEMPORARY CAPTURE STACKS ---

      // Case A: A card is being used to create/add to a temporary stack
      // This can be a card from the table OR the opponent's capture pile.
      if (draggedSource === 'table' || draggedSource === 'opponentCapture' || draggedSource === 'captured') {
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
          if (!targetCard) { showError("Target card for stack not found."); return currentGameState; }
          if (getCardId(draggedCard) === getCardId(targetCard)) return currentGameState; // Prevent self-drop

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
          if (!targetStack) { showError("Target stack not found."); return currentGameState; }
          if (targetStack.owner !== currentPlayer) { showError("You cannot add to another player's temporary stack."); return currentGameState; }

          // Handle if dragging another temporary stack onto this one
          if (draggedSource === 'temporary_stack') {
            const draggedStack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === draggedItem.stackId);
            if (!draggedStack) { showError("Dragged stack not found."); return currentGameState; }

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
      }

      // Case B: A hand card is being dragged
      if (draggedSource === 'hand') {
        // B.1: Dropped on a temporary stack
        if (targetInfo.type === 'temporary_stack') {
          const stack = tableCards.find(s => s.type === 'temporary_stack' && s.stackId === targetInfo.stackId);
          if (!stack) { showError("Stack not found."); return currentGameState; }
          if (stack.owner !== currentPlayer) { showError("You can only interact with your own temporary stacks."); return currentGameState; }

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
        // B.2 & B.3 (Hand on loose card or build) fall through to the existing logic below.
      }

      // --- END NEW LOGIC ---

      // Handler for dropping on a loose card
      const handleLooseCardDrop = () => {
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

        const { card: draggedCard } = draggedItem;
        
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
      };

      // Handler for dropping on a build
      const handleBuildDrop = () => {
        const buildToDropOn = tableCards.find(b => b.type === 'build' && b.buildId === targetInfo.buildId);
        if (!buildToDropOn) {
          showError("Target build not found on table. The build may have already been captured.");
          return currentGameState;
        }

        // --- Handle dropping a temporary stack onto a build ---
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

        const { card: draggedCard } = draggedItem;
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
      };

      if (targetInfo.type === 'loose') {
        return handleLooseCardDrop();
      } else if (targetInfo.type === 'build') {
        return handleBuildDrop();
      } else if (targetInfo.type === 'temporary_stack') {
        // Handle dropping cards/stacks on temporary stacks  
        if (draggedItem.source === 'temporary_stack') {
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
        
        // Handle hand cards dropped on temporary stacks (already processed above in Case B.1)
        showError("Temporary stack drop not handled properly. This should not occur.");
        return currentGameState;
      } else {
        showError("Unknown drop target type.");
        return currentGameState;
      }
    });
  }, [showError, setModalInfo, executeAction]);

  const handleStageOpponentCardAction = useCallback((item) => {
    setGameState(currentGameState => {
      if (currentGameState.currentPlayer !== item.player) {
        showError("It's not your turn!");
        return currentGameState;
      }

      // --- NEW VALIDATION: Enforce one temp stack at a time ---
      const { tableCards, currentPlayer } = currentGameState;
      const playerAlreadyHasTempStack = tableCards.some(
        s => s.type === 'temporary_stack' && s.owner === currentPlayer
      );
      if (playerAlreadyHasTempStack) {
        showError("You can only have one staging stack at a time.");
        return currentGameState;
      }
      return handleStageOpponentCard(currentGameState, item.card);
    });
  }, [showError]);

  const handleCancelStagingStackAction = useCallback((stack) => {
    setGameState(currentGameState => {
      return handleCancelStagingStack(currentGameState, stack);
    });
  }, []);

  const handleConfirmStagingStackAction = useCallback((stack) => {
    setGameState(currentGameState => {
      // --- Handle single-card trail confirmation ---
      if (stack.cards.length === 1 && stack.cards[0].source === 'hand') {
        // This is a confirmation of a trail action in round 2.
        return handleFinalizeTrail(currentGameState, stack);
      }

      const { playerHands, tableCards, currentPlayer } = currentGameState;
      const playerHand = playerHands[currentPlayer];
      const actions = [];

      // --- Validation: A final stack must have exactly one hand card ---
      const handCardsInStack = stack.cards.filter(c => c.source === 'hand');
      if (handCardsInStack.length !== 1) {
        showError("A final move must be made with exactly one card from your hand.");
        return handleDisbandStagingStack(currentGameState, stack);
      }
      const handCard = handCardsInStack[0];
      const tableCardsInStack = stack.cards.filter(c => c.source !== 'hand');

      // --- NEW VALIDATION: Check if combos are sorted correctly ---
      const sortingValidation = validateComboSorting(stack.cards);
      if (!sortingValidation.isValid) {
        const errorMessage = sortingValidation.error + 
          (sortingValidation.suggestion ? `\n\n${sortingValidation.suggestion}` : '');
        showError(errorMessage);
        return currentGameState; // Don't disband, let player fix the sorting
      }

      // --- Possibility 1: Capture ---
      const sumOfTableCards = calculateCardSum(tableCardsInStack);
      const captureValue = rankValue(handCard.rank);

      if (tableCardsInStack.length > 0 && sumOfTableCards % captureValue === 0) {
        if (sumOfTableCards === captureValue || canPartitionIntoSums(tableCardsInStack, captureValue)) {
          actions.push(importedCreateActionOption('capture', `Capture for ${captureValue}`, {
            draggedItem: { card: handCard, source: 'hand' },
            targetCard: stack // The whole stack is the target
          }));
        }
      }

      // --- Possibility 2: Build ---
      const possibleBuilds = findPossibleBuildsFromStack(stack, playerHand, tableCards, currentPlayer);
      possibleBuilds.forEach(value => {
        actions.push(importedCreateActionOption('createBuildWithValue', `Create a Build of ${value}`, {
          stack: stack,
          buildValue: value,
          draggedItem: { card: handCard, source: 'hand' }
        }));
      });

      // --- Decision Logic ---
      if (actions.length === 0) {
        showError("This combination is not a valid capture or build.");
        return handleDisbandStagingStack(currentGameState, stack);
      }

      if (actions.length === 1) {
        return executeAction(currentGameState, actions[0]);
      }

      // More than one action, show the modal
      setModalInfo({
        title: 'Choose Your Action',
        message: `This combination can form multiple actions. Please choose one:`,
        actions: actions
      });
      return currentGameState;
    });
  }, [showError, setModalInfo, importedCreateActionOption, executeAction]);

  return { 
    gameState, 
    modalInfo, 
    errorModal,
    handleTrailCard, 
    handleDropOnCard, 
    handleModalAction, 
    setModalInfo, 
    executeAction, 
    handleCancelStagingStackAction, 
    handleStageOpponentCardAction, 
    handleConfirmStagingStackAction,
    closeErrorModal: () => setErrorModal({ visible: false, title: '', message: '' })
  };
};