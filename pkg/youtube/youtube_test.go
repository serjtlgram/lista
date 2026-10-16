package youtube

import (
	"testing"
)

func TestScoreCandidate_Games(t *testing.T) {
	tests := []struct {
		name        string
		candTitle   string
		targetTitle string
		targetCat   string
		year        string
		director    string
		origTitle   string
		shouldPass  bool
	}{
		{
			name:        "Exact Game Trailer with PS5",
			candTitle:   "The Last of Us Part I - Official Trailer | PS5 Games",
			targetTitle: "The Last of Us Part I",
			targetCat:   "game",
			year:        "2022",
			shouldPass:  true,
		},
		{
			name:        "Movie/Series trailer with HBO disqualified for game",
			candTitle:   "The Last of Us | Official Trailer | Max (HBO Series)",
			targetTitle: "The Last of Us Part I",
			targetCat:   "game",
			year:        "2022",
			shouldPass:  false,
		},
		{
			name:        "Walkthrough gameplay disqualified for game",
			candTitle:   "The Last of Us Part I Full Walkthrough Gameplay No Commentary",
			targetTitle: "The Last of Us Part I",
			targetCat:   "game",
			year:        "2022",
			shouldPass:  false,
		},
		{
			name:        "Sequel conflict Witcher 2 for Witcher 3",
			candTitle:   "The Witcher 2: Assassins of Kings Official Trailer",
			targetTitle: "The Witcher 3: Wild Hunt",
			targetCat:   "game",
			year:        "2015",
			shouldPass:  false,
		},
		{
			name:        "Witcher Netflix show disqualified for Witcher 3 game",
			candTitle:   "The Witcher | Official Trailer | Netflix Series",
			targetTitle: "The Witcher 3: Wild Hunt",
			targetCat:   "game",
			year:        "2015",
			shouldPass:  false,
		},
		{
			name:        "Witcher 3 gameplay trailer passes",
			candTitle:   "The Witcher 3: Wild Hunt - Official Gameplay Trailer",
			targetTitle: "The Witcher 3: Wild Hunt",
			targetCat:   "game",
			year:        "2015",
			shouldPass:  true,
		},
		{
			name:        "Minecraft game trailer passes",
			candTitle:   "Minecraft Official Launch Trailer",
			targetTitle: "Minecraft",
			targetCat:   "game",
			year:        "2011",
			shouldPass:  true,
		},
		{
			name:        "A Minecraft Movie disqualified for Minecraft game",
			candTitle:   "A Minecraft Movie - Official Teaser Trailer (2025)",
			targetTitle: "Minecraft",
			targetCat:   "game",
			year:        "2011",
			shouldPass:  false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			score := scoreCandidate(tc.candTitle, tc.targetTitle, tc.targetCat, tc.year, tc.director, tc.origTitle)
			if tc.shouldPass && score <= 0 {
				t.Errorf("[%s] Expected positive score for valid game trailer, got %d", tc.name, score)
			}
			if !tc.shouldPass && score > 0 {
				t.Errorf("[%s] Expected non-positive score (disqualified) for wrong video, got %d", tc.name, score)
			}
		})
	}
}

func TestLiveSearch_Game(t *testing.T) {
	url, err := SearchYouTube("", "Subnautica", "game", "2018")
	if err != nil {
		t.Fatalf("SearchYouTube returned error: %v", err)
	}
	if url == "" {
		t.Fatalf("Expected trailer URL for Subnautica, got empty string")
	}
	t.Logf("Found Subnautica trailer: %s", url)
}

func TestLiveSearch_RDR2(t *testing.T) {
	url, err := SearchYouTube("", "Red Dead Redemption 2", "game", "2018")
	t.Logf("RDR2 trailer: %s (err: %v)", url, err)
}


