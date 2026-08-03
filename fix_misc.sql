UPDATE items SET country = 'BG' WHERE country = 'Bulgaria';
UPDATE items SET country = 'VE' WHERE country = 'Venezuela';
SELECT country, COUNT(*) as cnt FROM items WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY cnt DESC LIMIT 30;
