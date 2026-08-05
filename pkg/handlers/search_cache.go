package handlers

import (
	"sync"
	"time"

	"lista-backend/pkg/models"
)

type cacheItem struct {
	data      interface{}
	expiration time.Time
}

type SearchCache struct {
	mu    sync.RWMutex
	items map[string]cacheItem
	ttl   time.Duration
}

func NewSearchCache(ttl time.Duration) *SearchCache {
	sc := &SearchCache{
		items: make(map[string]cacheItem),
		ttl:   ttl,
	}
	go sc.startCleanup()
	return sc
}

func (sc *SearchCache) Get(key string) (interface{}, bool) {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	item, found := sc.items[key]
	if !found {
		return nil, false
	}
	if time.Now().After(item.expiration) {
		return nil, false
	}
	return item.data, true
}

func (sc *SearchCache) Set(key string, data interface{}) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	sc.items[key] = cacheItem{
		data:      data,
		expiration: time.Now().Add(sc.ttl),
	}
}

func (sc *SearchCache) GetCatalogResults(key string) ([]models.CatalogSearchResult, bool) {
	val, ok := sc.Get(key)
	if !ok {
		return nil, false
	}
	res, ok := val.([]models.CatalogSearchResult)
	return res, ok
}

func (sc *SearchCache) GetYouTubeResults(key string) ([]models.YouTubeVideoItem, bool) {
	val, ok := sc.Get(key)
	if !ok {
		return nil, false
	}
	res, ok := val.([]models.YouTubeVideoItem)
	return res, ok
}

func (sc *SearchCache) startCleanup() {
	ticker := time.NewTicker(2 * time.Minute)
	for range ticker.C {
		sc.mu.Lock()
		now := time.Now()
		for key, item := range sc.items {
			if now.After(item.expiration) {
				delete(sc.items, key)
			}
		}
		sc.mu.Unlock()
	}
}
