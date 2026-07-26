package models

import (
	"time"
)

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	FirstName string    `json:"first_name"`
	LastName  string    `json:"last_name"`
	PhotoURL  string    `json:"photo_url"`
	Welcomed  bool      `json:"welcomed"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Item struct {
	ID          string     `json:"id"`
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title"`
	Category    string     `json:"category"`    // 'movie', 'show', 'book', 'audiobook', 'podcast', 'game'
	Status      string     `json:"status"`      // 'watching', 'completed', 'planned', 'paused'
	Rating      int        `json:"rating"`      // 0 to 10
	Genre       string     `json:"genre"`
	Duration    string     `json:"duration"`
	ReleaseYear string     `json:"release_year"`
	PosterURL   string     `json:"poster_url"`
	Description string     `json:"description"`
	Note        string     `json:"note"`
	RawInput    string     `json:"raw_input"`   // For future AI context parsing
	AIParsed    bool       `json:"ai_parsed"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateItemRequest struct {
	Title       string `json:"title"`
	Category    string `json:"category"`
	Status      string `json:"status"`
	Rating      int    `json:"rating"`
	Genre       string `json:"genre"`
	Duration    string `json:"duration"`
	ReleaseYear string `json:"release_year"`
	PosterURL   string `json:"poster_url"`
	Description string `json:"description"`
	Note        string `json:"note"`
	RawInput    string `json:"raw_input"`
}

type UpdateItemRequest struct {
	Title       *string `json:"title,omitempty"`
	Category    *string `json:"category,omitempty"`
	Status      *string `json:"status,omitempty"`
	Rating      *int    `json:"rating,omitempty"`
	Genre       *string `json:"genre,omitempty"`
	Duration    *string `json:"duration,omitempty"`
	ReleaseYear *string `json:"release_year,omitempty"`
	PosterURL   *string `json:"poster_url,omitempty"`
	Description *string `json:"description,omitempty"`
	Note        *string `json:"note,omitempty"`
	RawInput    *string `json:"raw_input,omitempty"`
}

type CatalogSearchResult struct {
	Title       string `json:"title"`
	Category    string `json:"category"`
	Genre       string `json:"genre"`
	Duration    string `json:"duration"`
	ReleaseYear string `json:"release_year"`
	PosterURL   string `json:"poster_url"`
	Description string `json:"description"`
}

type CategoryCount struct {
	Category string `json:"category"`
	Count    int    `json:"count"`
}

type UserProfileResponse struct {
	User           User            `json:"user"`
	TotalItems     int             `json:"total_items"`
	CompletedCount int             `json:"completed_count"`
	WatchingCount  int             `json:"watching_count"`
	CurrentStreak  int             `json:"current_streak"`
	MonthlyCount   int             `json:"monthly_count"`
	MonthlyHours   int             `json:"monthly_hours"`
	Categories     []CategoryCount `json:"categories"`
}

type StatsResponse struct {
	TotalItems        int                `json:"total_items"`
	CompletedItems    int                `json:"completed_items"`
	TotalHours        int                `json:"total_hours"`
	MonthlyAdded      int                `json:"monthly_added"`
	GrowthPercentage  float64            `json:"growth_percentage"`
	CategoryPercentage map[string]float64 `json:"category_percentage"`
	WeeklyActivity    []int              `json:"weekly_activity"`
}

type TelegramUpdate struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		MessageID int `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
			LastName  string `json:"last_name"`
			Username  string `json:"username"`
		} `json:"from"`
		Chat *struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
}
