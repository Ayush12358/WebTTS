import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { X, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

/**
 * Toast notification provider — wrap the app to use toasts.
 * Usage: const { showToast } = useToast(); showToast('message', 'error');
 */
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, type }]);
        return id;
    }, []);

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, dismissToast }}>
            {children}
            <div
                className="toast-container"
                style={{
                    position: 'fixed',
                    bottom: '1rem',
                    right: '1rem',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    maxWidth: '380px'
                }}
            >
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}

const iconMap = {
    error: <AlertCircle size={18} />,
    warning: <AlertTriangle size={18} />,
    info: <Info size={18} />
};

function ToastItem({ toast, onDismiss }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 4000);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    const bgColor = toast.type === 'error'
        ? 'var(--toast-bg-error, #fef2f2)'
        : toast.type === 'warning'
            ? 'var(--toast-bg-warning, #fffbeb)'
            : 'var(--toast-bg-info, #eff6ff)';

    const borderColor = toast.type === 'error'
        ? 'var(--toast-border-error, #fecaca)'
        : toast.type === 'warning'
            ? 'var(--toast-border-warning, #fde68a)'
            : 'var(--toast-border-info, #bfdbfe)';

    const textColor = toast.type === 'error'
        ? 'var(--toast-text-error, #991b1b)'
        : toast.type === 'warning'
            ? 'var(--toast-text-warning, #92400e)'
            : 'var(--toast-text-info, #1e40af)';

    return (
        <div
            className="toast-item"
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: bgColor,
                border: `1px solid ${borderColor}`,
                color: textColor,
                fontSize: '0.875rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                animation: 'toast-slide-in 0.3s ease-out',
                pointerEvents: 'auto'
            }}
        >
            <span style={{ flexShrink: 0, marginTop: '1px' }}>
                {iconMap[toast.type] || iconMap.info}
            </span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button
                onClick={() => onDismiss(toast.id)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'inherit',
                    opacity: 0.5,
                    flexShrink: 0
                }}
            >
                <X size={14} />
            </button>
        </div>
    );
}
