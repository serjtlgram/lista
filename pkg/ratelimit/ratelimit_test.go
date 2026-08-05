package ratelimit

import (
	"testing"
	"time"
)

func TestRateLimiter_Allow(t *testing.T) {
	rl := NewRateLimiter(1*time.Minute, 1*time.Minute)

	key := "user_123"
	interval := 500 * time.Millisecond

	// 1st request - allowed
	allowed, _ := rl.Allow(key, interval)
	if !allowed {
		t.Fatalf("expected first request to be allowed")
	}

	// Immediate 2nd request - rejected
	allowed, _ = rl.Allow(key, interval)
	if allowed {
		t.Fatalf("expected immediate second request to be rejected")
	}

	// Wait for interval to pass
	time.Sleep(550 * time.Millisecond)

	// 3rd request after interval - allowed
	allowed, _ = rl.Allow(key, interval)
	if !allowed {
		t.Fatalf("expected third request after wait to be allowed")
	}
}

func TestRateLimiter_AllowBurst(t *testing.T) {
	rl := NewRateLimiter(1*time.Minute, 1*time.Minute)

	key := "ip_1.2.3.4"
	capacity := 3
	refillInterval := 100 * time.Millisecond

	// 3 requests allowed (burst capacity)
	for i := 0; i < 3; i++ {
		if !rl.AllowBurst(key, capacity, refillInterval) {
			t.Fatalf("expected request %d to be allowed within capacity", i+1)
		}
	}

	// 4th request rejected
	if rl.AllowBurst(key, capacity, refillInterval) {
		t.Fatalf("expected 4th request to be rejected due to capacity limit")
	}
}
