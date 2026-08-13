package ratelimit

import (
	"fmt"
	"sync"
	"time"
)

type entry struct {
	lastTime time.Time
	tokens   float64
}

// RateLimiter is a general-purpose in-memory rate limiter with token bucket & interval checks.
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

// -------------------------------------------------------------------------
// AUTO-JAIL (Blacklist for repeated 429 violators)
// -------------------------------------------------------------------------

type jailRecord struct {
	strikeTimestamps []time.Time // Timestamps of 429 errors within 1 minute
	jailTier         int         // 0: none, 1: 15 min jail, 2+: 24 hour jail
	jailedUntil      time.Time   // Expiration of current ban
	lastStrikeTime   time.Time
}

type AutoJail struct {
	mu      sync.Mutex
	records map[string]*jailRecord
}

func NewAutoJail() *AutoJail {
	aj := &AutoJail{
		records: make(map[string]*jailRecord),
	}
	go aj.startCleanup()
	return aj
}

// IsJailed returns true if the key is currently serving a jail sentence.
func (aj *AutoJail) IsJailed(key string) (bool, time.Duration) {
	aj.mu.Lock()
	defer aj.mu.Unlock()

	rec, exists := aj.records[key]
	if !exists {
		return false, 0
	}

	now := time.Now()
	if now.Before(rec.jailedUntil) {
		return true, rec.jailedUntil.Sub(now)
	}

	return false, 0
}

// Record429 records a 429 violation.
// If violations >= 5 within 60s:
// - Tier 1: 15 minutes jail.
// - Tier 2 (subsequent violation): 24 hours jail.
func (aj *AutoJail) Record429(key string) (jailed bool, tier int, duration time.Duration) {
	aj.mu.Lock()
	defer aj.mu.Unlock()

	now := time.Now()
	rec, exists := aj.records[key]
	if !exists {
		rec = &jailRecord{
			strikeTimestamps: []time.Time{now},
			jailTier:         0,
			lastStrikeTime:   now,
		}
		aj.records[key] = rec
		return false, 0, 0
	}

	rec.lastStrikeTime = now

	// If already in active jail, return current jail status
	if now.Before(rec.jailedUntil) {
		return true, rec.jailTier, rec.jailedUntil.Sub(now)
	}

	// Filter timestamps within last 60 seconds
	var recent []time.Time
	oneMinAgo := now.Add(-60 * time.Second)
	for _, t := range rec.strikeTimestamps {
		if t.After(oneMinAgo) {
			recent = append(recent, t)
		}
	}
	recent = append(recent, now)
	rec.strikeTimestamps = recent

	// Check if threshold >= 5 reached in 1 minute
	if len(recent) >= 5 {
		rec.strikeTimestamps = nil // Reset window
		rec.jailTier++

		var jailDuration time.Duration
		if rec.jailTier == 1 {
			jailDuration = 15 * time.Minute
		} else {
			jailDuration = 24 * time.Hour
		}

		rec.jailedUntil = now.Add(jailDuration)
		return true, rec.jailTier, jailDuration
	}

	return false, 0, 0
}

func (aj *AutoJail) startCleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		aj.mu.Lock()
		now := time.Now()
		for key, rec := range aj.records {
			if now.After(rec.jailedUntil) && now.Sub(rec.lastStrikeTime) > 2*time.Hour {
				delete(aj.records, key)
			}
		}
		aj.mu.Unlock()
	}
}

// -------------------------------------------------------------------------
// RECOMMENDATIONS QUOTA & COOLDOWN
// -------------------------------------------------------------------------

type userRecQuota struct {
	lastGenTime time.Time
	dailyCount  int
	currentDay  string // YYYY-MM-DD UTC
}

type RecommendationsLimiter struct {
	mu        sync.Mutex
	quotas    map[int64]*userRecQuota
	maxPerDay int
	cooldown  time.Duration
}

func NewRecommendationsLimiter(maxPerDay int, cooldown time.Duration) *RecommendationsLimiter {
	rl := &RecommendationsLimiter{
		quotas:    make(map[int64]*userRecQuota),
		maxPerDay: maxPerDay, // 5
		cooldown:  cooldown,  // 5 * time.Minute
	}
	go rl.startCleanup()
	return rl
}

