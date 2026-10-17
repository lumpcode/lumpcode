import { config } from 'dotenv';
import { main } from './main';

// Load environment variables from .env file. quiet skips the "injected env" notice.
config({ quiet: true });

main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});