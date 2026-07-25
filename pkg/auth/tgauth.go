package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"lista-backend/pkg/models"
)

type contextKey string

const UserContextKey contextKey = "user"

type TGUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	PhotoURL  string `json:"photo_url"`
}

// ValidateInitData checks Telegram WebApp initData HMAC-SHA256 hash
func ValidateInitData(initDataRaw string, botToken string) (*TGUser, error) {
	if initDataRaw == "" {
		return nil, fmt.Errorf("initData is empty")
	}

	values, err := url.ParseQuery(initDataRaw)
	if err != nil {
		return nil, fmt.Errorf("invalid query string: %w", err)
	}

	hash := values.Get("hash")
	if hash == "" {
		return nil, fmt.Errorf("hash missing in initData")
	}

	// Remove hash from values
	values.Del("hash")

	// Sort keys alphabetically
	var keys []string
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build data check string
	var checkArr []string
	for _, k := range keys {
		checkArr = append(checkArr, fmt.Sprintf("%s=%s", k, values.Get(k)))
	}
	dataCheckString := strings.Join(checkArr, "\n")

	// Compute secret key: HMAC-SHA256("WebAppData", botToken)
	mac := hmac.New(sha256.New, []byte("WebAppData"))
	mac.Write([]byte(botToken))
	secretKey := mac.Sum(nil)

	// Compute data check hash: HMAC-SHA256(secretKey, dataCheckString)
	macCheck := hmac.New(sha256.New, secretKey)
	macCheck.Write([]byte(dataCheckString))
	expectedHash := hex.EncodeToString(macCheck.Sum(nil))

	if !hmac.Equal([]byte(expectedHash), []byte(hash)) {
		return nil, fmt.Errorf("unauthorized initData signature mismatch")
	}

	// Parse user field from initData
	userStr := values.Get("user")
	if userStr == "" {
		return nil, fmt.Errorf("user field missing in initData")
	}

	var tgUser TGUser
	if err := json.Unmarshal([]byte(userStr), &tgUser); err != nil {
		return nil, fmt.Errorf("failed to unmarshal user JSON: %w", err)
	}

	return &tgUser, nil
}

// AuthMiddleware extracts X-Telegram-Init-Data or fallback auth for dev testing
func AuthMiddleware(botToken string, isDevMode bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			initData := r.Header.Get("X-Telegram-Init-Data")

			var tgUser *TGUser
			var err error

			if initData != "" {
				tgUser, err = ValidateInitData(initData, botToken)
				if err != nil {
					http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusUnauthorized)
					return
				}
			} else if isDevMode {
				// Allow fallback test user in dev mode
				testUserIDStr := r.Header.Get("X-Test-User-ID")
				var userID int64 = 1001
				if testUserIDStr != "" {
					if parsed, err := strconv.ParseInt(testUserIDStr, 10, 64); err == nil {
						userID = parsed
					}
				}
				tgUser = &TGUser{
					ID:        userID,
					FirstName: "Анна",
					LastName:  "Иванова",
					Username:  "anna_test",
				}
			} else {
				http.Error(w, `{"error":"missing X-Telegram-Init-Data header"}`, http.StatusUnauthorized)
				return
			}

			// Save user object into context
			user := &models.User{
				ID:        tgUser.ID,
				Username:  tgUser.Username,
				FirstName: tgUser.FirstName,
				LastName:  tgUser.LastName,
				PhotoURL:  tgUser.PhotoURL,
			}

			ctx := r.Context()
			ctx = SetUserContext(ctx, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func SetUserContext(ctx context.Context, user *models.User) context.Context {
	return context.WithValue(ctx, UserContextKey, user)
}

func GetUserFromContext(r *http.Request) (*models.User, bool) {
	user, ok := r.Context().Value(UserContextKey).(*models.User)
	return user, ok
}
