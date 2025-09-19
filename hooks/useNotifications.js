import { getErrorInfo } from '../utils/errorMapping';

/**
 * Mobile notification functions using custom ErrorModal
 * Extracted from useGameActions.js for better reusability and organization
 */
export const useNotifications = (setErrorModal) => ({
  showError: (message) => {
    const errorInfo = getErrorInfo(message);
    setErrorModal({
      visible: true,
      title: errorInfo.title,
      message: errorInfo.message,
    });
  },
  showWarning: (message) => {
    setErrorModal({
      visible: true,
      title: 'Notice',
      message: message,
    });
  },
  showInfo: (message) => {
    setErrorModal({
      visible: true,
      title: 'Game Info',
      message: message,
    });
  },
});