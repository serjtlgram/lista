-- Fix USSR country data in database
-- Update items where country is SU, USSR_FLAG, CCCP, or matches Soviet Union patterns

UPDATE items 
SET country = 'USSR' 
WHERE country ILIKE '%ussr%' 
   OR country ILIKE '%soviet%' 
   OR country ILIKE '%cccp%'
   OR country ILIKE '%СССР%' 
   OR country ILIKE '%советский%'
   OR country = 'SU'
   OR country = 'SUHH'
   OR country = 'USSR_FLAG';

-- Also fix any USSR movies that were release_year <= 1991 and originally marked as RU/СССР or Soviet titles
UPDATE items
SET country = 'USSR'
WHERE (country = 'RU' OR country IS NULL OR country = '')
  AND (
    LOWER(title) LIKE '%гардемарины%'
    OR LOWER(title) LIKE '%иван васильевич%'
    OR LOWER(title) LIKE '%операция «ы»%'
    OR LOWER(title) LIKE '%приключения шурика%'
    OR LOWER(title) LIKE '%бриллиантовая рука%'
    OR LOWER(title) LIKE '%ирония судьбы%'
    OR LOWER(title) LIKE '%джентльмены удачи%'
    OR LOWER(title) LIKE '%кавказская пленница%'
    OR LOWER(title) LIKE '%служебный роман%'
    OR LOWER(title) LIKE '%москва слезам не верит%'
    OR LOWER(title) LIKE '%собачье сердце%'
  );

-- Show count of USSR items
SELECT COUNT(*) as ussr_count FROM items WHERE country = 'USSR';
