import { seedDatabase } from './src/lib/seed';

seedDatabase().then(() => {
    console.log("Seeding complete. Exiting...");
    process.exit(0);
}).catch(console.error);
