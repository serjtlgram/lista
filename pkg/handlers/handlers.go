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
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lista-backend/pkg/auth"
	"lista-backend/pkg/db"
	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
	"lista-backend/pkg/youtube"
)

type Handler struct {
	DB            *db.DB
	BotToken      string
	YoutubeAPIKey string
	TMDBAPIKey    string
}

func NewHandler(database *db.DB, botToken string, youtubeAPIKey string, tmdbAPIKey string) *Handler {
	h := &Handler{
		DB:            database,
		BotToken:      botToken,
		YoutubeAPIKey: youtubeAPIKey,
		TMDBAPIKey:    tmdbAPIKey,
	}
	go h.InitBotCommandsAndMenu()
	return h
}

func (h *Handler) InitBotCommandsAndMenu() {
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
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, started_at, completed_at, created_at, updated_at
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
			&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
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
			SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, started_at, completed_at, created_at, updated_at
			FROM items
			WHERE user_id = $1 AND LOWER(TRIM(title)) = LOWER($2)
			LIMIT 1;
		`
		var existingItem models.Item
		err := h.DB.Pool.QueryRow(r.Context(), checkQuery, user.ID, titleTrimmed).Scan(
			&existingItem.ID, &existingItem.UserID, &existingItem.Title, &existingItem.Category, &existingItem.Status, &existingItem.Rating,
			&existingItem.Genre, &existingItem.Duration, &existingItem.ReleaseYear, &existingItem.PosterURL, &existingItem.Description, &existingItem.Note,
			&existingItem.RawInput, &existingItem.AIParsed, &existingItem.YoutubeURL, &existingItem.Director, &existingItem.Cast, &existingItem.StartedAt, &existingItem.CompletedAt, &existingItem.CreatedAt, &existingItem.UpdatedAt,
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
	if ytURL == "" && (cat == "movie" || cat == "show") {
		if foundURL, err := youtube.SearchYouTube(h.YoutubeAPIKey, req.Title, cat); err == nil && foundURL != "" {
			ytURL = foundURL
		}
	}

	query := `
		INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, youtube_url, director, cast_members, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
	createdItem.CompletedAt = completedAt

	err := h.DB.Pool.QueryRow(
		r.Context(), query,
		itemUUID, user.ID, req.Title, cat, status, req.Rating,
		req.Genre, req.Duration, req.ReleaseYear, req.PosterURL, req.Description, req.Note, req.RawInput, ytURL, req.Director, req.Cast, completedAt,
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
		query += fmt.Sprintf(", poster_url = $%d", argIdx)
		args = append(args, *req.PosterURL)
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
	case "фильмы", "movie", "movies":
		return "movie"
	case "сериалы", "show", "shows", "series":
		return "show"
	case "книги", "book", "books":
		return "book"
	case "аудиокниги", "audiobook", "audiobooks":
		return "audiobook"
	case "подкасты", "podcast", "podcasts":
		return "podcast"
	case "игры", "game", "games":
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
		SELECT DISTINCT ON (LOWER(title)) title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members
		FROM items
		WHERE LOWER(title) LIKE $1
	`
	args := []interface{}{"%" + strings.ToLower(q) + "%"}

	if category != "" && category != "all" && category != "Все" {
		query += " AND (category = $2 OR category = $3)"
		args = append(args, category, mapCategoryToEn(category))
	}

	query += " ORDER BY LOWER(title), created_at DESC LIMIT 10;"

	rows, err := h.DB.Pool.Query(r.Context(), query, args...)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]models.CatalogSearchResult{})
		return
	}
	defer rows.Close()

	results := []models.CatalogSearchResult{}
	for rows.Next() {
		var res models.CatalogSearchResult
		if err := rows.Scan(&res.Title, &res.Category, &res.Genre, &res.Duration, &res.ReleaseYear, &res.PosterURL, &res.Description, &res.YoutubeURL, &res.Director, &res.Cast); err == nil {
			results = append(results, res)
		}
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
		SELECT id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, note, raw_input, ai_parsed, youtube_url, director, cast_members, started_at, completed_at, created_at, updated_at
		FROM items WHERE id = $1 LIMIT 1;
	`

	var item models.Item
	err := h.DB.Pool.QueryRow(r.Context(), query, itemID).Scan(
		&item.ID, &item.UserID, &item.Title, &item.Category, &item.Status, &item.Rating,
		&item.Genre, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Note,
		&item.RawInput, &item.AIParsed, &item.YoutubeURL, &item.Director, &item.Cast, &item.StartedAt, &item.CompletedAt, &item.CreatedAt, &item.UpdatedAt,
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

func mapStatusToRu(status string) string {
	switch strings.ToLower(status) {
	case "planned", "в планах", "у планах":
		return "📋 В планах"
	case "watching", "смотрю", "дивлюсь":
		return "👁 Смотрю"
	case "completed", "просмотрено", "завершено":
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
			catCode := parts[1] // "m" or "s"
			itemID := parts[2]
			newCat := "movie"
			if catCode == "s" {
				newCat = "show"
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

			if err == nil && gIdx >= 0 && gIdx < len(topGenres) {
				newGenre := topGenres[gIdx].Val
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
		SELECT id, title, category, genre, status, rating, duration, release_year, poster_url, description, director, cast_members
		FROM items WHERE id = $1 AND user_id = $2 LIMIT 1;
	`
	err := h.DB.Pool.QueryRow(context.Background(), query, itemID, userID).Scan(
		&item.ID, &item.Title, &item.Category, &item.Genre, &item.Status, &item.Rating, &item.Duration, &item.ReleaseYear, &item.PosterURL, &item.Description, &item.Director, &item.Cast,
	)
	if err != nil {
		return
	}

	updatedText := buildTelegramCardText(item.Title, item.Category, item.ReleaseYear, item.Duration, item.Genre, item.Director, item.Cast, item.Description, item.Status, item.Rating)
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

func buildTelegramCardText(title, category, releaseYear, duration, genre, director, cast, description string, status string, rating int) string {
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
	cleanDesc := html.EscapeString(description)
	statusRu := mapStatusToRu(status)

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
	if duration != "" {
		infoParts = append(infoParts, fmt.Sprintf("⏱ %s", duration))
	}
	if len(infoParts) > 0 {
		text += fmt.Sprintf("🗓 <b>Инфо:</b> %s\n", strings.Join(infoParts, " • "))
	}

	if cleanDirector != "" {
		text += fmt.Sprintf("🎬 <b>Режиссёр:</b> %s\n", cleanDirector)
	}
	if cleanCast != "" {
		text += fmt.Sprintf("🎭 <b>Актёры:</b> %s\n", cleanCast)
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

	// Row 1: Category
	catRow := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 🎬 Фильм", false: "🎬 Фильм"}[catEn == "movie"], "callback_data": fmt.Sprintf("c:m:%s", itemID)},
		{"text": map[bool]string{true: "✓ 📺 Сериал", false: "📺 Сериал"}[catEn == "show"], "callback_data": fmt.Sprintf("c:s:%s", itemID)},
	}

	// Row 2: Status
	isPlanned := currentStatus == "" || currentStatus == "planned" || currentStatus == "в планах" || currentStatus == "у планах"
	isWatching := currentStatus == "watching" || currentStatus == "смотрю" || currentStatus == "дивлюсь"
	isCompleted := currentStatus == "completed" || currentStatus == "завершено" || currentStatus == "просмотрено"

	statusRow := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 📋 В планах", false: "📋 В планах"}[isPlanned], "callback_data": fmt.Sprintf("s:p:%s", itemID)},
		{"text": map[bool]string{true: "✓ 👁 Смотрю", false: "👁 Смотрю"}[isWatching], "callback_data": fmt.Sprintf("s:w:%s", itemID)},
		{"text": map[bool]string{true: "✓ ✅ Завершено", false: "✅ Завершено"}[isCompleted], "callback_data": fmt.Sprintf("s:c:%s", itemID)},
	}

	// Rows 3-5: 12 Genres (4 in a row, strictly 1 selection)
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
		for i, g := range topGenres {
			gLc := strings.ToLower(g.Val)
			if firstLc == gLc || strings.Contains(firstLc, gLc) || strings.Contains(gLc, firstLc) {
				selectedGenreIdx = i
				break
			}
		}
	}

	var genreRow1, genreRow2, genreRow3 []map[string]interface{}
	for i, g := range topGenres {
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
			catRow,
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

	media, err := parser.ParseMediaURL(rawURL, h.TMDBAPIKey, h.YoutubeAPIKey)
	if err != nil || media == nil || strings.TrimSpace(media.Title) == "" {
		log.Printf("[BotLinkParser] Failed to parse URL %s: %v", rawURL, err)
		h.sendBotMessage(userID, "❌ Не удалось извлечь информацию о фильме/сериале по этой ссылке. Попробуйте другую ссылку.")
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
					youtube_url = CASE WHEN youtube_url = '' OR youtube_url IS NULL THEN $6 ELSE youtube_url END,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = $7 AND user_id = $8;
			`, media.PosterURL, media.Duration, media.Genre, media.Director, media.Cast, media.YoutubeURL, finalItemID, userID)
		} else {
			insertQuery := `
				INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members)
				VALUES ($1, $2, $3, $4, 'planned', 0, $5, $6, $7, $8, $9, $10, $11, $12)
				RETURNING id;
			`
			_ = h.DB.Pool.QueryRow(ctx, insertQuery,
				itemUUID, userID, titleTrimmed, catEn, media.Genre, media.Duration, media.ReleaseYear,
				media.PosterURL, media.Description, media.YoutubeURL, media.Director, media.Cast,
			).Scan(&finalItemID)
		}
	}

	captionText := buildTelegramCardText(titleTrimmed, catEn, media.ReleaseYear, media.Duration, media.Genre, media.Director, media.Cast, media.Description, "planned", 0)
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

