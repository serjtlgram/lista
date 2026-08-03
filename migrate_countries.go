package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v4/pgxpool"
)

func main() {
	dbURL := "postgres://postgres:postgres@localhost:5432/tracklist_db?sslmode=disable"
	pool, err := pgxpool.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v\n", err)
	}
	defer pool.Close()

	rows, err := pool.Query(context.Background(), "SELECT id, country FROM items WHERE country != '' AND country IS NOT NULL")
	if err != nil {
		log.Fatalf("Query failed: %v\n", err)
	}
	defer rows.Close()

	var updates []struct {
		ID      string
		Country string
	}

	for rows.Next() {
		var id, country string
		if err := rows.Scan(&id, &country); err != nil {
			continue
		}
		
		mapped := mapCountryToFlag(country)
		if mapped != country && mapped != "" {
			updates = append(updates, struct{ID, Country string}{id, mapped})
		}
	}

	for _, u := range updates {
		_, err := pool.Exec(context.Background(), "UPDATE items SET country = $1 WHERE id = $2", u.Country, u.ID)
		if err != nil {
			log.Printf("Failed to update %s: %v\n", u.ID, err)
		} else {
			fmt.Printf("Updated %s to %s\n", u.ID, u.Country)
		}
	}
}

func mapCountryToFlag(country string) string {
	raw := strings.ToLower(strings.TrimSpace(country))
	if raw == "" {
		return ""
	}

	countryPriority := []struct {
		keys []string
		flag string
	}{
		{[]string{"ссср", "советский союз", "ussr", "soviet union", "su", "sur"}, "USSR_FLAG"},
		{[]string{"сша", "соединенные штаты америки", "соединённые штаты америки", "us", "usa", "united states", "united states of america"}, "🇺🇸"},
		{[]string{"великобритания", "соединенное королевство", "соединённое королевство", "gb", "uk", "united kingdom", "great britain"}, "🇬🇧"},
		{[]string{"россия", "российская федерация", "ru", "rus", "russia"}, "🇷🇺"},
		{[]string{"украина", "ua", "ukr", "ukraine"}, "🇺🇦"},
		{[]string{"япония", "jp", "jpn", "japan"}, "🇯🇵"},
		{[]string{"южная корея", "республика корея", "корея южная", "kr", "kor", "south korea", "korea"}, "🇰🇷"},
		{[]string{"франция", "fr", "fra", "france"}, "🇫🇷"},
		{[]string{"германия", "de", "deu", "germany"}, "🇩🇪"},
		{[]string{"испания", "es", "esp", "spain"}, "🇪🇸"},
		{[]string{"италия", "it", "ita", "italy"}, "🇮🇹"},
		{[]string{"китай", "cn", "chn", "china"}, "🇨🇳"},
		{[]string{"канада", "ca", "can", "canada"}, "🇨🇦"},
		{[]string{"австралия", "au", "aus", "australia"}, "🇦🇺"},
		{[]string{"индия", "in", "ind", "india"}, "🇮🇳"},
		{[]string{"мексика", "mx", "mex", "mexico"}, "🇲🇽"},
		{[]string{"бразилия", "br", "bra", "brazil"}, "🇧🇷"},
		{[]string{"ирландия", "ie", "irl", "ireland"}, "🇮🇪"},
		{[]string{"швеция", "se", "swe", "sweden"}, "🇸🇪"},
		{[]string{"дания", "dk", "dnk", "denmark"}, "🇩🇰"},
		{[]string{"норвегия", "no", "nor", "norway"}, "🇳🇴"},
		{[]string{"финляндия", "fi", "fin", "finland"}, "🇫🇮"},
		{[]string{"нидерланды", "nl", "nld", "netherlands"}, "🇳🇱"},
		{[]string{"бельгия", "be", "bel", "belgium"}, "🇧🇪"},
		{[]string{"швейцария", "ch", "che", "switzerland"}, "🇨🇭"},
		{[]string{"австрия", "at", "aut", "austria"}, "🇦🇹"},
		{[]string{"польша", "pl", "pol", "poland"}, "🇵🇱"},
		{[]string{"чехия", "cz", "cze", "czech republic", "czechia"}, "🇨🇿"},
		{[]string{"турция", "tr", "tur", "turkey"}, "🇹🇷"},
		{[]string{"новая зеландия", "nz", "nzl", "new zealand"}, "🇳🇿"},
		{[]string{"гонконг", "hk", "hkg", "hong kong"}, "🇭🇰"},
		{[]string{"тайвань", "tw", "twn", "taiwan"}, "🇹🇼"},
		{[]string{"аргентина", "ar", "arg", "argentina"}, "🇦🇷"},
		{[]string{"оаэ", "объединенные арабские эмираты", "ae", "uae"}, "🇦🇪"},
		{[]string{"юар", "южно-африканская республика", "za", "rsa", "south africa"}, "🇿🇦"},
		{[]string{"беларусь", "by", "blr", "belarus"}, "🇧🇾"},
		{[]string{"казахстан", "kz", "kaz", "kazakhstan"}, "🇰🇿"},
	}

	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '/'
	})
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}

	for _, item := range countryPriority {
		for _, p := range parts {
			for _, k := range item.keys {
				if p == k {
					return item.flag
				}
			}
		}
	}

	for _, item := range countryPriority {
		for _, key := range item.keys {
			if len(key) > 2 && strings.Contains(raw, key) {
				return item.flag
			}
		}
	}

	if raw == "su" || raw == "sur" {
		return "USSR_FLAG"
	}

	return country
}
