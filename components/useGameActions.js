import { useState, useCallback, useEffect } from 'react';
import { getErrorInfo } from '../utils/errorMapping';
import { hasAnyContact } from '../utils/simpleContactDetection';
import { useNotifications as importedUseNotifications } from '../hooks/useNotifications.ts';
import { useModalManager } from '../hooks/useModalManager.ts';
import {
  createActionOption as importedCreateActionOption,
  canCreateBuild as importedCanCreateBuild,
  generatePossibleActions as importedGeneratePossibleActions
} from '../utils/gameActionHelpers.ts';
import { handleTableCardDrop } from '../handlers/handleTableCardDrop';
import { handleHandCardDrop } from '../handlers/handleHandCardDrop';
import { handleTemporaryStackDrop } from '../handlers/handleTemporaryStackDrop';
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

      // Route to appropriate handler based on source type
      if (draggedSource === 'table' || draggedSource === 'opponentCapture' || draggedSource === 'captured') {
        return handleTableCardDrop(draggedItem, targetInfo, currentGameState, showError);
      } else if (draggedSource === 'hand') {
        return handleHandCardDrop(
          draggedItem,
          targetInfo,
          currentGameState,
          showError,
          setModalInfo,
          executeAction,
          importedCreateActionOption,
          importedGeneratePossibleActions
        );
      } else if (draggedSource === 'temporary_stack') {
        return handleTemporaryStackDrop(draggedItem, targetInfo, currentGameState, showError);
      } else {
        showError("Unknown drop source type.");
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