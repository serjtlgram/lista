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
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"lista-backend/pkg/genres"
	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
)

// POST /api/telegram/webhook
func (h *Handler) HandleTelegramWebhook(w http.ResponseWriter, r *http.Request) {
	if h.BotSecretToken != "" {
		providedToken := r.Header.Get("X-Telegram-Bot-Api-Secret-Token")
		if providedToken != h.BotSecretToken {
			log.Printf("[TelegramWebhook] Unauthorized webhook request from %s", r.RemoteAddr)
			w.WriteHeader(http.StatusForbidden)
			return
		}
	}

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

	// Inline Query rate limit (1 per 2 seconds)
	if update.InlineQuery != nil && update.InlineQuery.ID != "" {
		userID := update.InlineQuery.From.ID
		if allowed, _ := h.RateLimiter.Allow(fmt.Sprintf("tg_inline:%d", userID), 2*time.Second); !allowed {
			h.sendBotAPIRequest("answerInlineQuery", map[string]interface{}{
				"inline_query_id": update.InlineQuery.ID,
				"results":         []interface{}{},
				"cache_time":      5,
			})
			w.WriteHeader(http.StatusOK)
			return
		}
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

		// Message rate limit (1 request per 2 seconds per user)
		if allowed, _ := h.RateLimiter.Allow(fmt.Sprintf("tg_msg:%d", userID), 2*time.Second); !allowed {
			log.Printf("[TelegramWebhook] Rate limit exceeded for user %d", userID)
			if warned, _ := h.RateLimiter.Allow(fmt.Sprintf("tg_warned:%d", userID), 10*time.Second); warned {
				go h.sendBotAPIRequest("sendMessage", map[string]interface{}{
					"chat_id": userID,
					"text":    "⏳ Пожалуйста, подождите 2 секунды перед отправкой следующего запроса.",
				})
			}
			w.WriteHeader(http.StatusOK)
			return
		}

		msgText := strings.TrimSpace(update.Message.Text)
		if msgText == "" {
			msgText = strings.TrimSpace(update.Message.Caption)
		}
		if len(msgText) > 300 {
			msgText = msgText[:300]
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
		} else if strings.HasPrefix(msgText, "/") && (strings.HasPrefix(msgText, "/stats") || strings.HasPrefix(msgText, "/users") || strings.HasPrefix(msgText, "/count") || strings.HasPrefix(msgText, "/list") || strings.HasPrefix(msgText, "/admin_users")) {
			go h.handleAdminCommand(userID, update.Message.From.Username, msgText)
		} else if extractedURL := parser.ExtractFirstURL(msgText); extractedURL != "" {
			log.Printf("[TelegramWebhook] Extracted URL from user %d: %s", userID, extractedURL)
			go h.processIncomingMediaURL(userID, update.Message.From, extractedURL)
		}
	}

	w.WriteHeader(http.StatusOK)
}



