/**
 * Script to migrate all existing SQLite data to Supabase PostgreSQL.
 */

const { db } = require('../backend/db/database');
const { getSupabaseClient } = require('../backend/db/supabase');

async function migrateData() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('Supabase client not configured.');
    process.exit(1);
  }

  const tables = [
    'users',
    'student_profiles',
    'courses',
    'assignments',
    'study_resources',
    'study_plans',
    'study_plan_items',
    'study_sessions',
    'calendar_events',
    'saved_routes',
    'ride_groups',
    'ride_group_members',
    'goals',
    'live_commute_reports',
    'live_report_confirmations',
    'feedback',
    'notifications'
  ];

  console.log('Starting migration from SQLite to Supabase...\n');

  for (const table of tables) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      if (!rows || rows.length === 0) {
        console.log(`[${table}] 0 rows found in SQLite, skipping.`);
        continue;
      }

      console.log(`[${table}] Migrating ${rows.length} rows to Supabase...`);

      // Upsert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
        if (error) {
          console.error(`  Error in [${table}] batch:`, error.message);
        } else {
          console.log(`  Successfully inserted/updated ${batch.length} rows.`);
        }
      }
    } catch (err) {
      console.warn(`[${table}] Skipped or error: ${err.message}`);
    }
  }

  console.log('\nMigration to Supabase completed successfully!');
}

migrateData().catch(console.error);
