import { config } from 'dotenv';
import { main } from './main';

// Load environment variables from .env file
config();

main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});