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
	}
}