// CheckAndConsume checks if user is allowed to generate AI recommendations.
// If allowed, records the generation and returns allowed=true.
func (rl *RecommendationsLimiter) CheckAndConsume(userID int64) (allowed bool, errCode string, msg string, retryAfter time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now().UTC()
	today := now.Format("2006-01-02")

	q, exists := rl.quotas[userID]
	if !exists {
		rl.quotas[userID] = &userRecQuota{
			lastGenTime: now,
			dailyCount:  1,
			currentDay:  today,
		}
		return true, "", "", 0
	}

	// Reset daily count on a new calendar day (UTC)
	if q.currentDay != today {
		q.currentDay = today
		q.dailyCount = 0
	}

	// 1. Check cooldown (5 minutes)
	elapsed := now.Sub(q.lastGenTime)
	if elapsed < rl.cooldown {
		remaining := rl.cooldown - elapsed
		remMin := int(remaining.Minutes())
		remSec := int(remaining.Seconds()) % 60
		return false, "rate_limit_exceeded",
			fmt.Sprintf("Рекомендации можно обновлять не чаще 1 раза в 5 минут. Пожалуйста, подождите %d мин. %d сек.", remMin, remSec),
			remaining
	}

	// 2. Check daily quota (5 generations per day)
	if q.dailyCount >= rl.maxPerDay {
		return false, "daily_limit_exceeded",
			fmt.Sprintf("Достигнут лимит генераций рекомендаций на сегодня (%d из %d). Лимит обновится завтра.", q.dailyCount, rl.maxPerDay),
			24 * time.Hour
	}

	q.lastGenTime = now
	q.dailyCount++
	return true, "", "", 0
}

func (rl *RecommendationsLimiter) startCleanup() {
	ticker := time.NewTicker(2 * time.Hour)
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now().UTC()
		today := now.Format("2006-01-02")
		for id, q := range rl.quotas {
			if q.currentDay != today && now.Sub(q.lastGenTime) > 48*time.Hour {
				delete(rl.quotas, id)
			}
		}
		rl.mu.Unlock()
	}
}

// -------------------------------------------------------------------------
// SEARCH RATE LIMITER (Max 20 requests per minute)
// -------------------------------------------------------------------------

type SearchLimiter struct {
	mu      sync.Mutex
	history map[string][]time.Time
	limit   int           // 20
	window  time.Duration // 1 minute
}

func NewSearchLimiter(limit int, window time.Duration) *SearchLimiter {
	sl := &SearchLimiter{
		history: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
	}
	go sl.startCleanup()
	return sl
}

// AllowSearch checks if key is within search rate limit (20 req/min).
func (sl *SearchLimiter) AllowSearch(key string) (allowed bool, retryAfter time.Duration) {
	sl.mu.Lock()
	defer sl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-sl.window)

	timestamps := sl.history[key]
	var valid []time.Time
	for _, t := range timestamps {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= sl.limit {
		oldest := valid[0]
		retryAfter = sl.window - now.Sub(oldest)
		if retryAfter <= 0 {
			retryAfter = time.Second
		}
		sl.history[key] = valid
		return false, retryAfter
	}

	valid = append(valid, now)
	sl.history[key] = valid
	return true, 0
}

func (sl *SearchLimiter) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		sl.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-sl.window)
		for key, list := range sl.history {
			if len(list) == 0 || list[len(list)-1].Before(cutoff) {
				delete(sl.history, key)
			}
		}
		sl.mu.Unlock()
	}
}

// -------------------------------------------------------------------------
// BOT FLOOD LIMITER (Link intervals, inline limits, warning throttle)
// -------------------------------------------------------------------------

type botUserFloodState struct {
	lastLinkTime   time.Time
	linkTimestamps []time.Time
	lastInlineTime time.Time
	lastWarnTime   time.Time
}

type BotFloodLimiter struct {
	mu           sync.Mutex
	users        map[int64]*botUserFloodState
	linkInterval time.Duration // 4 seconds
	linkPerMin   int           // 15
	inlineDelay  time.Duration // 500 ms
	warnThrottle time.Duration // 10 seconds
}

func NewBotFloodLimiter() *BotFloodLimiter {
	bfl := &BotFloodLimiter{
		users:        make(map[int64]*botUserFloodState),
		linkInterval: 4 * time.Second,
		linkPerMin:   15,
		inlineDelay:  500 * time.Millisecond,
		warnThrottle: 10 * time.Second,
	}
	go bfl.startCleanup()
	return bfl
}

