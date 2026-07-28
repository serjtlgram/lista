package handlers

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"lista-backend/pkg/auth"
	"lista-backend/pkg/db"
	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
	"lista-backend/pkg/youtube"
)

type Handler struct {
	DB              *db.DB
	BotToken        string
	YoutubeAPIKey   string
	TMDBAPIKey      string
	KinopoiskAPIKey string
}

func NewHandler(database *db.DB, botToken string, youtubeAPIKey string, tmdbAPIKey string, kinopoiskAPIKey string) *Handler {
	h := &Handler{
		DB:              database,
		BotToken:        botToken,
		YoutubeAPIKey:   youtubeAPIKey,
		TMDBAPIKey:      tmdbAPIKey,
		KinopoiskAPIKey: kinopoiskAPIKey,
	}
	go h.InitBotCommandsAndMenu()
	return h
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
				"url": "https://serjtlgram.github.io/lista/",
			},
		},
	}
	if err := h.sendBotAPIRequestWithErr("setChatMenuButton", menuPayload); err != nil {
		log.Printf("[BotMenuInit] Error setting chat menu button: %v", err)
	} else {
		log.Printf("[BotMenuInit] Chat menu button set successfully to https://serjtlgram.github.io/lista/")
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

LISTA — твій персональний міні-додаток для збереження вражень від фільмів, серіалів, книг, аудіокниг, подкастів та ігор.

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

LISTA es tu mini-aplicación personal para guardar impresiones de películas, series, libros, audiolibros, podcasts y juegos.

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

LISTA is your personal mini-app for tracking movies, TV shows, books, audiobooks, podcasts, and games.

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

LISTA — твое персональное мини-приложение для сохранения впечатлений от фильмов, сериалов, книг, аудиокниг, подкастов и игр.

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
	appURL := "https://t.me/manytgbot?startapp=true"

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
						"url":  appURL,
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
		"Фильмы": 0, "Сериалы": 0, "Книги": 0, "Аудиокниги": 0, "Подкасты": 0, "Игры": 0,
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

	query := `
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, started_at, completed_at, created_at, updated_at
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

	items := []models.Item{}
	for rows.Next() {
		var item models.Item
		err := rows.Scan(
			&item.ID, &item.UserID, &item.Title, &item.Category, &item.Status, &item.Rating,
			&item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Note,
			&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.Author, &item.ISBN, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
		)
		if err == nil {
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
			SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, started_at, completed_at, created_at, updated_at
			FROM items
			WHERE user_id = $1 AND LOWER(TRIM(title)) = LOWER($2)
			LIMIT 1;
		`
		var existingItem models.Item
		err := h.DB.Pool.QueryRow(r.Context(), checkQuery, user.ID, titleTrimmed).Scan(
			&existingItem.ID, &existingItem.UserID, &existingItem.Title, &existingItem.Category, &existingItem.Status, &existingItem.Rating,
			&existingItem.Genre, &existingItem.Duration, &existingItem.ReleaseYear, &existingItem.PosterURL, &existingItem.Description, &existingItem.Note,
			&existingItem.RawInput, &existingItem.AIParsed, &existingItem.YoutubeURL, &existingItem.Director, &existingItem.Cast, &existingItem.Author, &existingItem.ISBN, &existingItem.StartedAt, &existingItem.CompletedAt, &existingItem.CreatedAt, &existingItem.UpdatedAt,
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
	if ytURL == "" && (cat == "movie" || cat == "show" || cat == "book" || cat == "audiobook") {
		if foundURL, err := youtube.SearchYouTube(h.YoutubeAPIKey, req.Title, cat); err == nil && foundURL != "" {
			ytURL = foundURL
		}
	}

	posterURL := strings.TrimSpace(req.PosterURL)
	if posterURL != "" {
		posterURL = parser.OptimizePosterURL(nil, posterURL)
	}

	query := `
		INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, youtube_url, director, cast_members, author, isbn, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		RETURNING id, created_at, updated_at;
	`

	var createdItem models.Item
	createdItem.ID = itemUUID
	createdItem.UserID = user.ID
	createdItem.Title = req.Title
	createdItem.Category = cat
	createdItem.Status = status
	createdItem.Rating = req.Rating
	createdItem.Genre = req.Genre
	createdItem.Duration = req.Duration
	createdItem.ReleaseYear = req.ReleaseYear
	createdItem.PosterURL = req.PosterURL
	createdItem.Description = req.Description
	createdItem.Note = req.Note
	createdItem.RawInput = req.RawInput
	createdItem.YoutubeURL = ytURL
	createdItem.Director = req.Director
	createdItem.Cast = req.Cast
	createdItem.Author = req.Author
	createdItem.ISBN = req.ISBN
	createdItem.CompletedAt = completedAt

	err := h.DB.Pool.QueryRow(
		r.Context(), query,
		itemUUID, user.ID, req.Title, cat, status, req.Rating,
		req.Genre, req.Duration, req.ReleaseYear, req.PosterURL, req.Description, req.Note, req.RawInput, ytURL, req.Director, req.Cast, req.Author, req.ISBN, completedAt,
	).Scan(&createdItem.ID, &createdItem.CreatedAt, &createdItem.UpdatedAt)

	if err != nil {
		http.Error(w, `{"error":"failed to insert item"}`, http.StatusInternalServerError)
		return
	}

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
		query += fmt.Sprintf(", genre = $%d", argIdx)
		args = append(args, *req.Genre)
		argIdx++
	}
	if req.Duration != nil {
		query += fmt.Sprintf(", duration = $%d", argIdx)
		args = append(args, *req.Duration)
		argIdx++
	}
	if req.ReleaseYear != nil {
		query += fmt.Sprintf(", release_year = $%d", argIdx)
		args = append(args, *req.ReleaseYear)
		argIdx++
	}
	if req.PosterURL != nil {
		pURL := strings.TrimSpace(*req.PosterURL)
		if pURL != "" {
			pURL = parser.OptimizePosterURL(nil, pURL)
		}
		query += fmt.Sprintf(", poster_url = $%d", argIdx)
		args = append(args, pURL)
		argIdx++
	}
	if req.Description != nil {
		query += fmt.Sprintf(", description = $%d", argIdx)
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Note != nil {
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
		query += fmt.Sprintf(", youtube_url = $%d", argIdx)
		args = append(args, *req.YoutubeURL)
		argIdx++
	}
	if req.Director != nil {
		query += fmt.Sprintf(", director = $%d", argIdx)
		args = append(args, *req.Director)
		argIdx++
	}
	if req.Cast != nil {
		query += fmt.Sprintf(", cast_members = $%d", argIdx)
		args = append(args, *req.Cast)
		argIdx++
	}
	if req.Author != nil {
		query += fmt.Sprintf(", author = $%d", argIdx)
		args = append(args, *req.Author)
		argIdx++
	}
	if req.ISBN != nil {
		query += fmt.Sprintf(", isbn = $%d", argIdx)
		args = append(args, *req.ISBN)
		argIdx++
	}

	query += " WHERE id = $1 AND user_id = $2"

	res, err := h.DB.Pool.Exec(r.Context(), query, args...)
	if err != nil || res.RowsAffected() == 0 {
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

	res, err := h.DB.Pool.Exec(r.Context(), "DELETE FROM items WHERE id = $1 AND user_id = $2", itemID, user.ID)
	if err != nil || res.RowsAffected() == 0 {
		http.Error(w, `{"error":"item not found or delete failed"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
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
	case "audiobook", "audiobooks", "аудиокниги":
		return "Аудиокниги"
	case "podcast", "podcasts", "подкасты":
		return "Подкасты"
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
	case "аудиокниги", "аудиокнига", "audiobook", "audiobooks":
		return "audiobook"
	case "подкасты", "подкаст", "podcast", "podcasts":
		return "podcast"
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
	isAudiobook := cEn == "audiobook"
	isMovieOrShow := cEn == "movie" || cEn == "show"
	isPodcast := cEn == "podcast"
	isGame := cEn == "game"

	switch targetCatEn {
	case "audiobook":
		if isAudiobook {
			return 1
		}
		if isBook {
			return 2
		}
		if isMovieOrShow {
			return 3
		}
		return 4
	case "book":
		if isBook {
			return 1
		}
		if isAudiobook {
			return 2
		}
		if isMovieOrShow {
			return 3
		}
		return 4
	case "movie", "show":
		if isMovieOrShow {
			return 1
		}
		if isBook || isAudiobook {
			return 2
		}
		return 3
	case "podcast":
		if isPodcast {
			return 1
		}
		return 2
	case "game":
		if isGame {
			return 1
		}
		return 2
	default:
		return 1
	}
}

// GET /api/catalog/search?q=Title
func (h *Handler) SearchCatalog(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]models.CatalogSearchResult{})
		return
	}

	category := r.URL.Query().Get("category")

	query := `
		SELECT DISTINCT ON (LOWER(title)) id::text, title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn
		FROM items
		WHERE LOWER(title) LIKE $1
	`
	args := []interface{}{"%" + strings.ToLower(q) + "%"}
	query += " ORDER BY LOWER(title), created_at DESC LIMIT 15;"

	results := []models.CatalogSearchResult{}
	seenTitles := make(map[string]bool)

	if h.DB != nil && h.DB.Pool != nil {
		rows, err := h.DB.Pool.Query(r.Context(), query, args...)
		if err == nil && rows != nil {
			for rows.Next() {
				var res models.CatalogSearchResult
				if err := rows.Scan(&res.ID, &res.Title, &res.Category, &res.Genre, &res.Duration, &res.ReleaseYear, &res.PosterURL, &res.Description, &res.YoutubeURL, &res.Director, &res.Cast, &res.Author, &res.ISBN); err == nil {
					res.Source = "db"
					tKey := strings.ToLower(strings.TrimSpace(res.Title)) + "_" + mapCategoryToEn(res.Category)
					if !seenTitles[tKey] {
						seenTitles[tKey] = true
						results = append(results, res)
					}
				}
			}
			rows.Close()
		}
	}

	// 2. Online search — books and audiobooks multi-source
	catEn := mapCategoryToEn(category)
	bookItems := parser.SearchBooksMultiSource(q)
	for _, item := range bookItems {
		tKey := strings.ToLower(strings.TrimSpace(item.Title)) + "_" + mapCategoryToEn(item.Category)
		if !seenTitles[tKey] {
			seenTitles[tKey] = true
			item.Source = "online"
			results = append(results, item)
			go h.saveCatalogItemToDB(item)
		}
	}

	if catEn != "book" && catEn != "audiobook" {
		onlineItems := h.searchInlineResults(q, "ru")
		for _, item := range onlineItems {
			tKey := strings.ToLower(strings.TrimSpace(item.Title)) + "_" + mapCategoryToEn(item.Category)
			if !seenTitles[tKey] {
				seenTitles[tKey] = true
				item.Source = "online"
				results = append(results, item)
				go h.saveCatalogItemToDB(item)
			}
		}
	}

	// Priority Sort based on active screen category
	if category != "" && category != "all" && category != "Все" {
		sort.SliceStable(results, func(i, j int) bool {
			prioI := getCategoryPriority(results[i].Category, category)
			prioJ := getCategoryPriority(results[j].Category, category)
			return prioI < prioJ
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// GET /api/public/items/{id}
func (h *Handler) GetPublicItem(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, `{"error":"item id required"}`, http.StatusBadRequest)
		return
	}

	query := `
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, author, isbn, started_at, completed_at, created_at, updated_at
		FROM items WHERE id = $1 LIMIT 1;
	`

	var item models.Item
	err := h.DB.Pool.QueryRow(r.Context(), query, itemID).Scan(
		&item.ID, &item.UserID, &item.Title, &item.Category, &item.Status, &item.Rating,
		&item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Note,
		&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.Author, &item.ISBN, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
	)

	if err != nil {
		http.Error(w, `{"error":"item not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(item)
}

// GET /api/youtube/search?q=...&category=...
func (h *Handler) SearchYouTube(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	cat := strings.TrimSpace(r.URL.Query().Get("category"))
	if q == "" {
		http.Error(w, `{"error":"q parameter is required"}`, http.StatusBadRequest)
		return
	}

	ytURL, err := youtube.SearchYouTube(h.YoutubeAPIKey, q, cat)
	if err != nil {
		log.Printf("YouTube search error: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"youtube_url": ytURL,
	})
}

// POST /api/telegram/webhook
func (h *Handler) HandleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	var update models.TelegramUpdate
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	if update.CallbackQuery != nil && update.CallbackQuery.From.ID != 0 {
		h.handleCallbackQuery(update.CallbackQuery)
		w.WriteHeader(http.StatusOK)
		return
	}

	if update.InlineQuery != nil && update.InlineQuery.ID != "" {
		h.handleInlineQuery(update.InlineQuery)
		w.WriteHeader(http.StatusOK)
		return
	}

	if update.ChosenInlineResult != nil {
		h.handleChosenInlineResult(update.ChosenInlineResult)
		w.WriteHeader(http.StatusOK)
		return
	}

	if update.Message != nil && update.Message.From != nil {
		userID := update.Message.From.ID
		msgText := strings.TrimSpace(update.Message.Text)
		if msgText == "" {
			msgText = strings.TrimSpace(update.Message.Caption)
		}

		log.Printf("[TelegramWebhook] Incoming message from %d: %q", userID, msgText)

		if strings.HasPrefix(msgText, "/start") {
			if h.DB != nil && h.DB.Pool != nil {
				query := `
					INSERT INTO users (id, username, first_name, last_name, welcomed, updated_at)
					VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
					ON CONFLICT (id) DO UPDATE SET
						username = EXCLUDED.username,
						first_name = EXCLUDED.first_name,
						last_name = EXCLUDED.last_name,
						welcomed = true,
						updated_at = CURRENT_TIMESTAMP;
				`
				_, _ = h.DB.Pool.Exec(r.Context(), query, userID, update.Message.From.Username, update.Message.From.FirstName, update.Message.From.LastName)
			}

			// Always send welcome message when user explicitly presses /start command
			langCode := update.Message.From.LanguageCode
			go h.sendWelcomeMessage(userID, langCode)
		} else if extractedURL := parser.ExtractFirstURL(msgText); extractedURL != "" {
			log.Printf("[TelegramWebhook] Extracted URL from user %d: %s", userID, extractedURL)
			go h.processIncomingMediaURL(userID, update.Message.From, extractedURL)
		}
	}

	w.WriteHeader(http.StatusOK)
}

var topGenres = []struct {
	Label string
	Val   string
}{
	{"Драма", "Драма"},
	{"Комедия", "Комедия"},
	{"Детектив", "Детектив"},
	{"Боевик", "Боевик"},
	{"Триллер", "Триллер"},
	{"Ужасы", "Ужасы"},
	{"Фантастика", "Фантастика"},
	{"Приключения", "Приключения"},
	{"Фэнтези", "Фэнтези"},
	{"Мультфильмы", "Мультфильмы"},
	{"Шоу", "Шоу"},
	{"Другое", "Другое"},
}

var bookGenres = []struct {
	Label string
	Val   string
}{
	{"Sci-Fi", "Sci-Fi"},
	{"Фэнтези", "Фэнтези"},
	{"Приключения", "Приключения"},
	{"Нон-фикшн", "Нон-фикшн"},
	{"Любовный", "Любовный"},
	{"Исторический", "Исторический"},
	{"Биография", "Биография"},
	{"Юмор", "Юмор"},
	{"Драма", "Драма"},
	{"Детектив", "Детектив"},
	{"Триллер", "Триллер"},
	{"Ужасы", "Ужасы"},
}

func mapStatusToRu(status string, category ...string) string {
	cat := ""
	if len(category) > 0 {
		cat = mapCategoryToEn(category[0])
	}
	switch strings.ToLower(status) {
	case "planned", "в планах", "у планах":
		return "📋 В планах"
	case "watching", "смотрю", "читаю", "слушаю", "дивлюсь":
		if cat == "audiobook" {
			return "🎧 Слушаю"
		} else if cat == "book" {
			return "📖 Читаю"
		}
		return "👁 Смотрю"
	case "completed", "просмотрено", "завершено", "прочитано", "прослушано":
		if cat == "audiobook" {
			return "✅ Прослушано"
		} else if cat == "book" {
			return "✅ Прочитано"
		}
		return "✅ Завершено"
	default:
		return "📋 В планах"
	}
}

func (h *Handler) handleCallbackQuery(cb *struct {
	ID   string `json:"id"`
	From struct {
		ID           int64  `json:"id"`
		FirstName    string `json:"first_name"`
		Username     string `json:"username"`
		LanguageCode string `json:"language_code"`
	} `json:"from"`
	Message *struct {
		MessageID int `json:"message_id"`
		Chat      *struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text    string `json:"text"`
		Caption string `json:"caption"`
	} `json:"message"`
	Data string `json:"data"`
}) {
	if cb == nil || cb.Data == "" || cb.Message == nil || cb.Message.Chat == nil {
		return
	}

	userID := cb.From.ID
	chatID := cb.Message.Chat.ID
	messageID := cb.Message.MessageID

	if strings.HasPrefix(cb.Data, "c:") {
		parts := strings.Split(cb.Data, ":")
		if len(parts) >= 3 {
			catCode := parts[1] // "m", "s", "b", "a"
			itemID := parts[2]
			newCat := "movie"
			if catCode == "s" {
				newCat = "show"
			} else if catCode == "b" {
				newCat = "book"
			} else if catCode == "a" {
				newCat = "audiobook"
			} else if catCode == "p" {
				newCat = "podcast"
			} else if catCode == "g" {
				newCat = "game"
			}

			if h.DB != nil && h.DB.Pool != nil {
				_, _ = h.DB.Pool.Exec(context.Background(), "UPDATE items SET category = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3", newCat, itemID, userID)
			}

			catRu := mapCategoryToRu(newCat)
			h.sendBotAPIRequest("answerCallbackQuery", map[string]interface{}{
				"callback_query_id": cb.ID,
				"text":              fmt.Sprintf("Категория изменена на: %s", catRu),
			})

			h.refreshTelegramMessageCard(chatID, messageID, itemID, userID)
		}
	} else if strings.HasPrefix(cb.Data, "s:") {
		parts := strings.Split(cb.Data, ":")
		if len(parts) >= 3 {
			statusCode := parts[1] // "p", "w", "c"
			itemID := parts[2]
			newStatus := "planned"
			if statusCode == "w" {
				newStatus = "watching"
			} else if statusCode == "c" {
				newStatus = "completed"
			}

			if h.DB != nil && h.DB.Pool != nil {
				_, _ = h.DB.Pool.Exec(context.Background(), "UPDATE items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3", newStatus, itemID, userID)
			}

			statusRu := mapStatusToRu(newStatus)
			h.sendBotAPIRequest("answerCallbackQuery", map[string]interface{}{
				"callback_query_id": cb.ID,
				"text":              fmt.Sprintf("Статус изменён на: %s", statusRu),
			})

			h.refreshTelegramMessageCard(chatID, messageID, itemID, userID)
		}
	} else if strings.HasPrefix(cb.Data, "g:") {
		parts := strings.Split(cb.Data, ":")
		if len(parts) >= 3 {
			gIdx, err := strconv.Atoi(parts[1])
			itemID := parts[2]

			// Check category of item to choose between bookGenres and topGenres
			activeCategory := "movie"
			if h.DB != nil && h.DB.Pool != nil {
				_ = h.DB.Pool.QueryRow(context.Background(), "SELECT category FROM items WHERE id = $1 AND user_id = $2 LIMIT 1", itemID, userID).Scan(&activeCategory)
			}
			isBookOrAudio := mapCategoryToEn(activeCategory) == "book" || mapCategoryToEn(activeCategory) == "audiobook"

			targetGenresList := topGenres
			if isBookOrAudio {
				targetGenresList = bookGenres
			}

			if err == nil && gIdx >= 0 && gIdx < len(targetGenresList) {
				newGenre := targetGenresList[gIdx].Val
				if h.DB != nil && h.DB.Pool != nil {
					_, _ = h.DB.Pool.Exec(context.Background(), "UPDATE items SET genre = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3", newGenre, itemID, userID)
				}

				h.sendBotAPIRequest("answerCallbackQuery", map[string]interface{}{
					"callback_query_id": cb.ID,
					"text":              fmt.Sprintf("Жанр изменён на: %s", newGenre),
				})

				h.refreshTelegramMessageCard(chatID, messageID, itemID, userID)
			}
		}
	} else if strings.HasPrefix(cb.Data, "r:") {
		parts := strings.Split(cb.Data, ":")
		if len(parts) >= 3 {
			newRating, err := strconv.Atoi(parts[1])
			itemID := parts[2]

			if err == nil && newRating >= 1 && newRating <= 10 {
				if h.DB != nil && h.DB.Pool != nil {
					_, _ = h.DB.Pool.Exec(context.Background(), "UPDATE items SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3", newRating, itemID, userID)
				}

				h.sendBotAPIRequest("answerCallbackQuery", map[string]interface{}{
					"callback_query_id": cb.ID,
					"text":              fmt.Sprintf("Оценка выставлена: %d/10 ⭐", newRating),
				})

				h.refreshTelegramMessageCard(chatID, messageID, itemID, userID)
			}
		}
	}
}

func (h *Handler) refreshTelegramMessageCard(chatID int64, messageID int, itemID string, userID int64) {
	if h.DB == nil || h.DB.Pool == nil {
		return
	}

	var item models.Item
	query := `
		SELECT id, title, category, genre, status, rating, duration, release_year, poster_url, description, director, cast_members, author, isbn
		FROM items WHERE id = $1 AND user_id = $2 LIMIT 1;
	`
	err := h.DB.Pool.QueryRow(context.Background(), query, itemID, userID).Scan(
		&item.ID, &item.Title, &item.Category, &item.Genre, &item.Status, &item.Rating, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Director, &item.Cast, &item.Author, &item.ISBN,
	)
	if err != nil {
		return
	}

	updatedText := buildTelegramCardText(item.Title, item.Category, item.ReleaseYear, item.Duration, item.Genre, item.Director, item.Cast, item.Description, item.Status, item.Rating, item.Author, item.ISBN)
	replyMarkup := buildTelegramReplyMarkup(item.Category, item.Genre, item.Status, item.Rating, item.ID)

	// Try updating caption first, if fails update message text
	editCapPayload := map[string]interface{}{
		"chat_id":      chatID,
		"message_id":   messageID,
		"caption":      updatedText,
		"parse_mode":   "HTML",
		"reply_markup": replyMarkup,
	}
	if err := h.sendBotAPIRequestWithErr("editMessageCaption", editCapPayload); err != nil {
		editTextPayload := map[string]interface{}{
			"chat_id":      chatID,
			"message_id":   messageID,
			"text":         updatedText,
			"parse_mode":   "HTML",
			"reply_markup": replyMarkup,
		}
		h.sendBotAPIRequest("editMessageText", editTextPayload)
	}
}

func buildTelegramCardText(title, category, releaseYear, duration, genre, director, cast, description string, status string, rating int, extraAuthorISBN ...string) string {
	var authorVal, isbnVal string
	if len(extraAuthorISBN) > 0 {
		authorVal = extraAuthorISBN[0]
	}
	if len(extraAuthorISBN) > 1 {
		isbnVal = extraAuthorISBN[1]
	}

	catEn := mapCategoryToEn(category)
	catRu := mapCategoryToRu(category)
	cleanTitle := html.EscapeString(title)
	firstGenre := ""
	if genre != "" {
		parts := strings.FieldsFunc(genre, func(r rune) bool {
			return r == ',' || r == '/' || r == ';' || r == '|'
		})
		if len(parts) > 0 {
			firstGenre = strings.TrimSpace(parts[0])
		}
	}
	cleanGenre := html.EscapeString(firstGenre)
	cleanDirector := html.EscapeString(director)
	cleanCast := html.EscapeString(cast)
	cleanAuthor := html.EscapeString(authorVal)
	cleanISBN := html.EscapeString(isbnVal)
	cleanDesc := html.EscapeString(description)
	statusRu := mapStatusToRu(status, category)

	text := fmt.Sprintf("✅ <b>«%s»</b> успешно добавлен!\n\n", cleanTitle)
	text += fmt.Sprintf("📌 <b>Категория:</b> %s\n", catRu)
	text += fmt.Sprintf("🚩 <b>Статус:</b> %s\n", statusRu)

	// Show rating ONLY if status is NOT planned
	isPlanned := status == "" || status == "planned" || status == "в планах" || status == "у планах"
	if !isPlanned && rating > 0 {
		text += fmt.Sprintf("⭐ <b>Оценка:</b> %d/10\n", rating)
	}

	if cleanGenre != "" {
		text += fmt.Sprintf("🏷 <b>Жанр:</b> %s\n", cleanGenre)
	} else {
		text += "🏷 <b>Жанр:</b> Не указан\n"
	}

	infoParts := []string{}
	if releaseYear != "" {
		infoParts = append(infoParts, releaseYear)
	}
	if duration != "" && catEn != "book" {
		infoParts = append(infoParts, fmt.Sprintf("⏱ %s", duration))
	}
	if len(infoParts) > 0 {
		text += fmt.Sprintf("🗓 <b>Инфо:</b> %s\n", strings.Join(infoParts, " • "))
	}

	if catEn == "book" || catEn == "audiobook" {
		if cleanAuthor != "" {
			text += fmt.Sprintf("✍️ <b>Автор:</b> %s\n", cleanAuthor)
		} else if cleanDirector != "" {
			text += fmt.Sprintf("✍️ <b>Автор:</b> %s\n", cleanDirector)
		}
		if cleanISBN != "" {
			text += fmt.Sprintf("🔢 <b>ISBN:</b> %s\n", cleanISBN)
		}
	} else {
		if cleanDirector != "" {
			text += fmt.Sprintf("🎬 <b>Режиссёр:</b> %s\n", cleanDirector)
		}
		if cleanCast != "" {
			text += fmt.Sprintf("🎭 <b>Актёры:</b> %s\n", cleanCast)
		}
	}

	if cleanDesc != "" {
		desc := cleanDesc
		runes := []rune(desc)
		if len(runes) > 450 {
			desc = string(runes[:447]) + "..."
		}
		text += fmt.Sprintf("\n📖 %s", desc)
	}
	return text
}

func buildTelegramReplyMarkup(catEn string, currentGenre string, currentStatus string, currentRating int, itemID string) map[string]interface{} {
	appURL := fmt.Sprintf("https://t.me/manytgbot?startapp=item_%s", itemID)
	catCode := mapCategoryToEn(catEn)

	// Rows 1-3: Categories (6 options: Movie, Show, Book, Audiobook, Podcast, Game)
	catRow1 := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 🎬 Фильм", false: "🎬 Фильм"}[catCode == "movie"], "callback_data": fmt.Sprintf("c:m:%s", itemID)},
		{"text": map[bool]string{true: "✓ 📺 Сериал", false: "📺 Сериал"}[catCode == "show"], "callback_data": fmt.Sprintf("c:s:%s", itemID)},
	}
	catRow2 := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 📖 Книга", false: "📖 Книга"}[catCode == "book"], "callback_data": fmt.Sprintf("c:b:%s", itemID)},
		{"text": map[bool]string{true: "✓ 🎧 Аудиокнига", false: "🎧 Аудиокнига"}[catCode == "audiobook"], "callback_data": fmt.Sprintf("c:a:%s", itemID)},
	}
	catRow3 := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 🎙 Подкаст", false: "🎙 Подкаст"}[catCode == "podcast"], "callback_data": fmt.Sprintf("c:p:%s", itemID)},
		{"text": map[bool]string{true: "✓ 🎮 Игра", false: "🎮 Игра"}[catCode == "game"], "callback_data": fmt.Sprintf("c:g:%s", itemID)},
	}

	// Status Row: tailored for category type
	isPlanned := currentStatus == "" || currentStatus == "planned" || currentStatus == "в планах" || currentStatus == "у планах"
	isWatching := currentStatus == "watching" || currentStatus == "смотрю" || currentStatus == "читаю" || currentStatus == "слушаю" || currentStatus == "дивлюсь"
	isCompleted := currentStatus == "completed" || currentStatus == "завершено" || currentStatus == "просмотрено" || currentStatus == "прочитано" || currentStatus == "прослушано"

	labelWatching := "👁 Смотрю"
	labelCompleted := "✅ Завершено"
	if catCode == "audiobook" || catCode == "podcast" {
		labelWatching = "🎧 Слушаю"
		labelCompleted = "✅ Прослушано"
	} else if catCode == "book" {
		labelWatching = "📖 Читаю"
		labelCompleted = "✅ Прочитано"
	} else if catCode == "game" {
		labelWatching = "🎮 Играю"
		labelCompleted = "✅ Пройдено"
	}

	statusRow := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 📋 В планах", false: "📋 В планах"}[isPlanned], "callback_data": fmt.Sprintf("s:p:%s", itemID)},
		{"text": map[bool]string{true: "✓ " + labelWatching, false: labelWatching}[isWatching], "callback_data": fmt.Sprintf("s:w:%s", itemID)},
		{"text": map[bool]string{true: "✓ " + labelCompleted, false: labelCompleted}[isCompleted], "callback_data": fmt.Sprintf("s:c:%s", itemID)},
	}

	// Genre Rows: bookGenres if book/audiobook, else topGenres
	targetGenresList := topGenres
	if catCode == "book" || catCode == "audiobook" {
		targetGenresList = bookGenres
	}

	firstGenre := ""
	if currentGenre != "" {
		parts := strings.FieldsFunc(currentGenre, func(r rune) bool {
			return r == ',' || r == '/' || r == ';' || r == '|'
		})
		if len(parts) > 0 {
			firstGenre = strings.TrimSpace(parts[0])
		}
	}

	selectedGenreIdx := -1
	if firstGenre != "" {
		firstLc := strings.ToLower(firstGenre)
		for i, g := range targetGenresList {
			gLc := strings.ToLower(g.Val)
			if firstLc == gLc || strings.Contains(firstLc, gLc) || strings.Contains(gLc, firstLc) {
				selectedGenreIdx = i
				break
			}
		}
	}

	var genreRow1, genreRow2, genreRow3 []map[string]interface{}
	for i, g := range targetGenresList {
		btnText := g.Label
		if i == selectedGenreIdx {
			btnText = "✓ " + g.Label
		}
		btn := map[string]interface{}{
			"text":          btnText,
			"callback_data": fmt.Sprintf("g:%d:%s", i, itemID),
		}
		if i < 4 {
			genreRow1 = append(genreRow1, btn)
		} else if i < 8 {
			genreRow2 = append(genreRow2, btn)
		} else {
			genreRow3 = append(genreRow3, btn)
		}
	}

	// Rows 6-7: Ratings 1-10
	var ratingRow1, ratingRow2 []map[string]interface{}
	for r := 1; r <= 10; r++ {
		btnText := fmt.Sprintf("%d", r)
		if currentRating == r {
			btnText = fmt.Sprintf("✓ %d", r)
		}
		btn := map[string]interface{}{
			"text":          btnText,
			"callback_data": fmt.Sprintf("r:%d:%s", r, itemID),
		}
		if r <= 5 {
			ratingRow1 = append(ratingRow1, btn)
		} else {
			ratingRow2 = append(ratingRow2, btn)
		}
	}

	return map[string]interface{}{
		"inline_keyboard": [][]map[string]interface{}{
			catRow1,
			catRow2,
			catRow3,
			statusRow,
			genreRow1,
			genreRow2,
			genreRow3,
			ratingRow1,
			ratingRow2,
			{
				{"text": "🎬 Открыть в TrackList", "url": appURL},
			},
		},
	}
}

