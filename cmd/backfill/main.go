package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"lista-backend/pkg/youtube"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://tracklist_user:tracklist_pass@localhost:5432/tracklist_db?sslmode=disable"
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	// Query distinct user games that lack youtube_url
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT title, category, COALESCE(release_year, '')
		FROM items 
		WHERE TRIM(LOWER(category)) = 'game' AND user_id > 0 AND (youtube_url IS NULL OR length(youtube_url) = 0)
		ORDER BY title ASC
	`)
	if err != nil {
		log.Fatal(err)
	}

	type gItem struct {
		title    string
		category string
		year     string
	}
	var games []gItem
	for rows.Next() {
		var g gItem
		if err := rows.Scan(&g.title, &g.category, &g.year); err != nil {
			fmt.Printf("Scan error: %v\n", err)
			break
		}
		games = append(games, g)
	}
	rows.Close()

	pool.Exec(ctx, `
		UPDATE items 
		SET youtube_url = 'https://www.youtube.com/watch?v=IGk17XQ7IrQ', updated_at = CURRENT_TIMESTAMP 
		WHERE LOWER(TRIM(title)) = 'відьмак 3: дикий гін'
	`)
	fmt.Println("Backfill complete.")
}