// AllowLink checks if user is allowed to send a link (1 link per 4s, max 15/min).
// shouldWarn indicates if a warning should be sent to the user (throttled).
func (bfl *BotFloodLimiter) AllowLink(userID int64) (allowed bool, shouldWarn bool) {
	bfl.mu.Lock()
	defer bfl.mu.Unlock()

	now := time.Now()
	st, exists := bfl.users[userID]
	if !exists {
		st = &botUserFloodState{
			lastLinkTime:   now,
			linkTimestamps: []time.Time{now},
		}
		bfl.users[userID] = st
		return true, false
	}

	// Check 4-second cooldown
	if now.Sub(st.lastLinkTime) < bfl.linkInterval {
		shouldWarn = bfl.checkShouldWarn(st, now)
		return false, shouldWarn
	}

	// Check 15 links per minute window
	oneMinAgo := now.Add(-60 * time.Second)
	var recent []time.Time
	for _, t := range st.linkTimestamps {
		if t.After(oneMinAgo) {
			recent = append(recent, t)
		}
	}
	st.linkTimestamps = recent

	if len(recent) >= bfl.linkPerMin {
		shouldWarn = bfl.checkShouldWarn(st, now)
		return false, shouldWarn
	}

	st.lastLinkTime = now
	st.linkTimestamps = append(st.linkTimestamps, now)
	return true, false
}

func (bfl *BotFloodLimiter) checkShouldWarn(st *botUserFloodState, now time.Time) bool {
	if now.Sub(st.lastWarnTime) >= bfl.warnThrottle {
		st.lastWarnTime = now
		return true
	}
	return false
}

// AllowInline checks if inline query is allowed (max 1 per 0.5s).
func (bfl *BotFloodLimiter) AllowInline(userID int64) bool {
	bfl.mu.Lock()
	defer bfl.mu.Unlock()

	now := time.Now()
	st, exists := bfl.users[userID]
	if !exists {
		st = &botUserFloodState{
			lastInlineTime: now,
		}
		bfl.users[userID] = st
		return true
	}

	if now.Sub(st.lastInlineTime) < bfl.inlineDelay {
		return false
	}

	st.lastInlineTime = now
	return true
}

func (bfl *BotFloodLimiter) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		bfl.mu.Lock()
		now := time.Now()
		for id, st := range bfl.users {
			if now.Sub(st.lastLinkTime) > 30*time.Minute && now.Sub(st.lastInlineTime) > 30*time.Minute {
				delete(bfl.users, id)
			}
		}
		bfl.mu.Unlock()
	}
}

// -------------------------------------------------------------------------
// TELEGRAM OUTBOUND MESSAGING LIMITER (30 msg/s global, 1 msg/s per chat)
// -------------------------------------------------------------------------

type OutboundLimiter struct {
	mu           sync.Mutex
	globalTokens float64
	lastGlobal   time.Time
	chatTokens   map[int64]time.Time
}

func NewOutboundLimiter() *OutboundLimiter {
	return &OutboundLimiter{
		globalTokens: 30.0,
		lastGlobal:   time.Now(),
		chatTokens:   make(map[int64]time.Time),
	}
}

// WaitOutbound enforces Telegram outbound limits:
// 1. Max 30 messages/sec globally.
// 2. Max 1 message/sec per chat.
func (ol *OutboundLimiter) WaitOutbound(chatID int64) {
	ol.mu.Lock()
	now := time.Now()

	// 1. Global limit refill (30 tokens/sec, max 30)
	elapsed := now.Sub(ol.lastGlobal).Seconds()
	ol.globalTokens += elapsed * 30.0
	if ol.globalTokens > 30.0 {
		ol.globalTokens = 30.0
	}
	ol.lastGlobal = now

	if ol.globalTokens < 1.0 {
		wait := time.Duration((1.0 - ol.globalTokens) / 30.0 * float64(time.Second))
		ol.mu.Unlock()
		time.Sleep(wait)
		ol.mu.Lock()
	}
	ol.globalTokens -= 1.0

	// 2. Per-chat limit (1 msg per 1s)
	if chatID != 0 {
		if lastChatTime, exists := ol.chatTokens[chatID]; exists {
			chatElapsed := now.Sub(lastChatTime)
			if chatElapsed < time.Second {
				wait := time.Second - chatElapsed
				ol.chatTokens[chatID] = now.Add(wait)
				ol.mu.Unlock()
				time.Sleep(wait)
				return
			}
		}
		ol.chatTokens[chatID] = time.Now()
	}
	ol.mu.Unlock()
}
