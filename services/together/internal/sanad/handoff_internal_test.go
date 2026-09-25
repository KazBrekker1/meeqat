package sanad

import (
	"crypto/sha256"
	"encoding/base64"
	"testing"
	"time"
)

func TestHandoffCodesExpire(t *testing.T) {
	now := time.Now()
	s := newHandoffStore()
	s.now = func() time.Time { return now }

	sum := sha256.Sum256([]byte("verifier"))
	code, err := s.issue("user1", base64.RawURLEncoding.EncodeToString(sum[:]))
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(handoffTTL + time.Second)
	if _, ok := s.redeem(code, "verifier"); ok {
		t.Fatal("an expired code must not redeem")
	}
}
