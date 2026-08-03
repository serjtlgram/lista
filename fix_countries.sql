-- Fix country data: replace garbled emoji and text with ISO 2-letter codes
-- Run on PostgreSQL server

-- Helper: update rows where country matches known patterns
-- Using a big CASE statement for deterministic mapping

UPDATE items SET country = CASE
  -- USSR / Soviet Union
  WHEN country ILIKE '%ussr%' OR country ILIKE '%soviet%' OR country ILIKE '%cccp%'
    OR country ILIKE '%СССР%' OR country ILIKE '%советский%'
    OR country = 'USSR_FLAG'
    THEN 'USSR'

  -- USA
  WHEN country ILIKE '%united states%' OR country ILIKE '%USA%' OR country = 'US'
    OR country ILIKE '%Соединен%Штат%' OR country ILIKE '%СШA%' OR country ILIKE '%СШС%'
    OR country ILIKE '%ша%' OR country ILIKE '%сша%'
    THEN 'US'

  -- UK
  WHEN country ILIKE '%united kingdom%' OR country ILIKE '%great britain%'
    OR country ILIKE '%england%' OR country = 'GB' OR country = 'UK'
    OR country ILIKE '%Великобритан%' OR country ILIKE '%Британ%'
    THEN 'GB'

  -- Russia
  WHEN country ILIKE '%russia%' OR country ILIKE '%russian%' OR country = 'RU' OR country = 'RUS'
    OR country ILIKE '%Россия%' OR country ILIKE '%Российск%'
    THEN 'RU'

  -- France
  WHEN country ILIKE '%france%' OR country = 'FR' OR country = 'FRA'
    OR country ILIKE '%Франция%' OR country ILIKE '%Франц%'
    THEN 'FR'

  -- Germany
  WHEN country ILIKE '%germany%' OR country = 'DE' OR country = 'DEU'
    OR country ILIKE '%Германия%' OR country ILIKE '%Герман%'
    THEN 'DE'

  -- Italy
  WHEN country ILIKE '%italy%' OR country ILIKE '%italian%' OR country = 'IT' OR country = 'ITA'
    OR country ILIKE '%Италия%' OR country ILIKE '%Итал%'
    THEN 'IT'

  -- Spain
  WHEN country ILIKE '%spain%' OR country ILIKE '%spanish%' OR country = 'ES' OR country = 'ESP'
    OR country ILIKE '%Испания%' OR country ILIKE '%Испан%'
    THEN 'ES'

  -- Japan
  WHEN country ILIKE '%japan%' OR country = 'JP' OR country = 'JPN'
    OR country ILIKE '%Япония%' OR country ILIKE '%Японии%'
    THEN 'JP'

  -- China
  WHEN country ILIKE '%china%' OR country = 'CN' OR country = 'CHN'
    OR country ILIKE '%Китай%' OR country ILIKE '%Китая%'
    THEN 'CN'

  -- South Korea
  WHEN country ILIKE '%korea%' OR country ILIKE '%south korea%' OR country = 'KR' OR country = 'KOR'
    OR country ILIKE '%Корея%' OR country ILIKE '%Кореи%'
    THEN 'KR'

  -- Canada
  WHEN country ILIKE '%canada%' OR country = 'CA' OR country = 'CAN'
    OR country ILIKE '%Канада%' OR country ILIKE '%Канады%'
    THEN 'CA'

  -- Australia
  WHEN country ILIKE '%australia%' OR country = 'AU' OR country = 'AUS'
    OR country ILIKE '%Австралия%' OR country ILIKE '%Австралии%'
    THEN 'AU'

  -- India
  WHEN country ILIKE '%india%' OR country = 'IN' OR country = 'IND'
    OR country ILIKE '%Индия%' OR country ILIKE '%Индии%'
    THEN 'IN'

  -- Ireland
  WHEN country ILIKE '%ireland%' OR country = 'IE' OR country = 'IRL'
    OR country ILIKE '%Ирландия%' OR country ILIKE '%Ирланди%'
    THEN 'IE'

  -- Sweden
  WHEN country ILIKE '%sweden%' OR country = 'SE' OR country = 'SWE'
    OR country ILIKE '%Швеция%' OR country ILIKE '%Швеции%'
    THEN 'SE'

  -- Denmark
  WHEN country ILIKE '%denmark%' OR country = 'DK' OR country = 'DNK'
    OR country ILIKE '%Дания%' OR country ILIKE '%Дании%'
    THEN 'DK'

  -- Norway
  WHEN country ILIKE '%norway%' OR country = 'NO' OR country = 'NOR'
    OR country ILIKE '%Норвегия%' OR country ILIKE '%Норвегии%'
    THEN 'NO'

  -- Finland
  WHEN country ILIKE '%finland%' OR country = 'FI' OR country = 'FIN'
    OR country ILIKE '%Финляндия%' OR country ILIKE '%Финлянди%'
    THEN 'FI'

  -- Netherlands
  WHEN country ILIKE '%netherlands%' OR country ILIKE '%holland%' OR country = 'NL' OR country = 'NLD'
    OR country ILIKE '%Нидерланды%' OR country ILIKE '%Голландия%'
    THEN 'NL'

  -- Belgium
  WHEN country ILIKE '%belgium%' OR country = 'BE' OR country = 'BEL'
    OR country ILIKE '%Бельгия%' OR country ILIKE '%Бельгии%'
    THEN 'BE'

  -- Switzerland
  WHEN country ILIKE '%switzerland%' OR country = 'CH' OR country = 'CHE'
    OR country ILIKE '%Швейцария%' OR country ILIKE '%Швейцари%'
    THEN 'CH'

  -- Austria
  WHEN country ILIKE '%austria%' OR country = 'AT' OR country = 'AUT'
    OR country ILIKE '%Австрия%' OR country ILIKE '%Австрии%'
    THEN 'AT'

  -- Poland
  WHEN country ILIKE '%poland%' OR country = 'PL' OR country = 'POL'
    OR country ILIKE '%Польша%' OR country ILIKE '%Польши%'
    THEN 'PL'

  -- Czech Republic
  WHEN country ILIKE '%czech%' OR country = 'CZ' OR country = 'CZE'
    OR country ILIKE '%Чехия%' OR country ILIKE '%Чехословакия%'
    THEN 'CZ'

  -- Turkey
  WHEN country ILIKE '%turkey%' OR country = 'TR' OR country = 'TUR'
    OR country ILIKE '%Турция%' OR country ILIKE '%Турции%'
    THEN 'TR'

  -- New Zealand
  WHEN country ILIKE '%new zealand%' OR country = 'NZ' OR country = 'NZL'
    OR country ILIKE '%Новая Зеландия%'
    THEN 'NZ'

  -- Hong Kong
  WHEN country ILIKE '%hong kong%' OR country = 'HK' OR country = 'HKG'
    OR country ILIKE '%Гонконг%'
    THEN 'HK'

  -- Taiwan
  WHEN country ILIKE '%taiwan%' OR country = 'TW' OR country = 'TWN'
    OR country ILIKE '%Тайвань%'
    THEN 'TW'

  -- Argentina
  WHEN country ILIKE '%argentina%' OR country = 'AR' OR country = 'ARG'
    OR country ILIKE '%Аргентина%' OR country ILIKE '%Аргентины%'
    THEN 'AR'

  -- UAE
  WHEN country ILIKE '%united arab%' OR country ILIKE '%UAE%' OR country = 'AE'
    OR country ILIKE '%ОАЭ%' OR country ILIKE '%Эмираты%'
    THEN 'AE'

  -- South Africa
  WHEN country ILIKE '%south africa%' OR country = 'ZA' OR country = 'RSA'
    OR country ILIKE '%ЮАР%' OR country ILIKE '%Африканская%'
    THEN 'ZA'

  -- Belarus
  WHEN country ILIKE '%belarus%' OR country = 'BY' OR country = 'BLR'
    OR country ILIKE '%Беларусь%' OR country ILIKE '%Белоруссия%'
    THEN 'BY'

  -- Kazakhstan
  WHEN country ILIKE '%kazakhstan%' OR country = 'KZ' OR country = 'KAZ'
    OR country ILIKE '%Казахстан%'
    THEN 'KZ'

  -- Mexico
  WHEN country ILIKE '%mexico%' OR country = 'MX' OR country = 'MEX'
    OR country ILIKE '%Мексика%' OR country ILIKE '%Мексики%'
    THEN 'MX'

  -- Brazil
  WHEN country ILIKE '%brazil%' OR country = 'BR' OR country = 'BRA'
    OR country ILIKE '%Бразилия%' OR country ILIKE '%Бразилии%'
    THEN 'BR'

  -- Ukraine
  WHEN country ILIKE '%ukraine%' OR country = 'UA' OR country = 'UKR'
    OR country ILIKE '%Украина%' OR country ILIKE '%Украины%'
    THEN 'UA'

  -- Portugal
  WHEN country ILIKE '%portugal%' OR country = 'PT' OR country = 'PRT'
    OR country ILIKE '%Португалия%'
    THEN 'PT'

  -- Romania
  WHEN country ILIKE '%romania%' OR country = 'RO' OR country = 'ROU'
    OR country ILIKE '%Румыния%'
    THEN 'RO'

  -- Hungary
  WHEN country ILIKE '%hungary%' OR country = 'HU' OR country = 'HUN'
    OR country ILIKE '%Венгрия%'
    THEN 'HU'

  -- Greece
  WHEN country ILIKE '%greece%' OR country = 'GR' OR country = 'GRC'
    OR country ILIKE '%Греция%'
    THEN 'GR'

  -- Israel
  WHEN country ILIKE '%israel%' OR country = 'IL' OR country = 'ISR'
    OR country ILIKE '%Израиль%'
    THEN 'IL'

  -- Thailand
  WHEN country ILIKE '%thailand%' OR country = 'TH' OR country = 'THA'
    OR country ILIKE '%Таиланд%'
    THEN 'TH'

  -- Singapore
  WHEN country ILIKE '%singapore%' OR country = 'SG' OR country = 'SGP'
    OR country ILIKE '%Сингапур%'
    THEN 'SG'

  -- Indonesia
  WHEN country ILIKE '%indonesia%' OR country = 'ID' OR country = 'IDN'
    OR country ILIKE '%Индонезия%'
    THEN 'ID'

  -- Malaysia
  WHEN country ILIKE '%malaysia%' OR country = 'MY' OR country = 'MYS'
    OR country ILIKE '%Малайзия%'
    THEN 'MY'

  -- Vietnam
  WHEN country ILIKE '%vietnam%' OR country = 'VN' OR country = 'VNM'
    OR country ILIKE '%Вьетнам%'
    THEN 'VN'

  -- Colombia
  WHEN country ILIKE '%colombia%' OR country = 'CO' OR country = 'COL'
    OR country ILIKE '%Колумбия%'
    THEN 'CO'

  -- Chile
  WHEN country ILIKE '%chile%' OR country = 'CL' OR country = 'CHL'
    OR country ILIKE '%Чили%'
    THEN 'CL'

  ELSE country
END
WHERE country IS NOT NULL AND country != '';

-- Show summary of what's in the DB now
SELECT country, COUNT(*) as cnt
FROM items
WHERE country IS NOT NULL AND country != ''
GROUP BY country
ORDER BY cnt DESC
LIMIT 50;
