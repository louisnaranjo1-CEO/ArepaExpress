import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function useHaptics() {
    const vibrate = async (style: ImpactStyle = ImpactStyle.Light) => {
        try {
            await Haptics.impact({ style });
        } catch (error) {
            // Se ignora el error de forma silenciosa si no estamos en entorno Capacitor
        }
    };

    const vibrateSuccess = async () => {
        try {
            await Haptics.notification({ type: 'SUCCESS' as any });
        } catch (error) {}
    };

    const vibrateWarning = async () => {
        try {
            await Haptics.notification({ type: 'WARNING' as any });
        } catch (error) {}
    };

    const vibrateError = async () => {
        try {
            await Haptics.notification({ type: 'ERROR' as any });
        } catch (error) {}
    };

    const vibrateSelection = async () => {
        try {
            await Haptics.selectionStart();
            await Haptics.selectionChanged();
            await Haptics.selectionEnd();
        } catch (error) {}
    };

    return {
        vibrate,
        vibrateSuccess,
        vibrateWarning,
        vibrateError,
        vibrateSelection,
        ImpactStyle
    };
}