func (h *Handler) processIncomingMediaURL(userID int64, from *struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
}, rawURL string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[PanicRecovery] processIncomingMediaURL panic: %v", r)
		}
	}()

	if h.DB != nil && h.DB.Pool != nil && from != nil {
		userQuery := `
			INSERT INTO users (id, username, first_name, last_name, updated_at)
			VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
			ON CONFLICT (id) DO UPDATE SET
				username = EXCLUDED.username,
				first_name = EXCLUDED.first_name,
				last_name = EXCLUDED.last_name,
				updated_at = CURRENT_TIMESTAMP;
		`
		_, _ = h.DB.Pool.Exec(context.Background(), userQuery, from.ID, from.Username, from.FirstName, from.LastName)
	}

	var media *parser.ExtractedMedia
	var err error

	// Check if this is an internal startapp URL (e.g., https://t.me/manytgbot?startapp=item_uuid)
	if strings.Contains(rawURL, "t.me/") || strings.Contains(rawURL, "startapp=") {
		startAppID := ""
		if idx := strings.Index(rawURL, "startapp="); idx != -1 {
			startAppID = rawURL[idx+len("startapp="):]
			if ampersandIdx := strings.Index(startAppID, "&"); ampersandIdx != -1 {
				startAppID = startAppID[:ampersandIdx]
			}
			startAppID = strings.TrimPrefix(startAppID, "item_")
			startAppID = strings.TrimSpace(startAppID)
		}

		if startAppID != "" && h.DB != nil && h.DB.Pool != nil {
			var dbItem parser.ExtractedMedia
			ctx := context.Background()
			query := `
				SELECT title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members
				FROM items WHERE id = $1 LIMIT 1
			`
			errScan := h.DB.Pool.QueryRow(ctx, query, startAppID).Scan(
				&dbItem.Title, &dbItem.Category, &dbItem.Genre, &dbItem.Duration, &dbItem.ReleaseYear,
				&dbItem.PosterURL, &dbItem.Description, &dbItem.YoutubeURL, &dbItem.Director, &dbItem.Cast,
			)
			if errScan == nil && strings.TrimSpace(dbItem.Title) != "" {
				dbItem.SourceURL = rawURL
				media = &dbItem
			}
		}

		// If startapp URL ID was not found, check if message text contains title (e.g. 📌 Изучение «Интерстеллар»)
		if media == nil && h.DB != nil && h.DB.Pool != nil {
			titleMatch := regexp.MustCompile(`(?i)📌\s*(?:\*\*)?([^(\n]+)`).FindStringSubmatch(rawURL)
			if len(titleMatch) > 1 {
				cleanT := strings.TrimSpace(titleMatch[1])
				cleanT = strings.Trim(cleanT, "*\"'«»")
				if cleanT != "" {
					var dbItem parser.ExtractedMedia
					ctx := context.Background()
					query := `
						SELECT title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members
						FROM items WHERE LOWER(TRIM(title)) = LOWER($1) LIMIT 1
					`
					errScan := h.DB.Pool.QueryRow(ctx, query, cleanT).Scan(
						&dbItem.Title, &dbItem.Category, &dbItem.Genre, &dbItem.Duration, &dbItem.ReleaseYear,
						&dbItem.PosterURL, &dbItem.Description, &dbItem.YoutubeURL, &dbItem.Director, &dbItem.Cast,
					)
					if errScan == nil && strings.TrimSpace(dbItem.Title) != "" {
						dbItem.SourceURL = rawURL
						media = &dbItem
					}
				}
			}
		}

		// If internal t.me/manytgbot URL cannot be resolved by ID or Title from DB, do NOT web-scrape Telegram pages
		if media == nil {
			log.Printf("[BotLinkParser] Unresolved internal startapp URL: %s", rawURL)
			h.sendBotMessage(userID, "❌ Не удалось извлечь информацию о фильме/сериале по этой ссылке. Попробуйте другую ссылку или откройте мини-апп попробуйте найти через поиск или добавьте вручную.")
			return
		}
	} else {
		media, err = parser.ParseMediaURL(rawURL, h.TMDBAPIKey, h.YoutubeAPIKey, h.KinopoiskAPIKey)
	}

	if err != nil || media == nil || strings.TrimSpace(media.Title) == "" {
		log.Printf("[BotLinkParser] Failed to parse URL %s: %v", rawURL, err)
		h.sendBotMessage(userID, "❌ Не удалось извлечь информацию о фильме/сериале по этой ссылке. Попробуйте другую ссылку или откройте мини-апп попробуйте найти через поиск или добавьте вручную.")
		return
	}

	titleTrimmed := strings.TrimSpace(media.Title)
	catEn := mapCategoryToEn(media.Category)
	itemUUID := uuid.New().String()

	ctx := context.Background()
	var finalItemID string = itemUUID
	if h.DB != nil && h.DB.Pool != nil {
		var existingID string
		checkErr := h.DB.Pool.QueryRow(ctx, "SELECT id FROM items WHERE user_id = $1 AND LOWER(TRIM(title)) = LOWER($2) LIMIT 1", userID, titleTrimmed).Scan(&existingID)
		if checkErr == nil && existingID != "" {
			finalItemID = existingID
			// Update missing fields if new data has director/cast/poster/duration
			_, _ = h.DB.Pool.Exec(ctx, `
				UPDATE items SET
					poster_url = CASE WHEN poster_url = '' OR poster_url IS NULL THEN $1 ELSE poster_url END,
					duration = CASE WHEN duration = '' OR duration IS NULL THEN $2 ELSE duration END,
					genre = CASE WHEN genre = '' OR genre IS NULL THEN $3 ELSE genre END,
					director = CASE WHEN director = '' OR director IS NULL THEN $4 ELSE director END,
					cast_members = CASE WHEN cast_members = '' OR cast_members IS NULL THEN $5 ELSE cast_members END,
					author = CASE WHEN author = '' OR author IS NULL THEN $6 ELSE author END,
					isbn = CASE WHEN isbn = '' OR isbn IS NULL THEN $7 ELSE isbn END,
					youtube_url = CASE WHEN youtube_url = '' OR youtube_url IS NULL THEN $8 ELSE youtube_url END,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = $9 AND user_id = $10;
			`, media.PosterURL, media.Duration, media.Genre, media.Director, media.Cast, media.Author, media.ISBN, media.YoutubeURL, finalItemID, userID)
		} else {
			insertQuery := `
				INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn)
				VALUES ($1, $2, $3, $4, 'planned', 0, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
				RETURNING id;
			`
			_ = h.DB.Pool.QueryRow(ctx, insertQuery,
				itemUUID, userID, titleTrimmed, catEn, media.Genre, media.Duration, media.ReleaseYear,
				media.PosterURL, media.Description, media.YoutubeURL, media.Director, media.Cast, media.Author, media.ISBN,
			).Scan(&finalItemID)
		}
	}

	captionText := buildTelegramCardText(titleTrimmed, catEn, media.ReleaseYear, media.Duration, media.Genre, media.Director, media.Cast, media.Description, "planned", 0, media.Author, media.ISBN)
	replyMarkup := buildTelegramReplyMarkup(catEn, media.Genre, "planned", 0, finalItemID)

	// 1. If poster is HTTP URL, send via sendPhoto
	if media.PosterURL != "" && strings.HasPrefix(media.PosterURL, "http") {
		photoPayload := map[string]interface{}{
			"chat_id":      userID,
			"photo":        media.PosterURL,
			"caption":      captionText,
			"parse_mode":   "HTML",
			"reply_markup": replyMarkup,
		}
		if err := h.sendBotAPIRequestWithErr("sendPhoto", photoPayload); err == nil {
			return
		} else {
			log.Printf("[BotLinkParser] sendPhoto HTTP URL failed: %v", err)
		}
	}

	// 2. If poster is Base64 Data URL, upload photo as multipart
	if media.PosterURL != "" && strings.HasPrefix(media.PosterURL, "data:image/") {
		if err := h.sendBotPhotoBase64(userID, captionText, replyMarkup, media.PosterURL); err == nil {
			return
		} else {
			log.Printf("[BotLinkParser] sendBotPhotoBase64 failed: %v", err)
		}
	}

	// 3. Fallback: Send text message
	msgPayload := map[string]interface{}{
		"chat_id":                  userID,
		"text":                     captionText,
		"parse_mode":               "HTML",
		"disable_web_page_preview": false,
		"reply_markup":             replyMarkup,
	}
	h.sendBotAPIRequest("sendMessage", msgPayload)
}

