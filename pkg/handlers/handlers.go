package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lista-backend/pkg/auth"
	"lista-backend/pkg/db"
	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
	"lista-backend/pkg/ratelimit"
	"lista-backend/pkg/youtube"
)

type Handler struct {
	DB                     *db.DB
	BotToken               string
	YoutubeAPIKey          string
	TMDBAPIKey             string
	KinopoiskAPIKey        string
	FireworksAPIKey        string
	BotSecretToken         string
	RateLimiter            *ratelimit.RateLimiter
	AutoJail               *ratelimit.AutoJail
	RecommendationsLimiter *ratelimit.RecommendationsLimiter
	SearchLimiter          *ratelimit.SearchLimiter
	BotFloodLimiter        *ratelimit.BotFloodLimiter
	OutboundLimiter        *ratelimit.OutboundLimiter
	SearchCache            *SearchCache
	sharedListsCache       map[string][]byte
	cacheMu                sync.RWMutex
	outboundSem            chan struct{}
	ParserSem              chan struct{}
}

func NewHandler(database *db.DB, botToken string, youtubeAPIKey string, tmdbAPIKey string, kinopoiskAPIKey string, fireworksAPIKey string, botSecretToken string) *Handler {
	h := &Handler{
		DB:                     database,
		BotToken:               botToken,
		YoutubeAPIKey:          youtubeAPIKey,
		TMDBAPIKey:             tmdbAPIKey,
		KinopoiskAPIKey:        kinopoiskAPIKey,
		FireworksAPIKey:        fireworksAPIKey,
		BotSecretToken:         botSecretToken,
		RateLimiter:            ratelimit.NewRateLimiter(5*time.Minute, 10*time.Minute),
		AutoJail:               ratelimit.NewAutoJail(),
		RecommendationsLimiter: ratelimit.NewRecommendationsLimiter(3, 10*time.Minute),
		SearchLimiter:          ratelimit.NewSearchLimiter(20, 1*time.Minute),
		BotFloodLimiter:        ratelimit.NewBotFloodLimiter(),
		OutboundLimiter:        ratelimit.NewOutboundLimiter(),
		SearchCache:            NewSearchCache(3 * time.Minute),
		sharedListsCache:       make(map[string][]byte),
		outboundSem:            make(chan struct{}, 25),
		ParserSem:              make(chan struct{}, 8), // Max 8 concurrent heavy scraping jobs
	}
	go h.InitBotCommandsAndMenu()
	return h
}

func limitStrLen(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) > maxLen {
		return string(runes[:maxLen])
	}
	return s
}

func getRateLimitKey(r *http.Request) string {
	if user, ok := auth.GetUserFromContext(r); ok && user != nil && user.ID != 0 {
		return fmt.Sprintf("user_%d", user.ID)
	}
	if testUserHeader := r.Header.Get("X-Test-User-ID"); testUserHeader != "" {
		return fmt.Sprintf("user_%s", testUserHeader)
	}
	ip := r.Header.Get("X-Real-IP")
	if ip == "" {
		ip = r.Header.Get("X-Forwarded-For")
	}
	if ip == "" {
		ip = r.RemoteAddr
	}
	return fmt.Sprintf("ip_%s", ip)
}

func (h *Handler) InitBotCommandsAndMenu() {
	if h.DB != nil && h.DB.Pool != nil {
		ctx := context.Background()
		userQuery := `
			INSERT INTO users (id, username, first_name, last_name, welcomed, updated_at)
			VALUES (0, 'system_catalog', 'LISTA', 'Catalog', true, CURRENT_TIMESTAMP)
			ON CONFLICT (id) DO NOTHING;
		`
		_, _ = h.DB.Pool.Exec(ctx, userQuery)

		// Clean up corrupted/blank poster_url entries in database
		_, _ = h.DB.Pool.Exec(ctx, `
			UPDATE items
			SET poster_url = ''
			WHERE poster_url IS NOT NULL
			  AND (
				LENGTH(poster_url) < 10
				OR poster_url LIKE 'data:image/jpeg;base64,ffff%'
			  );
		`)
	}

	if h.BotToken == "" {
		return
	}

	// 1. Set Chat Menu Button text to LISTA
	menuPayload := map[string]interface{}{
		"menu_button": map[string]interface{}{
			"type": "web_app",
			"text": "LISTA",
			"web_app": map[string]interface{}{
				"url": "https://lista-kappa-six.vercel.app",
			},
		},
	}
	if err := h.sendBotAPIRequestWithErr("setChatMenuButton", menuPayload); err != nil {
		log.Printf("[BotMenuInit] Error setting chat menu button: %v", err)
	} else {
		log.Printf("[BotMenuInit] Chat menu button set successfully to https://lista-kappa-six.vercel.app")
	}

	// 2. Set default /start command
	commandsPayload := map[string]interface{}{
		"commands": []map[string]string{
			{"command": "start", "description": "🚀 Открыть LISTA / Перезапустить"},
		},
	}
	h.sendBotAPIRequest("setMyCommands", commandsPayload)

	// 3. Set Ukrainian /start command
	ukPayload := map[string]interface{}{
		"language_code": "uk",
		"commands": []map[string]string{
			{"command": "start", "description": "🚀 Відкрити LISTA / Перезапустити"},
		},
	}
	h.sendBotAPIRequest("setMyCommands", ukPayload)

	// 4. Set Spanish /start command
	esPayload := map[string]interface{}{
		"language_code": "es",
		"commands": []map[string]string{
			{"command": "start", "description": "🚀 Abrir LISTA / Reiniciar"},
		},
	}
	h.sendBotAPIRequest("setMyCommands", esPayload)
}

func (h *Handler) sendBotAPIRequest(method string, payload interface{}) {
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", h.BotToken, method)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()
}