func mapStatusToRu(status string, category ...string) string {
	cat := ""
	if len(category) > 0 {
		cat = mapCategoryToEn(category[0])
	}
	switch strings.ToLower(status) {
	case "planned", "в планах", "у планах":
		return "📋 В планах"
	case "watching", "смотрю", "читаю", "дивлюсь":
		if cat == "book" {
			return "📖 Читаю"
		} else if cat == "game" {
			return "🎮 Играю"
		}
		return "👁 Смотрю"
	case "completed", "просмотрено", "завершено", "прочитано":
		if cat == "book" {
			return "✅ Прочитано"
		} else if cat == "game" {
			return "✅ Пройдено"
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
			catEn := mapCategoryToEn(activeCategory)

			targetGenresList := genres.GetGenresList(catEn)

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

	updatedText := buildTelegramCardText(item.Title, item.Category, item.ReleaseYear, item.Duration, item.Genre, item.Director, item.Cast, item.Description, item.Status, item.Rating, item.PublicRating, item.Author, item.ISBN)
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

func buildTelegramCardText(title, category, releaseYear, duration, genre, director, cast, description string, status string, rating int, publicRating string, extraAuthorISBN ...string) string {
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

	if publicRating != "" {
		if catEn == "book" {
			text += fmt.Sprintf("⭐ <b>Народный рейтинг:</b> %s\n", publicRating)
		} else {
			text += fmt.Sprintf("🍿 <b>Народный рейтинг:</b> %s\n", publicRating)
		}
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
		if catEn == "book" {
			durNum := regexp.MustCompile(`\D`).ReplaceAllString(duration, "")
			if durNum != "" {
				infoParts = append(infoParts, fmt.Sprintf("📄 %s стр.", durNum))
			} else {
				infoParts = append(infoParts, fmt.Sprintf("📄 %s", duration))
			}
		} else {
			infoParts = append(infoParts, fmt.Sprintf("⏱ %s", duration))
		}
	}
	if len(infoParts) > 0 {
		text += fmt.Sprintf("🗓 <b>Инфо:</b> %s\n", strings.Join(infoParts, " • "))
	}

	if catEn == "book" {
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

	// Rows 1-2: Categories (4 options: Movie, Show, Book, Game)
	catRow1 := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 🎬 Фильм", false: "🎬 Фильм"}[catCode == "movie"], "callback_data": fmt.Sprintf("c:m:%s", itemID)},
		{"text": map[bool]string{true: "✓ 📺 Сериал", false: "📺 Сериал"}[catCode == "show"], "callback_data": fmt.Sprintf("c:s:%s", itemID)},
	}
	catRow2 := []map[string]interface{}{
		{"text": map[bool]string{true: "✓ 📖 Книга", false: "📖 Книга"}[catCode == "book"], "callback_data": fmt.Sprintf("c:b:%s", itemID)},
		{"text": map[bool]string{true: "✓ 🎮 Игра", false: "🎮 Игра"}[catCode == "game"], "callback_data": fmt.Sprintf("c:g:%s", itemID)},
	}

	// Status Row: tailored for category type
	isPlanned := currentStatus == "" || currentStatus == "planned" || currentStatus == "в планах" || currentStatus == "у планах"
	isWatching := currentStatus == "watching" || currentStatus == "смотрю" || currentStatus == "читаю" || currentStatus == "дивлюсь"
	isCompleted := currentStatus == "completed" || currentStatus == "завершено" || currentStatus == "просмотрено" || currentStatus == "прочитано"

	labelWatching := "👁 Смотрю"
	labelCompleted := "✅ Завершено"
	if catCode == "book" {
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

	// Genre Rows dynamically based on category
	targetGenresList := genres.GetGenresList(catEn)

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
			statusRow,
			genreRow1,
			genreRow2,
			genreRow3,
			ratingRow1,
			ratingRow2,
			{
				{"text": "🎬 Открыть в Lista", "url": appURL},
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
				SELECT title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, public_rating, country
				FROM items WHERE id = $1 LIMIT 1
			`
			errScan := h.DB.Pool.QueryRow(ctx, query, startAppID).Scan(
				&dbItem.Title, &dbItem.Category, &dbItem.Genre, &dbItem.Duration, &dbItem.ReleaseYear,
				&dbItem.PosterURL, &dbItem.Description, &dbItem.YoutubeURL, &dbItem.Director, &dbItem.Cast, &dbItem.PublicRating, &dbItem.Country,
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
						SELECT title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, public_rating, country
						FROM items WHERE LOWER(TRIM(title)) = LOWER($1) LIMIT 1
					`
					errScan := h.DB.Pool.QueryRow(ctx, query, cleanT).Scan(
						&dbItem.Title, &dbItem.Category, &dbItem.Genre, &dbItem.Duration, &dbItem.ReleaseYear,
						&dbItem.PosterURL, &dbItem.Description, &dbItem.YoutubeURL, &dbItem.Director, &dbItem.Cast, &dbItem.PublicRating, &dbItem.Country,
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

	// Enrich missing data via catalog search (especially for PublicRating and Country)
	if media.PublicRating == "" || media.Description == "" || media.PosterURL == "" || media.Country == "" {
		targetLang := parser.DetectTargetLanguage(titleTrimmed, langCode)
		onlineResults := h.searchOnlineCatalog(titleTrimmed, catEn, nil, targetLang)
		if len(onlineResults) > 0 {
			var best models.CatalogSearchResult
			found := false
			if media.ReleaseYear != "" {
				for _, res := range onlineResults {
					if res.ReleaseYear == media.ReleaseYear {
						best = res
						found = true
						break
					}
				}
			}
			if !found {
				best = onlineResults[0]
			}
			
			if media.PublicRating == "" && best.PublicRating != "" {
				media.PublicRating = best.PublicRating
			}
			if media.Description == "" && best.Description != "" {
				media.Description = best.Description
			}
			if media.PosterURL == "" && best.PosterURL != "" {
				media.PosterURL = best.PosterURL
			}
			if media.ReleaseYear == "" && best.ReleaseYear != "" {
				media.ReleaseYear = best.ReleaseYear
			}
			if media.Duration == "" && best.Duration != "" {
				media.Duration = best.Duration
			}
			if media.Genre == "" && best.Genre != "" {
				media.Genre = best.Genre
			}
			if media.Director == "" && best.Director != "" {
				media.Director = best.Director
			}
			if media.Cast == "" && best.Cast != "" {
				media.Cast = best.Cast
			}
			if media.Author == "" && best.Author != "" {
				media.Author = best.Author
			}
			if media.ISBN == "" && best.ISBN != "" {
				media.ISBN = best.ISBN
			}
			if media.YoutubeURL == "" && best.YoutubeURL != "" {
				media.YoutubeURL = best.YoutubeURL
			}
			if media.Country == "" && best.Country != "" {
				media.Country = best.Country
			}
		}
	}

	if media.Country != "" {
		media.Country = mapCountryToFlag(media.Country)
	}

	itemUUID := uuid.New().String()

	ctx := context.Background()
	var finalItemID string = itemUUID
	if h.DB != nil && h.DB.Pool != nil {
		var existingID string
		checkQuery := "SELECT id FROM items WHERE user_id = $1 AND LOWER(TRIM(title)) = LOWER($2) AND (LOWER(TRIM(category)) = LOWER($3) OR LOWER(TRIM(category)) = LOWER($4))"
		args := []interface{}{userID, titleTrimmed, media.Category, catEn}
		if media.ReleaseYear != "" {
			checkQuery += " AND release_year = $5"
			args = append(args, media.ReleaseYear)
		}
		checkQuery += " LIMIT 1"
		
		checkErr := h.DB.Pool.QueryRow(ctx, checkQuery, args...).Scan(&existingID)
		if checkErr == nil && existingID != "" {
			finalItemID = existingID
			// Update missing fields if new data has director/cast/poster/duration/public_rating
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
					public_rating = CASE WHEN public_rating = '' OR public_rating IS NULL THEN $9 ELSE public_rating END,
					note = CASE WHEN note = '' OR note IS NULL THEN $10 ELSE note END,
					country = CASE WHEN country = '' OR country IS NULL THEN $11 ELSE country END,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = $12 AND user_id = $13;
			`, media.PosterURL, media.Duration, media.Genre, media.Director, media.Cast, media.Author, media.ISBN, media.YoutubeURL, media.PublicRating, rawURL, media.Country, finalItemID, userID)
		} else {
			insertQuery := `
				INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn, public_rating, country, note)
				VALUES ($1, $2, $3, $4, 'planned', 0, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
				RETURNING id;
			`
			_ = h.DB.Pool.QueryRow(ctx, insertQuery,
				itemUUID, userID, titleTrimmed, catEn, media.Genre, media.Duration, media.ReleaseYear,
				media.PosterURL, media.Description, media.YoutubeURL, media.Director, media.Cast, media.Author, media.ISBN, media.PublicRating, media.Country, rawURL,
			).Scan(&finalItemID)
		}
	}

	captionText := buildTelegramCardText(titleTrimmed, catEn, media.ReleaseYear, media.Duration, media.Genre, media.Director, media.Cast, media.Description, "planned", 0, media.PublicRating, media.Author, media.ISBN)
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

func (h *Handler) handleAdminCommand(userID int64, username string, cmd string) {
	usernameLc := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(username), "@"))
	if usernameLc != "neznayca" && usernameLc != "znayca" {
		return
	}

	cmdLower := strings.ToLower(strings.Fields(cmd)[0])
	if idx := strings.Index(cmdLower, "@"); idx != -1 {
		cmdLower = cmdLower[:idx]
	}

	ctx := context.Background()

	switch cmdLower {
	case "/stats":
		if h.DB == nil || h.DB.Pool == nil {
			return
		}
		var totalUsers int
		_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id != 0").Scan(&totalUsers)

		var totalUserItems int
		_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id != 0").Scan(&totalUserItems)

		userCatRows, err := h.DB.Pool.Query(ctx, `
			SELECT category, COUNT(*)
			FROM items
			WHERE user_id != 0
			GROUP BY category
			ORDER BY COUNT(*) DESC;
		`)
		userCats := map[string]int{}
		if err == nil {
			for userCatRows.Next() {
				var cat string
				var cnt int
				if err := userCatRows.Scan(&cat, &cnt); err == nil {
					userCats[cat] = cnt
				}
			}
			userCatRows.Close()
		}

		var totalCatalogItems int
		_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = 0").Scan(&totalCatalogItems)

		catRows, err := h.DB.Pool.Query(ctx, `
			SELECT category, COUNT(*)
			FROM items
			WHERE user_id = 0
			GROUP BY category
			ORDER BY COUNT(*) DESC;
		`)
		type catStat struct {
			cat string
			cnt int
		}
		catalogCats := []catStat{}
		if err == nil {
			for catRows.Next() {
				var cat string
				var cnt int
				if err := catRows.Scan(&cat, &cnt); err == nil {
					catalogCats = append(catalogCats, catStat{cat, cnt})
				}
			}
			catRows.Close()
		}

		var sb strings.Builder
		sb.WriteString("📊 <b>Общая статистика Lista</b>\n\n")
		sb.WriteString(fmt.Sprintf("👥 <b>Пользователи:</b> %d чел.\n\n", totalUsers))

		sb.WriteString(fmt.Sprintf("👤 <b>Элементы пользователей (всего %s):</b>\n", formatNumberSpace(totalUserItems)))
		for _, catKey := range []string{"movie", "show", "book", "game"} {
			cnt := userCats[catKey]
			sb.WriteString(fmt.Sprintf("  • %s: <b>%s</b>\n", formatCategoryLabelWithEmoji(catKey), formatNumberSpace(cnt)))
		}
		for catKey, cnt := range userCats {
			if catKey != "movie" && catKey != "show" && catKey != "book" && catKey != "game" {
				sb.WriteString(fmt.Sprintf("  • %s: <b>%s</b>\n", formatCategoryLabelWithEmoji(catKey), formatNumberSpace(cnt)))
			}
		}

		sb.WriteString(fmt.Sprintf("\n📦 <b>Кэш каталога (всего в базе %s):</b>\n", formatNumberSpace(totalCatalogItems)))
		for _, item := range catalogCats {
			sb.WriteString(fmt.Sprintf("  • %s: <b>%s</b>\n", formatCategoryLabelWithEmoji(item.cat), formatNumberSpace(item.cnt)))
		}

		var dbSizeBytes int64
		_ = h.DB.Pool.QueryRow(ctx, "SELECT pg_database_size(current_database())").Scan(&dbSizeBytes)

		var appFilesSize int64
		appDir := "/opt/tracklist"
		if _, err := os.Stat(appDir); os.IsNotExist(err) {
			appDir, _ = os.Getwd()
		}
		_ = filepath.Walk(appDir, func(_ string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() {
				appFilesSize += info.Size()
			}
			return nil
		})

		totalAppSizeBytes := dbSizeBytes + appFilesSize

		sb.WriteString("\n💾 <b>Размеры системы:</b>\n")
		sb.WriteString(fmt.Sprintf("  • 🗄 <b>Размер базы данных:</b> <code>%s</code>\n", formatByteSize(dbSizeBytes)))
		if appFilesSize > 0 {
			sb.WriteString(fmt.Sprintf("  • ⚙ <b>Файлы сервера (бинарник):</b> <code>%s</code>\n", formatByteSize(appFilesSize)))
			sb.WriteString(fmt.Sprintf("  • 🐘 <b>Размер всего приложения:</b> <code>%s</code>\n", formatByteSize(totalAppSizeBytes)))
		}

		h.sendAdminBotMessage(userID, sb.String())

	case "/users", "/count", "/users_count":
		if h.DB == nil || h.DB.Pool == nil {
			return
		}
		var totalUsers int
		err := h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id != 0").Scan(&totalUsers)
		if err != nil {
			log.Printf("[AdminCommand] Count error: %v", err)
			return
		}

		msg := fmt.Sprintf("📊 <b>Статистика пользователей</b>\n\n👥 Всего пользователей в приложении: <b>%d</b>", totalUsers)
		h.sendAdminBotMessage(userID, msg)

	case "/users_list", "/list", "/userslist", "/admin_users":
		if h.DB == nil || h.DB.Pool == nil {
			return
		}
		var totalUsers int
		_ = h.DB.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id != 0").Scan(&totalUsers)

		rows, err := h.DB.Pool.Query(ctx, `
			SELECT id, username, first_name, last_name, created_at, updated_at
			FROM users
			WHERE id != 0
			ORDER BY created_at ASC
			LIMIT 50;
		`)
		if err != nil {
			log.Printf("[AdminCommand] List error: %v", err)
			return
		}
		defer rows.Close()

		var sb strings.Builder
		sb.WriteString(fmt.Sprintf("👥 <b>Пользователи приложения (%d):</b>\n\n", totalUsers))

		idx := 1
		for rows.Next() {
			var id int64
			var uname, fName, lName string
			var createdAt, updatedAt time.Time

			if err := rows.Scan(&id, &uname, &fName, &lName, &createdAt, &updatedAt); err != nil {
				continue
			}

			fullName := strings.TrimSpace(fName + " " + lName)
			if fullName == "" {
				fullName = "Пользователь"
			}
			cleanFullName := html.EscapeString(fullName)
			cleanUname := html.EscapeString(strings.TrimSpace(uname))

			var userLink string
			if cleanUname != "" {
				userLink = fmt.Sprintf("<a href=\"https://t.me/%s\">@%s</a> (%s)", cleanUname, cleanUname, cleanFullName)
			} else {
				userLink = fmt.Sprintf("<a href=\"tg://user?id=%d\">%s</a> (ID: <code>%d</code>)", id, cleanFullName, id)
			}

			firstIn := createdAt.Format("02.01.2006 15:04")
			lastIn := updatedAt.Format("02.01.2006 15:04")

			entry := fmt.Sprintf("%d. %s\n   🗓 <b>Первый вход:</b> <code>%s</code>\n   🕒 <b>Последний вход:</b> <code>%s</code>\n\n", idx, userLink, firstIn, lastIn)

			if sb.Len()+len(entry) > 3900 {
				break
			}
			sb.WriteString(entry)
			idx++
		}

		h.sendAdminBotMessage(userID, sb.String())
	}
}

func formatCategoryLabelWithEmoji(cat string) string {
	switch strings.ToLower(strings.TrimSpace(cat)) {
	case "movie", "movies", "фильм", "фильмы":
		return "🎬 Фильмы"
	case "show", "shows", "series", "сериал", "сериалы":
		return "📺 Сериалы"
	case "book", "books", "книга", "книги":
		return "📚 Книги"
	case "game", "games", "игра", "игры":
		return "🎮 Игры"
	case "audiobook", "аудиокнига", "аудиокниги":
		return "🎧 Аудиокниги"
	case "podcast", "podcasts", "подкаст", "подкасты":
		return "🎙 Подкасты"
	default:
		if cat == "" {
			return "📁 Прочее"
		}
		return "📁 " + strings.Title(cat)
	}
}

func formatNumberSpace(n int) string {
	in := strconv.Itoa(n)
	out := ""
	for i, c := range in {
		if i > 0 && (len(in)-i)%3 == 0 {
			out += " "
		}
		out += string(c)
	}
	return out
}

func formatByteSize(b int64) string {
	if b <= 0 {
		return "0 B"
	}
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	units := []string{"KB", "MB", "GB", "TB"}
	return fmt.Sprintf("%.1f %s", float64(b)/float64(div), units[exp])
}

func (h *Handler) sendAdminBotMessage(userID int64, text string) {
	payload := map[string]interface{}{
		"chat_id":                  userID,
		"text":                     text,
		"parse_mode":               "HTML",
		"disable_web_page_preview": true,
	}
	h.sendBotAPIRequest("sendMessage", payload)
}

func (h *Handler) sendBotAPIRequestWithErr(method string, payload interface{}) error {
	if h.BotToken == "" {
		return nil
	}

	jsonBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if h.outboundSem != nil {
		h.outboundSem <- struct{}{}
		defer func() { <-h.outboundSem }()
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/%s", h.BotToken, method)

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonBytes))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(100*(attempt+1)) * time.Millisecond)
			continue
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == 429 { // Too Many Requests from Telegram API
			log.Printf("[TelegramAPI] 429 Rate Limit for %s (attempt %d). Backing off...", method, attempt+1)
			time.Sleep(time.Duration(1*(attempt+1)) * time.Second)
			lastErr = fmt.Errorf("telegram API rate limit 429: %s", string(respBody))
			continue
		}

		if resp.StatusCode != http.StatusOK {
			log.Printf("[TelegramAPI] %s error %d: %s", method, resp.StatusCode, string(respBody))
			return fmt.Errorf("telegram API status %d: %s", resp.StatusCode, string(respBody))
		}
		return nil
	}
	return lastErr
}

func formatCategorySingle(cat string) string {
	switch strings.ToLower(cat) {
	case "movie", "фильм", "фильмы":
		return "Фильм"
	case "show", "сериал", "сериалы":
		return "Сериал"
	case "book", "книга", "книги":
		return "Книга"
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
			"id":          fmt.Sprintf("item_%d", i),
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
	query = strings.TrimSpace(query)
	categoryFilter, cleanQuery := parseSearchQuery(query)
	targetLang := parser.DetectTargetLanguage(cleanQuery, langCode)

	type resStruct struct {
		items []models.CatalogSearchResult
	}

	ch := make(chan resStruct, 10)
	var numSources int

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	switch categoryFilter {
	case "book":
		numSources = 2
		go func() { ch <- resStruct{items: h.searchDBCatalog(ctx, cleanQuery, "book")} }()
		go func() { ch <- resStruct{items: parser.SearchBooksMultiSource(cleanQuery)} }()

	case "game":
		numSources = 2
		go func() { ch <- resStruct{items: h.searchDBCatalog(ctx, cleanQuery, "game")} }()
		go func() { ch <- resStruct{items: parser.SearchGamesMultiSource(cleanQuery)} }()

	case "movie":
		if targetLang == "ru-RU" {
			numSources = 5
			go func() { ch <- resStruct{items: fetchKinopoiskInline(cleanQuery, h.KinopoiskAPIKey, "movie")} }()
		} else {
			numSources = 4
		}
		go func() { ch <- resStruct{items: h.searchDBCatalog(ctx, cleanQuery, "movie")} }()
		go func() { ch <- resStruct{items: fetchTMDbInline(cleanQuery, h.TMDBAPIKey, "movie", targetLang)} }()
		go func() { ch <- resStruct{items: fetchITunesInline(cleanQuery, "movie")} }()
		go func() { ch <- resStruct{items: fetchWikiInline(cleanQuery, "movie")} }()

	case "show":
		if targetLang == "ru-RU" {
			numSources = 5
			go func() { ch <- resStruct{items: fetchKinopoiskInline(cleanQuery, h.KinopoiskAPIKey, "show")} }()
		} else {
			numSources = 4
		}
		go func() { ch <- resStruct{items: h.searchDBCatalog(ctx, cleanQuery, "show")} }()
		go func() { ch <- resStruct{items: fetchTMDbInline(cleanQuery, h.TMDBAPIKey, "show", targetLang)} }()
		go func() { ch <- resStruct{items: fetchTVMazeInline(cleanQuery, h.TMDBAPIKey)} }()
		go func() { ch <- resStruct{items: fetchWikiInline(cleanQuery, "show")} }()

	default: // Default mode: Movies & Series only
		if targetLang == "ru-RU" {
			numSources = 5
			go func() { ch <- resStruct{items: fetchKinopoiskInline(cleanQuery, h.KinopoiskAPIKey, "all")} }()
		} else {
			numSources = 4
		}
		go func() { ch <- resStruct{items: h.searchDBCatalog(ctx, cleanQuery, "movies_and_shows")} }()
		go func() { ch <- resStruct{items: fetchTMDbInline(cleanQuery, h.TMDBAPIKey, "all", targetLang)} }()
		go func() { ch <- resStruct{items: fetchTVMazeInline(cleanQuery, h.TMDBAPIKey)} }()
		go func() { ch <- resStruct{items: fetchITunesInline(cleanQuery, "movie")} }()
	}

	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()

	var combined []models.CatalogSearchResult
	seenTitles := make(map[string]bool)
	received := 0

	for received < numSources {
		select {
		case res := <-ch:
			received++
			for _, item := range res.items {
				catEn := mapCategoryToEn(item.Category)
				item.Category = catEn

				// Filter strictly by target category requirement
				if categoryFilter != "" && catEn != categoryFilter {
					continue
				}
				if categoryFilter == "" && (catEn != "movie" && catEn != "show") {
					continue
				}

				// Ensure deterministic UUID
				rawSourceID := item.ID
				if rawSourceID == "" {
					rawSourceID = item.Title + "_" + catEn
				}
				if _, err := uuid.Parse(item.ID); err != nil {
					item.ID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawSourceID)).String()
				}

				tKey := strings.ToLower(strings.TrimSpace(item.Title)) + "_" + catEn
				if !seenTitles[tKey] {
					seenTitles[tKey] = true
					combined = append(combined, item)
					go h.saveCatalogItemToDB(item)
				}
			}
		case <-timer.C:
			received = numSources
		}
	}

	if len(combined) > 15 {
		combined = combined[:15]
	}

	return combined
}