func (h *Handler) sendBotPhotoBase64(userID int64, caption string, replyMarkup interface{}, dataURL string) error {
	idx := strings.Index(dataURL, ",")
	if idx == -1 {
		return fmt.Errorf("invalid data url")
	}
	base64Data := dataURL[idx+1:]
	imgBytes, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil || len(imgBytes) == 0 {
		return err
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	_ = writer.WriteField("chat_id", fmt.Sprintf("%d", userID))
	_ = writer.WriteField("caption", caption)
	_ = writer.WriteField("parse_mode", "HTML")

	if replyMarkup != nil {
		markupBytes, _ := json.Marshal(replyMarkup)
		_ = writer.WriteField("reply_markup", string(markupBytes))
	}

	part, err := writer.CreateFormFile("photo", "poster.jpg")
	if err != nil {
		return err
	}
	_, _ = part.Write(imgBytes)
	writer.Close()

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", h.BotToken)
	req, err := http.NewRequest("POST", url, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("sendPhoto base64 error %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func (h *Handler) sendBotMessage(userID int64, text string) {
	payload := map[string]interface{}{
		"chat_id": userID,
		"text":    text,
	}
	h.sendBotAPIRequest("sendMessage", payload)
}

func (h *Handler) sendBotAPIRequestWithErr(method string, payload interface{}) error {
	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", h.BotToken, method)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("[TelegramAPI] %s error %d: %s", method, resp.StatusCode, string(respBody))
		return fmt.Errorf("telegram API status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func formatCategorySingle(cat string) string {
	switch strings.ToLower(cat) {
	case "movie", "фильм", "фильмы":
		return "Фильм"
	case "show", "сериал", "сериалы":
		return "Сериал"
	case "book", "книга", "книги":
		return "Книга"
	case "audiobook", "аудиокнига", "аудиокниги":
		return "Аудиокнига"
	case "podcast", "подкаст", "подкасты":
		return "Подкаст"
	case "game", "игра", "игры":
		return "Игра"
	default:
		return "Элемент"
	}
}

func getInlinePlaceholderText(langCode string) string {
	lang := strings.ToLower(strings.TrimSpace(langCode))
	if strings.HasPrefix(lang, "uk") {
		return "🔍 Пошук фільмів, серіалів, книг та ігор..."
	} else if strings.HasPrefix(lang, "es") {
		return "🔍 Buscar películas, series, libros y juegos..."
	} else if strings.HasPrefix(lang, "en") {
		return "🔍 Search movies, TV shows, books & games..."
	}
	return "🔍 Поиск фильмов, сериалов, книг и игр..."
}

func getCategoryEmoji(cat string) string {
	switch strings.ToLower(cat) {
	case "movie", "фильм", "фильмы":
		return "🎬"
	case "show", "сериал", "сериалы":
		return "📺"
	case "book", "книга", "книги":
		return "📚"
	case "audiobook", "аудиокнига", "аудиокниги":
		return "🎧"
	case "podcast", "подкаст", "подкасты":
		return "🎙"
	case "game", "игра", "игры":
		return "🎮"
	default:
		return "📌"
	}
}

func getWelcomeTagline(langCode string) string {
	lang := strings.ToLower(strings.TrimSpace(langCode))
	if strings.HasPrefix(lang, "uk") {
		return "LISTA — міні-додаток для збереження вражень"
	} else if strings.HasPrefix(lang, "es") {
		return "LISTA — mini-app para guardar tus impresiones"
	} else if strings.HasPrefix(lang, "en") {
		return "LISTA — mini-app to save your impressions"
	}
	return "LISTA — мини-приложение для сохранения впечатлений"
}

func truncateString(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= maxLen {
		return s
	}
	return string(r[:maxLen]) + "..."
}

func (h *Handler) handleInlineQuery(iq *struct {
	ID       string `json:"id"`
	From     struct {
		ID           int64  `json:"id"`
		FirstName    string `json:"first_name"`
		LastName     string `json:"last_name"`
		Username     string `json:"username"`
		LanguageCode string `json:"language_code"`
	} `json:"from"`
	Query    string `json:"query"`
	Offset   string `json:"offset"`
}) {
	if iq == nil || iq.ID == "" {
		return
	}

	query := strings.TrimSpace(iq.Query)
	langCode := iq.From.LanguageCode

	results := h.searchInlineResults(query, langCode)

	var telegramResults []map[string]interface{}
	for i, item := range results {
		catLabel := formatCategorySingle(item.Category)
		catEmoji := getCategoryEmoji(item.Category)

		titleLine := fmt.Sprintf("📌 <b>%s (%s)</b>", item.Title, catLabel)
		appURL := fmt.Sprintf("https://t.me/manytgbot?startapp=%s", item.ID)
		tagline := getWelcomeTagline(langCode)

		msgText := fmt.Sprintf("%s\n\n%s\n%s", titleLine, tagline, appURL)

		descLine := ""
		if item.Genre != "" {
			descLine += fmt.Sprintf(" • %s", item.Genre)
		}
		if item.ReleaseYear != "" {
			descLine += fmt.Sprintf(" • %s", item.ReleaseYear)
		}

		description := fmt.Sprintf("%s%s", catLabel, descLine)
		if item.Description != "" {
			description += fmt.Sprintf("\n%s", truncateString(item.Description, 80))
		}

		article := map[string]interface{}{
			"type":        "article",
			"id":          fmt.Sprintf("res_%d_%s", i, item.ID),
			"title":       fmt.Sprintf("%s %s", catEmoji, item.Title),
			"description": description,
			"input_message_content": map[string]interface{}{
				"message_text":           msgText,
				"parse_mode":             "HTML",
				"disable_web_page_preview": false,
			},
			"reply_markup": map[string]interface{}{
				"inline_keyboard": [][]map[string]interface{}{
					{
						{
							"text": "🚀 Открыть в LISTA",
							"url":  appURL,
						},
					},
				},
			},
		}

		if item.PosterURL != "" && strings.HasPrefix(item.PosterURL, "http") {
			article["thumb_url"] = item.PosterURL
			article["thumb_width"] = 100
			article["thumb_height"] = 150
		}

		telegramResults = append(telegramResults, article)
	}

	placeholder := getInlinePlaceholderText(langCode)

	payload := map[string]interface{}{
		"inline_query_id":     iq.ID,
		"results":             telegramResults,
		"cache_time":          5,
		"is_personal":         true,
		"switch_pm_text":      placeholder,
		"switch_pm_parameter": "start",
	}

	_ = h.sendBotAPIRequestWithErr("answerInlineQuery", payload)
}

func (h *Handler) handleChosenInlineResult(cir *struct {
	ResultID        string `json:"result_id"`
	From            struct {
		ID           int64  `json:"id"`
		FirstName    string `json:"first_name"`
		Username     string `json:"username"`
		LanguageCode string `json:"language_code"`
	} `json:"from"`
	Query           string `json:"query"`
	InlineMessageID string `json:"inline_message_id"`
}) {
	if cir == nil || cir.From.ID == 0 {
		return
	}
	userID := cir.From.ID
	log.Printf("[ChosenInlineResult] User %d selected inline item %s (query: %q)", userID, cir.ResultID, cir.Query)
}

func (h *Handler) searchInlineResults(query string, langCode string) []models.CatalogSearchResult {
	var results []models.CatalogSearchResult
	seenTitles := make(map[string]bool)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	// 1. Search internal DB catalog
	if h.DB != nil && h.DB.Pool != nil {
		var rows pgx.Rows
		var err error
		if query != "" {
			dbQuery := `
				SELECT DISTINCT ON (LOWER(title)) id::text, title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn
				FROM items
				WHERE LOWER(title) LIKE $1
				LIMIT 8
			`
			rows, err = h.DB.Pool.Query(ctx, dbQuery, "%"+strings.ToLower(query)+"%")
		} else {
			dbQuery := `
				SELECT DISTINCT ON (LOWER(title)) id::text, title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn
				FROM items
				ORDER BY LOWER(title), created_at DESC
				LIMIT 8
			`
			rows, err = h.DB.Pool.Query(ctx, dbQuery)
		}

		if err == nil && rows != nil {
			for rows.Next() {
				var item models.CatalogSearchResult
				if err := rows.Scan(&item.ID, &item.Title, &item.Category, &item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.YoutubeURL, &item.Director, &item.Cast, &item.Author, &item.ISBN); err == nil {
					tKey := strings.ToLower(strings.TrimSpace(item.Title))
					if !seenTitles[tKey] {
						seenTitles[tKey] = true
						results = append(results, item)
					}
				}
			}
			rows.Close()
		}
	}

	if query == "" {
		return results
	}

	// 1b. Search Books Multi-Source (Google Books, FantLab, Open Library, iTunes eBooks)
	for _, item := range parser.SearchBooksMultiSource(query) {
		tKey := strings.ToLower(strings.TrimSpace(item.Title))
		if !seenTitles[tKey] {
			seenTitles[tKey] = true
			results = append(results, item)
			go h.saveCatalogItemToDB(item)
		}
	}

	// 2. Kinopoisk Unofficial API (Kinopoisk HD / Russian Movies & Series)
	if h.KinopoiskAPIKey != "" {
		for _, item := range fetchKinopoiskInline(query, h.KinopoiskAPIKey) {
			tKey := strings.ToLower(strings.TrimSpace(item.Title))
			if !seenTitles[tKey] {
				seenTitles[tKey] = true
				results = append(results, item)
				go h.saveCatalogItemToDB(item)
			}
		}
	}

	// 3. TMDb API (The Movie Database)
	if h.TMDBAPIKey != "" {
		for _, item := range fetchTMDbInline(query, h.TMDBAPIKey) {
			tKey := strings.ToLower(strings.TrimSpace(item.Title))
			if !seenTitles[tKey] {
				seenTitles[tKey] = true
				results = append(results, item)
				go h.saveCatalogItemToDB(item)
			}
		}
	}

	// 3. iTunes API
	for _, item := range fetchITunesInline(query) {
		tKey := strings.ToLower(strings.TrimSpace(item.Title))
		if !seenTitles[tKey] {
			seenTitles[tKey] = true
			results = append(results, item)
			go h.saveCatalogItemToDB(item)
		}
	}

	// 4. TVMaze API (TV Shows in English / International)
	for _, item := range fetchTVMazeInline(query, h.TMDBAPIKey) {
		tKey := strings.ToLower(strings.TrimSpace(item.Title))
		if !seenTitles[tKey] {
			seenTitles[tKey] = true
			results = append(results, item)
			go h.saveCatalogItemToDB(item)
		}
	}

	// 5. Wikipedia API
	for _, item := range fetchWikiInline(query) {
		tKey := strings.ToLower(strings.TrimSpace(item.Title))
		if !seenTitles[tKey] {
			seenTitles[tKey] = true
			results = append(results, item)
			go h.saveCatalogItemToDB(item)
		}
	}

	if len(results) > 15 {
		results = results[:15]
	}

	return results
}

func fetchITunesInline(query string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=movie,podcast,audiobook,ebook&limit=6&lang=ru_ru", url.QueryEscape(query))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			TrackName        string `json:"trackName"`
			CollectionName   string `json:"collectionName"`
			ArtworkUrl100    string `json:"artworkUrl100"`
			Kind             string `json:"kind"`
			WrapperType      string `json:"wrapperType"`
			PrimaryGenreName string `json:"primaryGenreName"`
			ReleaseDate      string `json:"releaseDate"`
			LongDescription  string `json:"longDescription"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for _, r := range data.Results {
			title := r.TrackName
			if title == "" {
				title = r.CollectionName
			}
			if title == "" {
				continue
			}

			cat := "movie"
			if r.Kind == "podcast" || r.WrapperType == "podcast" {
				cat = "podcast"
			} else if r.WrapperType == "audiobook" {
				cat = "audiobook"
			} else if r.WrapperType == "ebook" || r.Kind == "ebook" {
				cat = "book"
			}

			year := ""
			if len(r.ReleaseDate) >= 4 {
				year = r.ReleaseDate[:4]
			}

			poster := strings.ReplaceAll(r.ArtworkUrl100, "100x100bb", "600x600bb")

			list = append(list, models.CatalogSearchResult{
				ID:          uuid.New().String(),
				Title:       title,
				Category:    cat,
				Genre:       r.PrimaryGenreName,
				ReleaseYear: year,
				PosterURL:   poster,
				Description: r.LongDescription,
			})
		}
	}
	return list
}

func mapEnglishGenreToRu(g string) string {
	switch strings.ToLower(strings.TrimSpace(g)) {
	case "action":
		return "Боевик"
	case "adventure":
		return "Приключения"
	case "comedy":
		return "Комедия"
	case "crime", "mystery":
		return "Детектив"
	case "drama":
		return "Драма"
	case "fantasy":
		return "Фэнтези"
	case "science-fiction", "sci-fi":
		return "Фантастика"
	case "thriller":
		return "Триллер"
	case "horror":
		return "Ужасы"
	case "anime", "animation":
		return "Мультфильмы"
	default:
		return g
	}
}

func fetchTVMazeInline(query string, tmdbKey string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	apiURL := fmt.Sprintf("https://api.tvmaze.com/search/shows?q=%s", url.QueryEscape(query))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data []struct {
		Show struct {
			ID             int      `json:"id"`
			Name           string   `json:"name"`
			Premiered      string   `json:"premiered"`
			Runtime        int      `json:"runtime"`
			AverageRuntime int      `json:"averageRuntime"`
			Genres         []string `json:"genres"`
			Summary        string   `json:"summary"`
			Externals      struct {
				IMDb string `json:"imdb"`
			} `json:"externals"`
			Image *struct {
				Medium   string `json:"medium"`
				Original string `json:"original"`
			} `json:"image"`
		} `json:"show"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, item := range data {
			if i >= 6 {
				break
			}
			show := item.Show
			if show.Name == "" {
				continue
			}

			// If show has IMDb ID and tmdbKey is provided, attempt localized TMDb lookup
			if show.Externals.IMDb != "" && tmdbKey != "" {
				if tmdbMedia, err := parser.FetchTMDbByExternalID(client, tmdbKey, show.Externals.IMDb); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
					list = append(list, models.CatalogSearchResult{
						ID:          uuid.New().String(),
						Title:       tmdbMedia.Title,
						Category:    "show",
						Genre:       tmdbMedia.Genre,
						Duration:    tmdbMedia.Duration,
						ReleaseYear: tmdbMedia.ReleaseYear,
						PosterURL:   tmdbMedia.PosterURL,
						Description: tmdbMedia.Description,
						YoutubeURL:  tmdbMedia.YoutubeURL,
						Director:    tmdbMedia.Director,
						Cast:        tmdbMedia.Cast,
					})
					continue
				}
			}

			// Fallback to English TVMaze details
			year := ""
			if len(show.Premiered) >= 4 {
				year = show.Premiered[:4]
			}
			poster := ""
			if show.Image != nil {
				poster = show.Image.Medium
				if show.Image.Original != "" {
					poster = show.Image.Original
				}
			}
			genre := ""
			if len(show.Genres) > 0 {
				genre = mapEnglishGenreToRu(show.Genres[0])
			}

			duration := ""
			if show.AverageRuntime > 0 {
				duration = fmt.Sprintf("%d мин", show.AverageRuntime)
			} else if show.Runtime > 0 {
				duration = fmt.Sprintf("%d мин", show.Runtime)
			}

			cleanDesc := regexp.MustCompile(`<[^>]*>`).ReplaceAllString(show.Summary, "")

			list = append(list, models.CatalogSearchResult{
				ID:          uuid.New().String(),
				Title:       show.Name,
				Category:    "show",
				Genre:       genre,
				Duration:    duration,
				ReleaseYear: year,
				PosterURL:   poster,
				Description: cleanDesc,
			})
		}
	}
	return list
}

func fetchWikiInline(query string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	apiURL := fmt.Sprintf("https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&utf8=1&format=json", url.QueryEscape(query))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, item := range data.Query.Search {
			if i >= 4 || item.Title == "" {
				break
			}
			cleanDesc := regexp.MustCompile(`<[^>]*>`).ReplaceAllString(item.Snippet, "")

			cat := "movie"
			tLower := strings.ToLower(item.Title + " " + cleanDesc)
			if strings.Contains(tLower, "игра") || strings.Contains(tLower, "game") {
				cat = "game"
			} else if strings.Contains(tLower, "книга") || strings.Contains(tLower, "роман") || strings.Contains(tLower, "повесть") {
				cat = "book"
			} else if strings.Contains(tLower, "сериал") || strings.Contains(tLower, "телесериал") {
				cat = "show"
			}

			list = append(list, models.CatalogSearchResult{
				ID:          uuid.New().String(),
				Title:       item.Title,
				Category:    cat,
				Description: cleanDesc,
			})
		}
	}
	return list
}

var tmdbGenreMap = map[int]string{
	28: "Боевик", 12: "Приключения", 16: "Мультфильмы", 35: "Комедия",
	80: "Детектив", 99: "Другое", 18: "Драма", 10751: "Мультфильмы",
	14: "Фэнтези", 36: "Другое", 27: "Ужасы", 10402: "Другое",
	9648: "Детектив", 10749: "Драма", 878: "Фантастика", 10770: "Шоу",
	53: "Триллер", 10752: "Боевик", 37: "Приключения", 10759: "Боевик",
	10762: "Мультфильмы", 10763: "Шоу", 10764: "Шоу", 10765: "Фантастика",
}

func fetchTMDbInline(query string, tmdbKey string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	if strings.TrimSpace(tmdbKey) == "" {
		return list
	}

	apiURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/search/multi?api_key=%s&query=%s&language=ru-RU&page=1",
		tmdbKey, url.QueryEscape(query),
	)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			ID           int     `json:"id"`
			Title        string  `json:"title"`
			Name         string  `json:"name"`
			MediaType    string  `json:"media_type"`
			PosterPath   string  `json:"poster_path"`
			Overview     string  `json:"overview"`
			ReleaseDate  string  `json:"release_date"`
			FirstAirDate string  `json:"first_air_date"`
			VoteAverage  float64 `json:"vote_average"`
			GenreIDs     []int   `json:"genre_ids"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, r := range data.Results {
			if i >= 6 {
				break
			}
			title := r.Title
			if title == "" {
				title = r.Name
			}
			if title == "" || r.MediaType == "person" {
				continue
			}

			cat := "movie"
			if r.MediaType == "tv" {
				cat = "show"
			}

			year := ""
			if len(r.ReleaseDate) >= 4 {
				year = r.ReleaseDate[:4]
			} else if len(r.FirstAirDate) >= 4 {
				year = r.FirstAirDate[:4]
			}

			poster := ""
			if r.PosterPath != "" {
				poster = "https://image.tmdb.org/t/p/w500" + r.PosterPath
			}

			genre := ""
			for _, gID := range r.GenreIDs {
				if gName, ok := tmdbGenreMap[gID]; ok {
					genre = gName
					break
				}
			}

			overview := r.Overview
			var duration, director, cast, youtubeURL string

			// Enrich with full TMDb details (duration/runtime, director, cast, trailer)
			if details, errDet := parser.FetchTMDbDetails(client, tmdbKey, strconv.Itoa(r.ID), r.MediaType); errDet == nil && details != nil {
				if details.Title != "" {
					title = details.Title
				}
				if details.Duration != "" {
					duration = details.Duration
				}
				if details.Director != "" {
					director = details.Director
				}
				if details.Cast != "" {
					cast = details.Cast
				}
				if details.YoutubeURL != "" {
					youtubeURL = details.YoutubeURL
				}
				if details.Genre != "" {
					genre = details.Genre
				}
				if details.Description != "" {
					overview = details.Description
				}
				if details.PosterURL != "" {
					poster = details.PosterURL
				}
				if details.ReleaseYear != "" {
					year = details.ReleaseYear
				}
			}

			list = append(list, models.CatalogSearchResult{
				ID:          uuid.New().String(),
				Title:       title,
				Category:    cat,
				Genre:       genre,
				Duration:    duration,
				ReleaseYear: year,
				PosterURL:   poster,
				Description: overview,
				YoutubeURL:  youtubeURL,
				Director:    director,
				Cast:        cast,
			})
		}
	}

	return list
}

func (h *Handler) saveCatalogItemToDB(item models.CatalogSearchResult) {
	if h.DB == nil || h.DB.Pool == nil || item.ID == "" || strings.TrimSpace(item.Title) == "" {
		return
	}
	ctx := context.Background()
	catEn := mapCategoryToEn(item.Category)

	poster := strings.TrimSpace(item.PosterURL)
	if poster != "" {
		poster = parser.OptimizePosterURL(nil, poster)
	}

	query := `
		INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn, created_at, updated_at)
		VALUES ($1, 0, $2, $3, 'planned', 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO NOTHING;
	`
	_, err := h.DB.Pool.Exec(ctx, query, item.ID, item.Title, catEn, item.Genre, item.Duration, item.ReleaseYear, poster, item.Description, item.YoutubeURL, item.Director, item.Cast, item.Author, item.ISBN)
	if err != nil {
		log.Printf("[SaveCatalogItem] Error saving catalog item %s (%s): %v", item.ID, item.Title, err)
	}
}

func fetchKinopoiskInline(query string, kpKey string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	if strings.TrimSpace(kpKey) == "" {
		return list
	}

	apiURL := fmt.Sprintf(
		"https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=%s",
		url.QueryEscape(query),
	)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	req.Header.Set("X-API-KEY", kpKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Films []struct {
			FilmID      int    `json:"filmId"`
			NameRu      string `json:"nameRu"`
			NameEn      string `json:"nameEn"`
			Type        string `json:"type"`
			Year        string `json:"year"`
			FilmLength  string `json:"filmLength"`
			Description string `json:"description"`
			PosterUrl   string `json:"posterUrl"`
			Genres      []struct {
				Genre string `json:"genre"`
			} `json:"genres"`
		} `json:"films"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, film := range data.Films {
			if i >= 6 {
				break
			}
			title := film.NameRu
			if title == "" {
				title = film.NameEn
			}
			if title == "" {
				continue
			}

			cat := "movie"
			tUpper := strings.ToUpper(film.Type)
			if strings.Contains(tUpper, "SERIES") || strings.Contains(tUpper, "SHOW") {
				cat = "show"
			}

			genre := ""
			if len(film.Genres) > 0 {
				genre = strings.Title(film.Genres[0].Genre)
			}

			duration := parseKinopoiskLength(film.FilmLength)
			poster := film.PosterUrl

			director, cast := parser.FetchKinopoiskStaff(client, kpKey, film.FilmID)

			list = append(list, models.CatalogSearchResult{
				ID:          uuid.New().String(),
				Title:       title,
				Category:    cat,
				Genre:       genre,
				Duration:    duration,
				ReleaseYear: film.Year,
				PosterURL:   poster,
				Description: film.Description,
				Director:    director,
				Cast:        cast,
			})
		}
	}

	return list
}

func parseKinopoiskLength(length string) string {
	if length == "" {
		return ""
	}
	parts := strings.Split(length, ":")
	if len(parts) == 2 {
		h, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		total := h*60 + m
		if total > 0 {
			return fmt.Sprintf("%d мин", total)
		}
	} else if len(parts) == 3 {
		h, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		total := h*60 + m
		if total > 0 {
			return fmt.Sprintf("%d мин", total)
		}
	}
	if num, err := strconv.Atoi(length); err == nil && num > 0 {
		return fmt.Sprintf("%d мин", num)
	}
	return length
}

