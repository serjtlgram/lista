package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(connString string) (*DB, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	// Memory optimization for 1GB vCPU server
	config.MaxConns = 15
	config.MinConns = 2
	config.MaxConnIdleTime = 5 * time.Minute
	config.MaxConnLifetime = 30 * time.Minute

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	log.Println("Successfully connected to PostgreSQL (MaxConns=15)")

	// Auto-migrate schema additions if needed
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomed BOOLEAN DEFAULT FALSE;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code VARCHAR(50) DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS allows_write_to_pm BOOLEAN DEFAULT FALSE;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS visits_count INT DEFAULT 1;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS youtube_url TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS director TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS cast_members TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS author TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS isbn VARCHAR(100) DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS public_rating VARCHAR(50) DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS lists_data JSONB DEFAULT '[]';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE users ADD COLUMN IF NOT EXISTS folders_data JSONB DEFAULT '[]';`)
	_, _ = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS shared_lists (id VARCHAR(64) PRIMARY KEY, title VARCHAR(255) NOT NULL, data JSONB NOT NULL, created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP);`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS country VARCHAR(255) DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS seasons INT DEFAULT 0;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS episodes_total INT DEFAULT 0;`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS air_status TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS episodes_list TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS cast_roles TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS age_rating TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS budget TEXT DEFAULT '';`)
	_, _ = pool.Exec(ctx, `ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_enriched BOOLEAN DEFAULT FALSE;`)

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}

func (db *DB) StartCleanupJob() {
	go func() {
		// Run once immediately on startup
		db.cleanupOldCacheItems()

		// Run every 24 hours
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			db.cleanupOldCacheItems()
		}
	}()
}

func (db *DB) cleanupOldCacheItems() {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Minute)
	defer cancel()

	// Delete items with user_id = 0 created more than 3 days ago
	query := `
		DELETE FROM items 
		WHERE user_id = 0 
		AND created_at < NOW() - INTERVAL '3 days'
	`
	tag, err := db.Pool.Exec(ctx, query)
	if err != nil {
		log.Printf("[CleanupJob] Error cleaning up old cache items: %v", err)
		return
	}
	
	rowsAffected := tag.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("[CleanupJob] Successfully deleted %d old cache items", rowsAffected)
	} else {
		log.Printf("[CleanupJob] No old cache items to delete")
	}
}
