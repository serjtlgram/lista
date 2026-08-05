SELECT id, title, country, user_id, updated_at FROM items WHERE lower(title) LIKE '%гардемарины%' ORDER BY user_id, title;
