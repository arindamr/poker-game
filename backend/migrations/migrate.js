const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const logger = require('../src/utils/logger');

/**
 * Run database migrations
 */
const runMigrations = async () => {
  try {
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    logger.info(`Found ${files.length} migration files`);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Running migration: ${file}`);

      try {
        await db.query(sql);
        logger.info(`Completed migration: ${file}`);
      } catch (error) {
        if (error.code === '42P07') {
          // Table already exists - skip
          logger.info(`Table already exists (${file}), skipping`);
        } else {
          throw error;
        }
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  } finally {
    await db.close();
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
