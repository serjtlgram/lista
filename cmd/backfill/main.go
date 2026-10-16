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
		SELECT id, title, COALESCE(release_year, ''), COALESCE(youtube_url, '') 
		FROM items 
		WHERE category = 'game'
		ORDER BY id ASC
	`)
	if err != nil {
		log.Fatal(err)
	}

	type gItem struct {
		id    int
		title string
		year  string
		url   string
	}
	var games []gItem
	for rows.Next() {
		var g gItem
		if err := rows.Scan(&g.id, &g.title, &g.year, &g.url); err == nil {
			games = append(games, g)
		}
	}
	rows.Close()

	fmt.Printf("Total games: %d\n", len(games))
	for _, g := range games {
		fmt.Printf("[%d] %s (%s) => %s\n", g.id, g.title, g.year, g.url)
		if g.url == "" {
			ytURL, err := youtube.SearchYouTube("", g.title, "game", g.year)
			if err != nil || ytURL == "" {
				fmt.Printf("  FAILED: %s (%s) => %v\n", g.title, g.year, err)
				continue
			}
			fmt.Printf("  SUCCESS: %s (%s) => %s\n", g.title, g.year, ytURL)
			_, err = pool.Exec(ctx, `
				UPDATE items 
				SET youtube_url = $1, updated_at = CURRENT_TIMESTAMP 
				WHERE id = $2
			`, ytURL, g.id)
			if err != nil {
				fmt.Printf("  DB error: %v\n", err)
			}
		}
	}
}
