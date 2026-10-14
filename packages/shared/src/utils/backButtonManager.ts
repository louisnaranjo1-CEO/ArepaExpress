import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import toast from 'react-hot-toast';

type DismissHandler = () => boolean | void;

const modalDismissStack: DismissHandler[] = [];
let isInitialized = false;
let lastBackPressTime = 0;

/**
 * Registers an active modal/sheet/drawer.
 * Returns an unregister function to be called on cleanup.
 */
export function registerModalDismiss(handler: DismissHandler): () => void {
    modalDismissStack.push(handler);
    return () => {
        const index = modalDismissStack.indexOf(handler);
        if (index !== -1) {
            modalDismissStack.splice(index, 1);
        }
    };
}

/**
 * Global back button listener for Android Capacitor
 */
export function setupBackButtonHandler(
    navigateBack: () => void,
    isRootRoute: () => boolean
): () => void {
    if (!Capacitor.isNativePlatform()) {
        return () => {};
    }

    const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
        // 1. If an overlay/modal is open, dismiss the topmost one
        if (modalDismissStack.length > 0) {
            const dismiss = modalDismissStack.pop();
            if (dismiss) {
                try {
                    dismiss();
                    return;
                } catch (e) {
                    console.warn('[BackButton] Error running modal dismiss handler:', e);
                }
            }
        }

        // 2. If not on the root screen, navigate back in router history
        if (!isRootRoute()) {
            navigateBack();
            return;
        }

        // 3. If on the root screen, double-press to exit
        const now = Date.now();
        if (now - lastBackPressTime < 2000) {
            CapApp.exitApp();
        } else {
            lastBackPressTime = now;
            toast('Presiona atrás nuevamente para salir', {
                id: 'back-exit-toast',
                duration: 2000,
                icon: '👋',
                style: {
                    background: '#0f172a',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '13px',
                    borderRadius: '16px'
                }
            });
        }
    });

    return () => {
        sub.then(s => s.remove());
    };
}
