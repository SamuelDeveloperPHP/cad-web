import { fileURLToPath } from 'node:url';

/**
 * Pasta das migrations geradas pelo drizzle-kit (apps/api/drizzle).
 * Resolvida a partir deste arquivo para funcionar tanto em `src/` quanto em
 * `dist/`, que ficam no mesmo nivel relativo a `drizzle/`.
 */
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
