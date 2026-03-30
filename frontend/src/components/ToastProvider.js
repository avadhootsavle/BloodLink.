import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

export const emitToast = ({ title, message, type = 'info' }) => {
  window.dispatchEvent(
    new CustomEvent('bloodlink:toast', {
      detail: { id: `${Date.now()}-${Math.random()}`, title, message, type },
    }),
  );
};

export const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const onToast = (event) => {
      const toast = event.detail;
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 4200);
    };

    window.addEventListener('bloodlink:toast', onToast);
    return () => window.removeEventListener('bloodlink:toast', onToast);
  }, []);

  const value = useMemo(
    () => ({
      showToast: emitToast,
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            {toast.title ? <p className="toast__title">{toast.title}</p> : null}
            <p className="toast__message">{toast.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
