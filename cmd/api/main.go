package main

import (
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"lista-backend/pkg/auth"
	"lista-backend/pkg/config"
	"lista-backend/pkg/db"
	"lista-backend/pkg/handlers"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("Starting TrackList API Server on port %s (env: %s)...", cfg.Port, cfg.Environment)

	// Initialize Database Pool
	database, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to DB: %v. Running in degraded mode.", err)
	} else {
		defer database.Close()
	}

	h := handlers.NewHandler(database, cfg.BotToken, cfg.YoutubeAPIKey)

	r := chi.NewRouter()

	// Global Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS Setup for Telegram WebApp & GitHub Pages
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Telegram-Init-Data", "X-Test-User-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Public Health check & shared item endpoints
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"tracklist-api"}`))
	})
	r.Get("/api/public/items/{id}", h.GetPublicItem)
	r.Post("/api/telegram/webhook", h.HandleTelegramWebhook)

	// Protected API Routes (Requires HMAC Telegram Auth)
	isDev := cfg.Environment == "development"
	r.Group(func(r chi.Router) {
		r.Use(auth.AuthMiddleware(cfg.BotToken, isDev))

		r.Get("/api/user/profile", h.GetProfile)
		r.Get("/api/items", h.GetItems)
		r.Post("/api/items", h.CreateItem)
		r.Put("/api/items/{id}", h.UpdateItem)
		r.Delete("/api/items/{id}", h.DeleteItem)
		r.Get("/api/stats", h.GetStats)
		r.Get("/api/catalog/search", h.SearchCatalog)
		r.Get("/api/youtube/search", h.SearchYouTube)
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
