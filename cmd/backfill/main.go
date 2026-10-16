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

	fmt.Printf("Total unique user games needing trailers: %d\n", len(games))
	for _, g := range games {
		fmt.Printf("Searching for: %s (%s)...\n", g.title, g.year)
		ytURL, err := youtube.SearchYouTube("", g.title, g.category, g.year)
		if err != nil || ytURL == "" {
			fmt.Printf("  FAILED: %s (%s) => %v\n", g.title, g.year, err)
		} else {
			fmt.Printf("  SUCCESS: %s (%s) => %s\n", g.title, g.year, ytURL)
			res, err := pool.Exec(ctx, `
				UPDATE items 
				SET youtube_url = $1, updated_at = CURRENT_TIMESTAMP 
				WHERE LOWER(TRIM(title)) = LOWER(TRIM($2)) AND TRIM(LOWER(category)) = 'game'
			`, ytURL, g.title)
			if err != nil {
				fmt.Printf("  DB error: %v\n", err)
			} else {
				fmt.Printf("  Updated %d rows in DB\n", res.RowsAffected())
			}
		}
		// Small delay to be courteous to YouTube
		time.Sleep(500 * time.Millisecond)
	}
}
