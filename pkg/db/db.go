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

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
