import { useEffect } from 'react';

// While `isOpen`: close on Escape and lock body scroll.
export function useModalBehavior(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);
}
