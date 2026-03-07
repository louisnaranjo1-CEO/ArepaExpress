import { db } from './firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

const MAX_HISTORY = 20;

export interface ViewedProduct {
    id: string;
    categoryId: string;
    restaurantId: string;
    timestamp: number;
}

export const recommendationsService = {
    // Save locally
    recordProductView: (productId: string, category: string, restaurantId: string) => {
        try {
            const historyStr = localStorage.getItem('viewedProducts');
            let history: ViewedProduct[] = historyStr ? JSON.parse(historyStr) : [];

            // Remove if already exists to move it to the front
            history = history.filter(p => p.id !== productId);

            history.unshift({
                id: productId,
                categoryId: category,
                restaurantId,
                timestamp: Date.now()
            });

            // Keep only recent ones
            if (history.length > MAX_HISTORY) {
                history = history.slice(0, MAX_HISTORY);
            }

            localStorage.setItem('viewedProducts', JSON.stringify(history));
        } catch (error) {
            console.error('Error tracking product view', error);
        }
    },

    getViewedProductsHistory: (): ViewedProduct[] => {
        try {
            const historyStr = localStorage.getItem('viewedProducts');
            return historyStr ? JSON.parse(historyStr) : [];
        } catch (error) {
            return [];
        }
    },

    getTopInterestedCategories: (): string[] => {
        const history = recommendationsService.getViewedProductsHistory();
        const categories: Record<string, number> = {};

        history.forEach(item => {
            categories[item.categoryId] = (categories[item.categoryId] || 0) + 1;
        });

        return Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);
    },

    getLastViewedCategory: (): string | null => {
        const history = recommendationsService.getViewedProductsHistory();
        return history.length > 0 ? history[0].categoryId : null;
    }
};
