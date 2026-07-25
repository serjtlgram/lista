package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	BotToken    string
	Environment string
}

func LoadConfig() *Config {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://tracklist_user:tracklist_pass@localhost:5432/tracklist_db?sslmode=disable"
	}

	botToken := os.Getenv("BOT_TOKEN")
	if botToken == "" {
		botToken = "1286708116:AAEZiyOoCajfE1dROju79VU0VQJEb5B0lCU"
	}

	env := os.Getenv("ENV")
	if env == "" {
		env = "production"
	}

	return &Config{
		Port:        port,
		DatabaseURL: dbURL,
		BotToken:    botToken,
		Environment: env,
	}
}
