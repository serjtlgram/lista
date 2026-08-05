import sys

with open('pkg/handlers/handlers.go', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update WHERE clause in UpdateItem
content = content.replace(
    'query += " WHERE id = $1 AND user_id = $2"',
    'query += " WHERE id = $1 AND (user_id = $2 OR (user_id = 0 AND $2 = 214993606))"'
)

# 2. Update DeleteItem WHERE clause
content = content.replace(
    'res, err := h.DB.Pool.Exec(r.Context(), "DELETE FROM items WHERE id = $1 AND user_id = $2", itemID, user.ID)',
    'res, err := h.DB.Pool.Exec(r.Context(), "DELETE FROM items WHERE id = $1 AND (user_id = $2 OR (user_id = 0 AND $2 = 214993606))", itemID, user.ID)'
)

# 3. Add MapCountryToFlag at the end
map_func = """

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
"""
if "func mapCountryToFlag(" not in content:
    content += map_func

# 4. Use mapCountryToFlag in CreateItem
content = content.replace(
    'countryVal := req.Country\n\n\tif posterURL != ""',
    'countryVal := req.Country\n\tif countryVal != nil {\n\t\tmapped := mapCountryToFlag(*countryVal)\n\t\tcountryVal = &mapped\n\t}\n\n\tif posterURL != ""'
)

# 5. Use mapCountryToFlag in UpdateItem
content = content.replace(
    '\tif req.Country != nil {\n\t\tquery += fmt.Sprintf(", country = $%d", argIdx)\n\t\targs = append(args, *req.Country)',
    '\tif req.Country != nil {\n\t\tquery += fmt.Sprintf(", country = $%d", argIdx)\n\t\tmappedCountry := mapCountryToFlag(*req.Country)\n\t\targs = append(args, mappedCountry)'
)

# 6. Use mapCountryToFlag in saveCatalogItemToDB
content = content.replace(
    'item.Country)',
    'mapCountryToFlag(item.Country))'
)

# 7. Use mapCountryToFlag in fetchTMDBInline
content = content.replace(
    'c.Country = strings.Join(originCountries, ", ")',
    'c.Country = mapCountryToFlag(strings.Join(originCountries, ", "))'
)

# 8. Use mapCountryToFlag in fetchKinopoiskInline
content = content.replace(
    'c.Country = strings.Join(cNames, ", ")',
    'c.Country = mapCountryToFlag(strings.Join(cNames, ", "))'
)

with open('pkg/handlers/handlers.go', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated handlers.go successfully.')
