package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lista-backend/pkg/models"
)

type SharedListRequest struct {
	Title string        `json:"title"`
	Items []models.Item `json:"items"`
}

// POST /api/public/shared_lists
func (h *Handler) CreateSharedList(w http.ResponseWriter, r *http.Request) {
	var req SharedListRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		http.Error(w, `{"error":"invalid title or payload"}`, http.StatusBadRequest)
		return
	}

	shortUUID := strings.ReplaceAll(uuid.New().String(), "-", "")[:8]
	id := fmt.Sprintf("sl_%s", shortUUID)
	jsonData, err := json.Marshal(req)
	if err != nil {
		http.Error(w, `{"error":"failed to serialize list"}`, http.StatusInternalServerError)
		return
	}

	h.cacheMu.Lock()
	h.sharedListsCache[id] = jsonData
	h.cacheMu.Unlock()

	if h.DB != nil && h.DB.Pool != nil {
		_, err = h.DB.Pool.Exec(r.Context(), `INSERT INTO shared_lists (id, title, data) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, id, req.Title, jsonData)
		if err != nil {
			log.Printf("Failed to insert shared_list: %v", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":    id,
		"title": req.Title,
	})
}

// GET /api/public/shared_lists/{id}
func (h *Handler) GetSharedList(w http.ResponseWriter, r *http.Request) {
	listID := chi.URLParam(r, "id")
	if listID == "" {
		http.Error(w, `{"error":"list id required"}`, http.StatusBadRequest)
		return
	}

	h.cacheMu.RLock()
	data, found := h.sharedListsCache[listID]
	h.cacheMu.RUnlock()

	if !found && h.DB != nil && h.DB.Pool != nil {
		err := h.DB.Pool.QueryRow(r.Context(), `SELECT data FROM shared_lists WHERE id = $1 LIMIT 1`, listID).Scan(&data)
		if err == nil && len(data) > 0 {
			found = true
			h.cacheMu.Lock()
			h.sharedListsCache[listID] = data
			h.cacheMu.Unlock()
		}
	}

	if !found || len(data) == 0 {
		http.Error(w, `{"error":"shared list not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}



