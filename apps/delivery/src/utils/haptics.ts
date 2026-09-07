export const vibrate = (duration: number = 50) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(duration);
    }
};
