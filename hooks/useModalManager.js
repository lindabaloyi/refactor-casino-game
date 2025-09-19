import { useState, useCallback } from 'react';

/**
 * Modal Management Hook
 * Extracted from useGameActions.js to handle all modal-related state and actions
 * Manages decision dialogs that appear when players have multiple action choices
 */
export const useModalManager = () => {
  const [modalInfo, setModalInfo] = useState(null);

  const handleModalAction = useCallback((action, executeActionCallback) => {
    if (executeActionCallback && action) {
      executeActionCallback(action);
    }
    setModalInfo(null);
  }, []);

  const showModal = useCallback((modalData) => {
    setModalInfo(modalData);
  }, []);

  const closeModal = useCallback(() => {
    setModalInfo(null);
  }, []);

  return {
    modalInfo,
    setModalInfo,
    handleModalAction,
    showModal,
    closeModal
  };
};