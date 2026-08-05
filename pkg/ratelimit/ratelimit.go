package ratelimit

import (
	"sync"
	"time"
)

type entry struct {
	lastTime time.Time
	tokens   float64
}

type RateLimiter struct {
	mu          sync.Mutex
	entries     map[string]*entry
	cleanupFreq time.Duration
	ttl         time.Duration
}

func NewRateLimiter(cleanupFreq, ttl time.Duration) *RateLimiter {
	rl := &RateLimiter{
		entries:     make(map[string]*entry),
		cleanupFreq: cleanupFreq,
		ttl:         ttl,
	}
	go rl.startCleanup()
	return rl
}

// Allow checks if a request identified by key is allowed based on minInterval (e.g. 2 seconds).
// If less time than minInterval has passed since the last allowed request, it returns false.
func (rl *RateLimiter) Allow(key string, minInterval time.Duration) (allowed bool, remainingWait time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	e, exists := rl.entries[key]
	if !exists {
		rl.entries[key] = &entry{
			lastTime: now,
		}
		return true, 0
	}

	elapsed := now.Sub(e.lastTime)
	if elapsed < minInterval {
		return false, minInterval - elapsed
	}

	e.lastTime = now
	return true, 0
}

// AllowBurst uses token bucket logic: capacity N tokens, refill rate.
func (rl *RateLimiter) AllowBurst(key string, capacity int, refillInterval time.Duration) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	e, exists := rl.entries[key]
	if !exists {
		rl.entries[key] = &entry{
			lastTime: now,
			tokens:   float64(capacity - 1),
		}
		return true
	}

	elapsed := now.Sub(e.lastTime)
	// Refill tokens based on elapsed time
	tokensToAdd := elapsed.Seconds() / refillInterval.Seconds()
	e.tokens += tokensToAdd
	if e.tokens > float64(capacity) {
		e.tokens = float64(capacity)
	}
	e.lastTime = now

	if e.tokens >= 1.0 {
		e.tokens -= 1.0
		return true
	}

	return false
}

func (rl *RateLimiter) startCleanup() {
	ticker := time.NewTicker(rl.cleanupFreq)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		for key, e := range rl.entries {
			if now.Sub(e.lastTime) > rl.ttl {
				delete(rl.entries, key)
			}
		}
		rl.mu.Unlock()
	}
}
