package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port            string
	DatabaseURL     string
	BotToken        string
	Environment     string
	YoutubeAPIKey   string
	TMDBAPIKey      string
	KinopoiskAPIKey string
}

func LoadConfig() *Config {
	_ = godotenv.Load("server_env", ".env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://tracklist_user:tracklist_pass@localhost:5432/tracklist_db?sslmode=disable"
	}

	botToken := os.Getenv("BOT_TOKEN")

	env := os.Getenv("ENV")
	if env == "" {
		env = "production"
	}

	youtubeKey := os.Getenv("YOUTUBE_API_KEY")
	tmdbKey := os.Getenv("TMDB_API_KEY")
	kinopoiskKey := os.Getenv("KINOPOISK_API_KEY")

	return &Config{
		Port:            port,
		DatabaseURL:     dbURL,
		BotToken:        botToken,
		Environment:     env,
		YoutubeAPIKey:   youtubeKey,
		TMDBAPIKey:      tmdbKey,
		KinopoiskAPIKey: kinopoiskKey,
	}
}