// UpsertUser ensures user exists in database and triggers welcome message if first visit
func (h *Handler) ensureUser(r *http.Request, u *models.User) error {
	if h.DB == nil || h.DB.Pool == nil {
		return nil
	}
	ctx := r.Context()
	query := `
		INSERT INTO users (
			id, username, first_name, last_name, photo_url, language_code, is_premium, allows_write_to_pm, visits_count, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
		)
		ON CONFLICT (id) DO UPDATE SET
			username = EXCLUDED.username,
			first_name = EXCLUDED.first_name,
			last_name = EXCLUDED.last_name,
			photo_url = EXCLUDED.photo_url,
			language_code = EXCLUDED.language_code,
			is_premium = EXCLUDED.is_premium,
			allows_write_to_pm = EXCLUDED.allows_write_to_pm,
			visits_count = CASE 
				WHEN users.updated_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN users.visits_count + 1 
				ELSE users.visits_count 
			END,
			updated_at = CURRENT_TIMESTAMP;
	`
	_, err := h.DB.Pool.Exec(ctx, query, u.ID, u.Username, u.FirstName, u.LastName, u.PhotoURL, u.LanguageCode, u.IsPremium, u.AllowsWriteToPM)
	if err != nil {
		return err
	}

	// Check and mark welcomed atomically
	// If welcomed was false, this UPDATE changes 1 row to true, giving us execution right to send the message ONCE
	res, err := h.DB.Pool.Exec(ctx, "UPDATE users SET welcomed = true WHERE id = $1 AND welcomed = false", u.ID)
	if err == nil && res.RowsAffected() == 1 {
		go h.sendWelcomeMessage(u.ID, u.LanguageCode)
	}

	return nil
}

type WelcomeTexts struct {
	Text   string
	Button string
}

func getWelcomeContent(langCode string) WelcomeTexts {
	lang := strings.ToLower(strings.TrimSpace(langCode))
	appLink := "https://t.me/manytgbot?startapp=true"

	if strings.HasPrefix(lang, "uk") {
		return WelcomeTexts{
			Text: fmt.Sprintf(`✨ <b>Ласкаво просимо до LISTA!</b> 🎬📚🎮

LISTA — твій персональний міні-додаток для збереження вражень від фільмів, серіалів, книг та ігор.

<b>Що вміє LISTA:</b>
📌 <b>Зберігай</b> усе, що подивився, прочитав або пройшов
⭐ <b>Став оцінки</b> та додавай особисті нотатки
⏱ <b>Відстежуй прогрес</b> і час, витрачений на контент
🔗 <b>Ділись</b> елементами та своїми списками з друзями

Спробуй — це зручно та цікаво! 👇
%s`, appLink),
			Button: "🚀 Відкрити LISTA",
		}
	} else if strings.HasPrefix(lang, "es") {
		return WelcomeTexts{
			Text: fmt.Sprintf(`✨ <b>¡Bienvenido a LISTA!</b> 🎬📚🎮

LISTA es tu mini-aplicación personal para guardar impresiones de películas, series, libros y juegos.

<b>¿Qué puedes hacer con LISTA?</b>
📌 <b>Guarda</b> todo lo que has visto, leído o jugado
⭐ <b>Califica</b> y añade tus notas personales
⏱ <b>Sigue tu progreso</b> y el tiempo dedicado al contenido
🔗 <b>Comparte</b> elementos y tus listas con amigos

¡Pruébalo, es genial y fácil de usar! 👇
%s`, appLink),
			Button: "🚀 Abrir LISTA",
		}
	} else if strings.HasPrefix(lang, "en") {
		return WelcomeTexts{
			Text: fmt.Sprintf(`✨ <b>Welcome to LISTA!</b> 🎬📚🎮

LISTA is your personal mini-app for tracking movies, TV shows, books, and games.

<b>What you can do with LISTA:</b>
📌 <b>Save</b> everything you've watched, read, or played
⭐ <b>Rate</b> and add your personal notes
⏱ <b>Track progress</b> and time spent on content
🔗 <b>Share</b> items and your lists with friends

Give it a try — it's fast and easy! 👇
%s`, appLink),
			Button: "🚀 Open LISTA",
		}
	}

	// Default to Russian if lang is ru or unknown
	return WelcomeTexts{
		Text: fmt.Sprintf(`✨ <b>Добро пожаловать в LISTA!</b> 🎬📚🎮

LISTA — твое персональное мини-приложение для сохранения впечатлений от фильмов, сериалов, книг и игр.

<b>Что умеет LISTA:</b>
📌 <b>Сохраняй</b> всё, что посмотрел, прочитал или прошёл
⭐ <b>Ставь оценки</b> и добавляй личные заметки
⏱ <b>Отслеживай прогресс</b> и время, потраченное на контент
🔗 <b>Делись</b> элементами и своими списками с друзьями

Попробуй — это удобно и прикольно! 👇
%s`, appLink),
		Button: "🚀 Открыть LISTA",
	}
}

func (h *Handler) sendWelcomeMessage(userID int64, langCode string) {
	if h.BotToken == "" {
		log.Printf("[WelcomeBot] BotToken is empty, skipping welcome message for user %d", userID)
		return
	}

	content := getWelcomeContent(langCode)
	webAppURL := "https://lista-kappa-six.vercel.app"

	payload := map[string]interface{}{
		"chat_id":                  userID,
		"text":                     content.Text,
		"parse_mode":               "HTML",
		"disable_web_page_preview": false,
		"reply_markup": map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{
						"text": content.Button,
						"web_app": map[string]interface{}{
							"url": webAppURL,
						},
					},
				},
			},
		},
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[WelcomeBot] Error encoding JSON payload: %v", err)
		return
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", h.BotToken)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		log.Printf("[WelcomeBot] Error creating http request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[WelcomeBot] Error sending welcome message to Telegram user %d: %v", userID, err)
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusOK {
		log.Printf("[WelcomeBot] Welcome message sent successfully to user %d (lang: %s)", userID, langCode)
	} else {
		log.Printf("[WelcomeBot] Telegram API returned status %s for user %d: %s", resp.Status, userID, string(bodyBytes))
	}
}

// SyncListsPayload struct for saving lists
type SyncListsPayload struct {
	Lists   json.RawMessage `json:"lists"`
	Folders json.RawMessage `json:"folders"`
}

// GET /api/user/lists_sync
func (h *Handler) GetListsData(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromContext(r)
	if user == nil || user.ID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var listsData, foldersData []byte
	err := h.DB.Pool.QueryRow(r.Context(), "SELECT lists_data, folders_data FROM users WHERE id = $1", user.ID).Scan(&listsData, &foldersData)
	if err != nil {
		log.Printf("Error fetching lists for user %d: %v", user.ID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"lists":   json.RawMessage(listsData),
		"folders": json.RawMessage(foldersData),
	})
}

