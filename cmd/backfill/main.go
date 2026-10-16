package main

import (
	"context"
	"fmt"
	"log"
	"os"

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

	rows, err := pool.Query(ctx, `
		SELECT DISTINCT title, release_year 
		FROM items 
		WHERE user_id > 0 AND category = 'game' AND (youtube_url IS NULL OR length(youtube_url) = 0)
	`)
	if err != nil {
		log.Fatal(err)
	}

	type gItem struct {
		title string
		year  string
	}
	var games []gItem
	for rows.Next() {
		var g gItem
		if err := rows.Scan(&g.title, &g.year); err == nil {
			games = append(games, g)
		}
	}
	rows.Close()

	fmt.Printf("Found %d user games without trailer to backfill\n", len(games))

	for _, g := range games {
		ytURL, err := youtube.SearchYouTube("", g.title, "game", g.year)
		if err != nil || ytURL == "" {
			fmt.Printf("FAILED: %s (%s) => %v\n", g.title, g.year, err)
			continue
		}
		fmt.Printf("SUCCESS: %s (%s) => %s\n", g.title, g.year, ytURL)
		_, err = pool.Exec(ctx, `
			UPDATE items 
			SET youtube_url = $1, updated_at = CURRENT_TIMESTAMP 
			WHERE LOWER(TRIM(title)) = LOWER(TRIM($2)) AND category = 'game' AND (youtube_url IS NULL OR length(youtube_url) = 0)
		`, ytURL, g.title)
		if err != nil {
			fmt.Printf("DB error updating %s: %v\n", g.title, err)
		}
	}
}