// POST /api/user/lists_sync
func (h *Handler) SaveListsData(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromContext(r)
	if user == nil || user.ID == 0 {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var payload SyncListsPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	if len(payload.Lists) == 0 {
		payload.Lists = []byte("[]")
	}
	if len(payload.Folders) == 0 {
		payload.Folders = []byte("[]")
	}

	_, err := h.DB.Pool.Exec(r.Context(), "UPDATE users SET lists_data = $1, folders_data = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", payload.Lists, payload.Folders, user.ID)
	if err != nil {
		log.Printf("Error updating lists for user %d: %v", user.ID, err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// GET /api/user/profile
func (h *Handler) GetProfile(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if err := h.ensureUser(r, user); err != nil {
		http.Error(w, `{"error":"failed to sync user"}`, http.StatusInternalServerError)
		return
	}

	ctx := r.Context()

	// Fetch full stored user info from DB
	var dbUser models.User
	userRow := h.DB.Pool.QueryRow(ctx, `
		SELECT id, username, first_name, last_name, photo_url, language_code, is_premium, allows_write_to_pm, visits_count, welcomed, created_at, updated_at
		FROM users WHERE id = $1
	`, user.ID)
	if err := userRow.Scan(
		&dbUser.ID, &dbUser.Username, &dbUser.FirstName, &dbUser.LastName,
		&dbUser.PhotoURL, &dbUser.LanguageCode, &dbUser.IsPremium, &dbUser.AllowsWriteToPM,
		&dbUser.VisitsCount, &dbUser.Welcomed, &dbUser.CreatedAt, &dbUser.UpdatedAt,
	); err == nil {
		user = &dbUser
	}

	// Aggregate counts by category
	catQuery := `
		SELECT category, COUNT(*) 
		FROM items 
		WHERE user_id = $1 
		GROUP BY category;
	`
	rows, err := h.DB.Pool.Query(ctx, catQuery, user.ID)
	// Start with zeroes for all known Russian categories
	categoriesMap := map[string]int{
		"Фильмы": 0, "Сериалы": 0, "Книги": 0, "Игры": 0,
	}

	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var count int
			if err := rows.Scan(&cat, &count); err == nil {
				// Normalize to Russian canonical key
				ruKey := mapCategoryToRu(cat)
				categoriesMap[ruKey] += count
			}
		}
	}

	var catList []models.CategoryCount
	for cat, count := range categoriesMap {
		catList = append(catList, models.CategoryCount{Category: cat, Count: count})
	}

	// Total & completed count
	var total, completed, watching, monthlyCount int
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1", user.ID).Scan(&total)
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND status = 'completed'", user.ID).Scan(&completed)
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND status = 'watching'", user.ID).Scan(&watching)
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)", user.ID).Scan(&monthlyCount)

	resp := models.UserProfileResponse{
		User:           *user,
		TotalItems:     total,
		CompletedCount: completed,
		WatchingCount:  watching,
		CurrentStreak:  0,
		MonthlyCount:   monthlyCount,
		MonthlyHours:   0,
		Categories:     catList,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GET /api/items?category=...&status=...&q=...
func (h *Handler) GetItems(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	category := r.URL.Query().Get("category")
	status := r.URL.Query().Get("status")
	q := strings.TrimSpace(r.URL.Query().Get("q"))

	// Auto-seed 20 initial items physically in user's language if user has 0 items
	if h.DB != nil && h.DB.Pool != nil {
		var itemCount int
		errCount := h.DB.Pool.QueryRow(r.Context(), "SELECT COUNT(*) FROM items WHERE user_id = $1", user.ID).Scan(&itemCount)
		if errCount == nil && itemCount == 0 {
			userLang := user.LanguageCode
			if userLang == "" {
				userLang = r.Header.Get("Accept-Language")
			}
			_ = SeedInitialUserData(r.Context(), h.DB, user.ID, userLang)
		}
	}

	query := `
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, public_rating, country, seasons, episodes_total, air_status, episodes_list, cast_roles, age_rating, budget, ai_enriched, started_at, completed_at, created_at, updated_at
		FROM items
		WHERE user_id = $1
	`
	args := []interface{}{user.ID}
	argID := 2

	if category != "" && category != "all" && category != "Все" {
		query += fmt.Sprintf(" AND (category = $%d OR category = $%d)", argID, argID+1)
		args = append(args, category, mapCategoryToEn(category))
		argID += 2
	}

	if status != "" && status != "all" && status != "Все" {
		query += fmt.Sprintf(" AND status = $%d", argID)
		args = append(args, mapStatusToEn(status))
		argID++
	}

	if q != "" {
		query += fmt.Sprintf(" AND (LOWER(title) LIKE $%d OR LOWER(genre) LIKE $%d)", argID, argID)
		args = append(args, "%"+strings.ToLower(q)+"%")
		argID++
	}

	query += " ORDER BY created_at DESC"

	rows, err := h.DB.Pool.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, `{"error":"failed to query items"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	items := []models.Item{}
	for rows.Next() {
		var item models.Item
		err := rows.Scan(
			&item.ID, &item.UserID, &item.Title, &item.Category, &item.Status, &item.Rating,
			&item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Note,
			&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.Author, &item.ISBN, &item.PublicRating, &item.Country,
			&item.Seasons, &item.EpisodesTotal, &item.AirStatus, &item.EpisodesList, &item.CastRoles, &item.AgeRating, &item.Budget, &item.AiEnriched,
			&item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
		)
		if err == nil {
			if strings.HasPrefix(item.PosterURL, "data:image/") || len(item.PosterURL) > 300 {
				v := item.UpdatedAt.Unix()
				item.PosterURL = fmt.Sprintf("%s/api/poster/%s?v=%d", baseURL, item.ID, v)
			}
			item.RawInput = ""
			items = append(items, item)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(items)
}

// POST /api/items
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if err := h.ensureUser(r, user); err != nil {
		http.Error(w, `{"error":"failed to sync user"}`, http.StatusInternalServerError)
		return
	}

	var req models.CreateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	titleTrimmed := strings.TrimSpace(req.Title)
	if titleTrimmed == "" {
		http.Error(w, `{"error":"title is required"}`, http.StatusBadRequest)
		return
	}

	cat := mapCategoryToEn(req.Category)

	// Check if user already has an item with the same title to prevent duplicates
	if h.DB != nil && h.DB.Pool != nil {
		checkQuery := `
			SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, public_rating, country, started_at, completed_at, created_at, updated_at
			FROM items
			WHERE user_id = $1 AND LOWER(TRIM(title)) = LOWER($2) AND (LOWER(TRIM(category)) = LOWER($3) OR LOWER(TRIM(category)) = LOWER($4))
		`
		args := []interface{}{user.ID, titleTrimmed, req.Category, cat}
		reqYear := strings.TrimSpace(req.ReleaseYear)
		if reqYear != "" {
			checkQuery += ` AND release_year = $5`
			args = append(args, reqYear)
		}
		checkQuery += ` LIMIT 1;`
		
		var existingItem models.Item
		err := h.DB.Pool.QueryRow(r.Context(), checkQuery, args...).Scan(
			&existingItem.ID, &existingItem.UserID, &existingItem.Title, &existingItem.Category, &existingItem.Status, &existingItem.Rating,
			&existingItem.Genre, &existingItem.Duration, &existingItem.ReleaseYear, &existingItem.PosterURL, &existingItem.Description, &existingItem.Note,
			&existingItem.RawInput, &existingItem.AIParsed, &existingItem.YoutubeURL, &existingItem.Director, &existingItem.Cast, &existingItem.Author, &existingItem.ISBN, &existingItem.PublicRating, &existingItem.Country, &existingItem.StartedAt, &existingItem.CompletedAt, &existingItem.CreatedAt, &existingItem.UpdatedAt,
		)
		if err == nil {
			// Item already exists for this user, return existing item without creating duplicate
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(existingItem)
			return
		}
	}

	status := mapStatusToEn(req.Status)
	itemUUID := uuid.New().String()

	var completedAt *time.Time
	if status == "completed" {
		now := time.Now()
		completedAt = &now
	}

	ytURL := strings.TrimSpace(req.YoutubeURL)
	if ytURL == "" && (cat == "movie" || cat == "show" || cat == "book") {
		if foundURL, err := youtube.SearchYouTube(h.YoutubeAPIKey, req.Title, cat); err == nil && foundURL != "" {
			ytURL = foundURL
		}
	}

	posterURL := strings.TrimSpace(req.PosterURL)

	directorVal := strings.TrimSpace(req.Director)
	castVal := strings.TrimSpace(req.Cast)
	genreVal := strings.TrimSpace(req.Genre)
	durationVal := strings.TrimSpace(req.Duration)
	releaseYearVal := strings.TrimSpace(req.ReleaseYear)
	descVal := strings.TrimSpace(req.Description)
	pubRatingVal := strings.TrimSpace(req.PublicRating)
	countryVal := mapCountryToFlag(strings.TrimSpace(req.Country))

	if (cat == "movie" || cat == "show") && (directorVal == "" || castVal == "" || durationVal == "" || genreVal == "" || releaseYearVal == "" || pubRatingVal == "" || countryVal == "") {
		if h.DB != nil && h.DB.Pool != nil {
			var dbDir, dbCast, dbDur, dbGenre, dbYear, dbPoster, dbDesc, dbRating, dbCountry string
			queryStr := `
				SELECT director, cast_members, duration, genre, release_year, poster_url, description, public_rating, country
				FROM items
				WHERE LOWER(TRIM(title)) = LOWER($1) AND (category IN ('movie','show') OR category = $2) AND (director != '' OR cast_members != '' OR public_rating != '' OR country != '')
			`
			args := []interface{}{titleTrimmed, cat}
			
			if releaseYearVal != "" {
				queryStr += ` AND (release_year = $3 OR release_year = '' OR release_year IS NULL)`
				args = append(args, releaseYearVal)
			}
			
			queryStr += `
				ORDER BY (CASE WHEN director != '' THEN 1 ELSE 0 END + CASE WHEN cast_members != '' THEN 1 ELSE 0 END + CASE WHEN public_rating != '' THEN 1 ELSE 0 END + CASE WHEN country != '' THEN 1 ELSE 0 END) DESC
				LIMIT 1
			`
			
			errScan := h.DB.Pool.QueryRow(r.Context(), queryStr, args...).Scan(&dbDir, &dbCast, &dbDur, &dbGenre, &dbYear, &dbPoster, &dbDesc, &dbRating, &dbCountry)
			if errScan == nil {
				if directorVal == "" {
					directorVal = dbDir
				}
				if castVal == "" {
					castVal = dbCast
				}
				if durationVal == "" {
					durationVal = dbDur
				}
				if genreVal == "" {
					genreVal = dbGenre
				}
				if releaseYearVal == "" {
					releaseYearVal = dbYear
				}
				if posterURL == "" {
					posterURL = dbPoster
				}
				if descVal == "" {
					descVal = dbDesc
				}
				if pubRatingVal == "" {
					pubRatingVal = dbRating
				}
				if countryVal == "" && dbCountry != "" {
					countryVal = mapCountryToFlag(dbCountry)
				}
			}
		}

		if directorVal == "" || castVal == "" || durationVal == "" || pubRatingVal == "" || countryVal == "" {
			if h.KinopoiskAPIKey != "" {
				kpResults := fetchKinopoiskInline(titleTrimmed, h.KinopoiskAPIKey, cat)
				if len(kpResults) > 0 {
					var best models.CatalogSearchResult
					found := false
					if releaseYearVal != "" {
						for _, res := range kpResults {
							if res.ReleaseYear == releaseYearVal {
								best = res
								found = true
								break
							}
						}
					}
					if !found {
						best = kpResults[0]
					}
					if directorVal == "" {
						directorVal = best.Director
					}
					if castVal == "" {
						castVal = best.Cast
					}
					if durationVal == "" {
						durationVal = best.Duration
					}
					if genreVal == "" {
						genreVal = best.Genre
					}
					if releaseYearVal == "" {
						releaseYearVal = best.ReleaseYear
					}
					if posterURL == "" {
						posterURL = best.PosterURL
					}
					if descVal == "" {
						descVal = best.Description
					}
					if pubRatingVal == "" {
						pubRatingVal = best.PublicRating
					}
					if countryVal == "" {
						countryVal = mapCountryToFlag(best.Country)
					}
				}
			}
			if (directorVal == "" || castVal == "" || pubRatingVal == "" || countryVal == "") && h.TMDBAPIKey != "" {
				targetLang := parser.DetectTargetLanguage(titleTrimmed, "")
				tmdbResults := fetchTMDbInline(titleTrimmed, h.TMDBAPIKey, cat, targetLang)
				if len(tmdbResults) > 0 {
					var best models.CatalogSearchResult
					found := false
					if releaseYearVal != "" {
						for _, res := range tmdbResults {
							if res.ReleaseYear == releaseYearVal {
								best = res
								found = true
								break
							}
						}
					}
					if !found {
						best = tmdbResults[0]
					}
					if directorVal == "" {
						directorVal = best.Director
					}
					if castVal == "" {
						castVal = best.Cast
					}
					if durationVal == "" {
						durationVal = best.Duration
					}
					if genreVal == "" {
						genreVal = best.Genre
					}
					if releaseYearVal == "" {
						releaseYearVal = best.ReleaseYear
					}
					if posterURL == "" {
						posterURL = best.PosterURL
					}
					if descVal == "" {
						descVal = best.Description
					}
					if pubRatingVal == "" {
						pubRatingVal = best.PublicRating
					}
					if countryVal == "" {
						countryVal = mapCountryToFlag(best.Country)
					}
				}
			}
		}
	}

	if posterURL != "" {
		posterURL = parser.OptimizePosterURL(nil, posterURL)
	}

	query := `
		INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, youtube_url, director, cast_members, author, isbn, public_rating, country, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
		RETURNING id, created_at, updated_at;
	`

	req.Title = limitStrLen(req.Title, 200)
	descVal = limitStrLen(descVal, 1000)
	req.Note = limitStrLen(req.Note, 1000)
	directorVal = limitStrLen(directorVal, 150)
	castVal = limitStrLen(castVal, 300)
	req.Author = limitStrLen(req.Author, 150)
	req.ISBN = limitStrLen(req.ISBN, 50)
	genreVal = limitStrLen(genreVal, 100)
	durationVal = limitStrLen(durationVal, 60)
	releaseYearVal = limitStrLen(releaseYearVal, 20)
	posterURL = limitStrLen(posterURL, 100000)
	ytURL = limitStrLen(ytURL, 500)
	countryVal = limitStrLen(countryVal, 100)

	var createdItem models.Item
	createdItem.ID = itemUUID
	createdItem.UserID = user.ID
	createdItem.Title = req.Title
	createdItem.Category = cat
	createdItem.Status = status
	createdItem.Rating = req.Rating
	createdItem.Genre = genreVal
	createdItem.Duration = durationVal
	createdItem.ReleaseYear = releaseYearVal
	createdItem.PosterURL = posterURL
	createdItem.Description = descVal
	createdItem.Note = req.Note
	createdItem.RawInput = req.RawInput
	createdItem.YoutubeURL = ytURL
	createdItem.Director = directorVal
	createdItem.Cast = castVal
	createdItem.Author = req.Author
	createdItem.ISBN = req.ISBN
	createdItem.PublicRating = pubRatingVal
	createdItem.Country = countryVal
	createdItem.CompletedAt = completedAt

	err := h.DB.Pool.QueryRow(
		r.Context(), query,
		itemUUID, user.ID, req.Title, cat, status, req.Rating,
		genreVal, durationVal, releaseYearVal, posterURL, descVal, req.Note, req.RawInput, ytURL, directorVal, castVal, req.Author, req.ISBN, pubRatingVal, countryVal, completedAt,
	).Scan(&createdItem.ID, &createdItem.CreatedAt, &createdItem.UpdatedAt)

	if err != nil {
		http.Error(w, `{"error":"failed to insert item"}`, http.StatusInternalServerError)
		return
	}

	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)

	if strings.HasPrefix(createdItem.PosterURL, "data:image/") || len(createdItem.PosterURL) > 300 {
		v := createdItem.UpdatedAt.Unix()
		createdItem.PosterURL = fmt.Sprintf("%s/api/poster/%s?v=%d", baseURL, createdItem.ID, v)
	}
	createdItem.RawInput = ""

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(createdItem)
}

// PUT /api/items/{id}
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, `{"error":"item id required"}`, http.StatusBadRequest)
		return
	}

	var req models.UpdateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid payload"}`, http.StatusBadRequest)
		return
	}

	query := "UPDATE items SET updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{itemID, user.ID}
	argIdx := 3

	if req.Title != nil {
		*req.Title = limitStrLen(*req.Title, 200)
		query += fmt.Sprintf(", title = $%d", argIdx)
		args = append(args, *req.Title)
		argIdx++
	}
	if req.Category != nil {
		query += fmt.Sprintf(", category = $%d", argIdx)
		args = append(args, mapCategoryToEn(*req.Category))
		argIdx++
	}
	if req.Status != nil {
		query += fmt.Sprintf(", status = $%d", argIdx)
		args = append(args, mapStatusToEn(*req.Status))
		argIdx++
	}
	if req.Rating != nil {
		query += fmt.Sprintf(", rating = $%d", argIdx)
		args = append(args, *req.Rating)
		argIdx++
	}
	if req.Genre != nil {
		*req.Genre = limitStrLen(*req.Genre, 100)
		query += fmt.Sprintf(", genre = $%d", argIdx)
		args = append(args, *req.Genre)
		argIdx++
	}
	if req.Duration != nil {
		*req.Duration = limitStrLen(*req.Duration, 60)
		query += fmt.Sprintf(", duration = $%d", argIdx)
		args = append(args, *req.Duration)
		argIdx++
	}
	if req.ReleaseYear != nil {
		*req.ReleaseYear = limitStrLen(*req.ReleaseYear, 20)
		query += fmt.Sprintf(", release_year = $%d", argIdx)
		args = append(args, *req.ReleaseYear)
		argIdx++
	}
	if req.PosterURL != nil {
		pURL := strings.TrimSpace(*req.PosterURL)
		if !strings.Contains(pURL, "/api/poster/"+itemID) {
			if pURL != "" {
				pURL = parser.OptimizePosterURL(nil, pURL)
			}
			pURL = limitStrLen(pURL, 100000)
			query += fmt.Sprintf(", poster_url = $%d", argIdx)
			args = append(args, pURL)
			argIdx++
		}
	}
	if req.Description != nil {
		*req.Description = limitStrLen(*req.Description, 1000)
		query += fmt.Sprintf(", description = $%d", argIdx)
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Note != nil {
		*req.Note = limitStrLen(*req.Note, 1000)
		query += fmt.Sprintf(", note = $%d", argIdx)
		args = append(args, *req.Note)
		argIdx++
	}
	if req.RawInput != nil {
		query += fmt.Sprintf(", raw_input = $%d", argIdx)
		args = append(args, *req.RawInput)
		argIdx++
	}
	if req.YoutubeURL != nil {
		*req.YoutubeURL = limitStrLen(*req.YoutubeURL, 500)
		query += fmt.Sprintf(", youtube_url = $%d", argIdx)
		args = append(args, *req.YoutubeURL)
		argIdx++
	}
	if req.Director != nil {
		*req.Director = limitStrLen(*req.Director, 150)
		query += fmt.Sprintf(", director = $%d", argIdx)
		args = append(args, *req.Director)
		argIdx++
	}
	if req.Cast != nil {
		*req.Cast = limitStrLen(*req.Cast, 300)
		query += fmt.Sprintf(", cast_members = $%d", argIdx)
		args = append(args, *req.Cast)
		argIdx++
	}
	if req.Author != nil {
		*req.Author = limitStrLen(*req.Author, 150)
		query += fmt.Sprintf(", author = $%d", argIdx)
		args = append(args, *req.Author)
		argIdx++
	}
	if req.ISBN != nil {
		*req.ISBN = limitStrLen(*req.ISBN, 50)
		query += fmt.Sprintf(", isbn = $%d", argIdx)
		args = append(args, *req.ISBN)
		argIdx++
	}
	if req.PublicRating != nil {
		query += fmt.Sprintf(", public_rating = $%d", argIdx)
		args = append(args, *req.PublicRating)
		argIdx++
	}
	if req.Country != nil {
		*req.Country = limitStrLen(*req.Country, 100)
		query += fmt.Sprintf(", country = $%d", argIdx)
		mappedCountry := mapCountryToFlag(*req.Country)
		args = append(args, mappedCountry)
		argIdx++
	}
	if req.Seasons != nil {
		query += fmt.Sprintf(", seasons = $%d", argIdx)
		args = append(args, *req.Seasons)
		argIdx++
	}
	if req.EpisodesTotal != nil {
		query += fmt.Sprintf(", episodes_total = $%d", argIdx)
		args = append(args, *req.EpisodesTotal)
		argIdx++
	}
	if req.AirStatus != nil {
		*req.AirStatus = limitStrLen(*req.AirStatus, 100)
		query += fmt.Sprintf(", air_status = $%d", argIdx)
		args = append(args, *req.AirStatus)
		argIdx++
	}
	if req.EpisodesList != nil {
		query += fmt.Sprintf(", episodes_list = $%d", argIdx)
		args = append(args, *req.EpisodesList)
		argIdx++
	}
	if req.CastRoles != nil {
		*req.CastRoles = limitStrLen(*req.CastRoles, 1000)
		query += fmt.Sprintf(", cast_roles = $%d", argIdx)
		args = append(args, *req.CastRoles)
		argIdx++
	}
	if req.AgeRating != nil {
		*req.AgeRating = limitStrLen(*req.AgeRating, 20)
		query += fmt.Sprintf(", age_rating = $%d", argIdx)
		args = append(args, *req.AgeRating)
		argIdx++
	}
	if req.Budget != nil {
		*req.Budget = limitStrLen(*req.Budget, 50)
		query += fmt.Sprintf(", budget = $%d", argIdx)
		args = append(args, *req.Budget)
		argIdx++
	}
	if req.AiEnriched != nil {
		query += fmt.Sprintf(", ai_enriched = $%d", argIdx)
		args = append(args, *req.AiEnriched)
		argIdx++
	}

	query += " WHERE id = $1 AND (user_id = $2 OR (user_id = 0 AND $2 = 214993606))"

	res, err := h.DB.Pool.Exec(r.Context(), query, args...)
	if err != nil {
		log.Printf("UpdateItem SQL error: %v (query: %s)", err, query)
		http.Error(w, `{"error":"item not found or update failed"}`, http.StatusNotFound)
		return
	}
	if res.RowsAffected() == 0 {
		log.Printf("UpdateItem returned 0 rows affected (query: %s)", query)
		http.Error(w, `{"error":"item not found or update failed"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// DELETE /api/items/{id}
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, `{"error":"item id required"}`, http.StatusBadRequest)
		return
	}

	res, err := h.DB.Pool.Exec(r.Context(), "DELETE FROM items WHERE id = $1 AND (user_id = $2 OR (user_id = 0 AND $2 = 214993606))", itemID, user.ID)
	if err != nil || res.RowsAffected() == 0 {
		http.Error(w, `{"error":"item not found or delete failed"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// POST /api/items/{id}/enrich — fetches extended metadata from TMDB and saves it to the item
func (h *Handler) EnrichItem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, `{"error":"item id required"}`, http.StatusBadRequest)
		return
	}

	// Fetch the item from DB to get title, year, category, duration, country, director, cast, description
	var title, category, releaseYear, currentDuration, currentCountry, currentDirector, currentCast, currentDescription string
	var alreadyEnriched bool
	err := h.DB.Pool.QueryRow(r.Context(),
		"SELECT title, category, release_year, COALESCE(duration, ''), COALESCE(country, ''), COALESCE(director, ''), COALESCE(cast_members, ''), COALESCE(description, ''), COALESCE(ai_enriched, FALSE) FROM items WHERE id = $1 AND user_id = $2",
		itemID, user.ID,
	).Scan(&title, &category, &releaseYear, &currentDuration, &currentCountry, &currentDirector, &currentCast, &currentDescription, &alreadyEnriched)
	if err != nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}

	if h.TMDBAPIKey == "" {
		http.Error(w, `{"error":"TMDB API key not configured"}`, http.StatusServiceUnavailable)
		return
	}

	lang := r.URL.Query().Get("lang")

	// Fetch enriched data
	enriched := parser.FetchEnrichedDetails(h.TMDBAPIKey, title, releaseYear, category, lang, h.FireworksAPIKey, currentDirector, currentCast, currentDescription)
	if enriched == nil {
		// TMDB failed or returned nothing (e.g. strict title mismatch or missing in TMDB). Let's create an empty object and let AI fill with context!
		enriched = &parser.EnrichedDetails{}
	}

	if currentDirector != "" {
		enriched.Director = currentDirector
	}

	// Call AI to translate, transliterate and fill missing data with full context
	parser.TranslateAndFillWithAI(h.FireworksAPIKey, lang, title, releaseYear, currentCountry, currentDirector, currentCast, currentDescription, enriched)

	// If after AI it's STILL basically empty, then return no_data
	if enriched.Seasons == 0 && enriched.EpisodesTotal == 0 && enriched.AirStatus == "" && enriched.EpisodesList == "" && enriched.CastRoles == "" && enriched.Cast == "" && enriched.Budget == "" && enriched.Duration == "" && enriched.Country == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "no_data", "ai_enriched": true})
		// Still mark as enriched so button becomes disabled
		_, _ = h.DB.Pool.Exec(r.Context(),
			"UPDATE items SET ai_enriched = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2",
			itemID, user.ID,
		)
		return
	}

	// Build update query dynamically
	updateQuery := "UPDATE items SET ai_enriched = TRUE, updated_at = CURRENT_TIMESTAMP"
	updateArgs := []interface{}{itemID, user.ID}
	argIdx := 3

	if enriched.Seasons > 0 {
		updateQuery += fmt.Sprintf(", seasons = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.Seasons)
		argIdx++
	}
	if enriched.EpisodesTotal > 0 {
		updateQuery += fmt.Sprintf(", episodes_total = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.EpisodesTotal)
		argIdx++
	}
	if enriched.AirStatus != "" {
		updateQuery += fmt.Sprintf(", air_status = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.AirStatus)
		argIdx++
	}
	if enriched.EpisodesList != "" {
		updateQuery += fmt.Sprintf(", episodes_list = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.EpisodesList)
		argIdx++
	}
	if enriched.CastRoles != "" {
		updateQuery += fmt.Sprintf(", cast_roles = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.CastRoles)
		argIdx++
	}
	if enriched.Cast != "" {
		updateQuery += fmt.Sprintf(", cast_members = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.Cast)
		argIdx++
	}

	directorUpdated := false
	if enriched.Director != "" {
		updateQuery += fmt.Sprintf(", director = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.Director)
		argIdx++
		directorUpdated = true
	}

	if enriched.Budget != "" {
		updateQuery += fmt.Sprintf(", budget = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.Budget)
		argIdx++
	}

	countryUpdated := false
	if enriched.Country != "" && currentCountry == "" {
		mappedCountry := mapCountryToFlag(enriched.Country)
		if mappedCountry != "" {
			updateQuery += fmt.Sprintf(", country = $%d", argIdx)
			updateArgs = append(updateArgs, mappedCountry)
			argIdx++
			countryUpdated = true
		}
	}

	durationUpdated := false
	if enriched.Duration != "" && (currentDuration == "" || currentDuration == "-" || currentDuration == "0" || strings.Contains(currentDuration, "1619")) {
		updateQuery += fmt.Sprintf(", duration = $%d", argIdx)
		updateArgs = append(updateArgs, enriched.Duration)
		argIdx++
		durationUpdated = true
	}

	updateQuery += " WHERE id = $1 AND user_id = $2"

	_, err = h.DB.Pool.Exec(r.Context(), updateQuery, updateArgs...)
	if err != nil {
		log.Printf("[EnrichItem] DB error for item %s: %v", itemID, err)
		http.Error(w, `{"error":"failed to save enriched data"}`, http.StatusInternalServerError)
		return
	}

	ret := map[string]interface{}{
		"status":         "ok",
		"ai_enriched":    true,
		"seasons":        enriched.Seasons,
		"episodes_total": enriched.EpisodesTotal,
		"air_status":     enriched.AirStatus,
		"episodes_list":  enriched.EpisodesList,
		"cast_roles":     enriched.CastRoles,
		"budget":         enriched.Budget,
	}
	if enriched.Cast != "" {
		ret["cast"] = enriched.Cast
	}
	if directorUpdated || enriched.Director != "" {
		ret["director"] = enriched.Director
	}
	if durationUpdated {
		ret["duration"] = enriched.Duration
	} else if currentDuration != "" {
		ret["duration"] = currentDuration
	} else if enriched.Duration != "" {
		ret["duration"] = enriched.Duration
	}
	if countryUpdated || enriched.Country != "" {
		ret["country"] = mapCountryToFlag(enriched.Country)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ret)
}

// GET /api/stats
func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.GetUserFromContext(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	ctx := r.Context()
	var total, completed, monthlyAdded int
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1", user.ID).Scan(&total)
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND status = 'completed'", user.ID).Scan(&completed)
	_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)", user.ID).Scan(&monthlyAdded)

	catQuery := `SELECT category, COUNT(*) FROM items WHERE user_id = $1 GROUP BY category`
	rows, err := h.DB.Pool.Query(ctx, catQuery, user.ID)
	catCounts := make(map[string]int)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cat string
			var count int
			if err := rows.Scan(&cat, &count); err == nil {
				ruCat := mapCategoryToRu(cat)
				catCounts[ruCat] += count
			}
		}
	}

	catPct := make(map[string]float64)
	if total > 0 {
		for cat, count := range catCounts {
			catPct[cat] = float64(count*100) / float64(total)
		}
	}

	resp := models.StatsResponse{
		TotalItems:         total,
		CompletedItems:     completed,
		TotalHours:         completed * 2, // estimated
		MonthlyAdded:       monthlyAdded,
		GrowthPercentage:   0,
		CategoryPercentage: catPct,
		WeeklyActivity:     []int{0, 0, 0, 0, 0, 0, 0},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func mapCategoryToRu(cat string) string {
	switch strings.ToLower(cat) {
	case "movie", "movies", "фильмы":
		return "Фильмы"
	case "show", "shows", "series", "сериалы":
		return "Сериалы"
	case "book", "books", "книги":
		return "Книги"
	case "game", "games", "игры":
		return "Игры"
	default:
		return cat
	}
}

func mapCategoryToEn(cat string) string {
	switch strings.ToLower(cat) {
	case "фильмы", "фильм", "movie", "movies":
		return "movie"
	case "сериалы", "сериал", "show", "shows", "series":
		return "show"
	case "книги", "книга", "book", "books":
		return "book"
	case "игры", "игра", "game", "games":
		return "game"
	default:
		return cat
	}
}

func mapStatusToEn(st string) string {
	switch strings.ToLower(st) {
	case "смотрю", "watching":
		return "watching"
	case "просмотрено", "completed":
		return "completed"
	case "отложено", "planned":
		return "planned"
	case "пауза", "paused":
		return "paused"
	default:
		return st
	}
}

func getCategoryPriority(cat string, selectedCat string) int {
	targetCatEn := mapCategoryToEn(selectedCat)
	if targetCatEn == "" || targetCatEn == "all" || targetCatEn == "Все" {
		return 1
	}

	cEn := mapCategoryToEn(cat)

	isBook := cEn == "book"
	isMovieOrShow := cEn == "movie" || cEn == "show"
	isGame := cEn == "game"

	switch targetCatEn {
	case "book":
		if isBook {
			return 1
		}
		if isMovieOrShow {
			return 2
		}
		return 3
	case "movie", "show":
		if isMovieOrShow {
			return 1
		}
		if isBook {
			return 2
		}
		return 3
	case "game":
		if isGame {
			return 1
		}
		return 2
	default:
		return 1
	}
}

func parseSearchQuery(input string) (string, string) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", ""
	}

	bookKeywords := map[string]bool{
		"книга": true, "книги": true, "книгу": true, "книге": true, "книгам": true, "книгах": true,
		"книжный": true, "книжная": true, "книжное": true, "book": true, "books": true,
	}
	gameKeywords := map[string]bool{
		"игра": true, "игры": true, "игру": true, "игре": true, "играм": true, "играх": true,
		"игровой": true, "игровая": true, "игровое": true, "game": true, "games": true,
	}
	movieKeywords := map[string]bool{
		"фильм": true, "фильмы": true, "фильма": true, "фильму": true, "фильмов": true, "фильме": true,
		"кино": true, "movie": true, "movies": true, "film": true,
	}
	showKeywords := map[string]bool{
		"сериал": true, "сериалы": true, "сериала": true, "сериалу": true, "сериалов": true, "сериале": true,
		"show": true, "shows": true, "series": true, "tv": true,
	}

	words := strings.Fields(input)
	var cleanWords []string
	detectedCat := ""

	for _, word := range words {
		cleanW := strings.ToLower(strings.Trim(word, `.,!?:;"'()[]{}«»`))
		if cleanW == "" {
			continue
		}

		if detectedCat == "" {
			if bookKeywords[cleanW] {
				detectedCat = "book"
				continue
			}
			if gameKeywords[cleanW] {
				detectedCat = "game"
				continue
			}
			if movieKeywords[cleanW] {
				detectedCat = "movie"
				continue
			}
			if showKeywords[cleanW] {
				detectedCat = "show"
				continue
			}
		} else {
			if bookKeywords[cleanW] || gameKeywords[cleanW] || movieKeywords[cleanW] || showKeywords[cleanW] {
				continue
			}
		}

		cleanWords = append(cleanWords, word)
	}

	cleanQuery := strings.Join(cleanWords, " ")
	cleanQuery = strings.TrimSpace(cleanQuery)

	if cleanQuery == "" {
		cleanQuery = input
	}

	return detectedCat, cleanQuery
}


func (h *Handler) GetPublicItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, `{"error":"item id required"}`, http.StatusBadRequest)
		return
	}

	query := `
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, public_rating, country, started_at, completed_at, created_at, updated_at
		FROM items WHERE id = $1 LIMIT 1;
	`

	var item models.Item
	err := h.DB.Pool.QueryRow(r.Context(), query, itemID).Scan(
		&item.ID, &item.UserID, &item.Title, &item.Category, &item.Status, &item.Rating,
		&item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Note,
		&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.Author, &item.ISBN, &item.PublicRating, &item.Country, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
	)

	if err != nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}

	if strings.HasPrefix(item.PosterURL, "data:image/") || len(item.PosterURL) > 300 {
		scheme := "http"
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		baseURL := fmt.Sprintf("%s://%s", scheme, r.Host)
		v := item.UpdatedAt.Unix()
		item.PosterURL = fmt.Sprintf("%s/api/poster/%s?v=%d", baseURL, item.ID, v)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

// GET /api/youtube/search?q=...&category=...
func (h *Handler) SearchYouTube(w http.ResponseWriter, r *http.Request) {
	rateKey := getRateLimitKey(r)
	isAdmin := false
	if user, ok := auth.GetUserFromContext(r); ok && user != nil {
		isAdmin = (user.ID == 214993606 || strings.EqualFold(user.Username, "neznayca"))
	}
	if !isAdmin && rateKey == "user_214993606" {
		isAdmin = true
	}

	if !isAdmin {
		// 1. Check AutoJail
		if h.AutoJail != nil {
			if jailed, rem := h.AutoJail.IsJailed(rateKey); jailed {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", strconv.Itoa(int(rem.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":   "rate_limit_exceeded",
					"message": fmt.Sprintf("Доступ временно ограничен за превышение лимитов. Пожалуйста, подождите %d мин.", int(rem.Minutes())+1),
				})
				return
			}
		}

		// 2. Search Rate Limiter: max 20 requests per minute per user/IP
		if h.SearchLimiter != nil {
			if allowed, wait := h.SearchLimiter.AllowSearch(rateKey); !allowed {
				if h.AutoJail != nil {
					h.AutoJail.Record429(rateKey)
				}
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":               "Слишком много поисковых запросов. Пожалуйста, подождите немного перед следующим поиском.",
					"retry_after_seconds": int(wait.Seconds()),
				})
				return
			}
		}
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	cat := strings.TrimSpace(r.URL.Query().Get("category"))
	if q == "" {
		http.Error(w, `{"error":"q parameter is required"}`, http.StatusBadRequest)
		return
	}
	if len(q) > 150 {
		q = q[:150]
	}

	// 3. Check Cache
	cacheKey := fmt.Sprintf("yt:%s:%s", strings.ToLower(q), strings.ToLower(cat))
	if cachedVal, ok := h.SearchCache.Get(cacheKey); ok {
		if ytURL, isStr := cachedVal.(string); isStr {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"youtube_url": ytURL,
			})
			return
		}
	}

	ytURL, err := youtube.SearchYouTube(h.YoutubeAPIKey, q, cat)
	if err != nil {
		log.Printf("YouTube search error: %v", err)
	}

	if ytURL != "" {
		h.SearchCache.Set(cacheKey, ytURL)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"youtube_url": ytURL,
	})
}

