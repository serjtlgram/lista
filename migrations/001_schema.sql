-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY, -- Telegram User ID
    username VARCHAR(255) DEFAULT '',
    first_name VARCHAR(255) NOT NULL DEFAULT '',
    last_name VARCHAR(255) DEFAULT '',
    photo_url TEXT DEFAULT '',
    language_code VARCHAR(50) DEFAULT '',
    is_premium BOOLEAN DEFAULT FALSE,
    allows_write_to_pm BOOLEAN DEFAULT FALSE,
    visits_count INT DEFAULT 1,
    welcomed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Items table (Movies, TV Shows, Books, Audiobooks, Podcasts, Games)
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'movie', 'show', 'book', 'audiobook', 'podcast', 'game'
    status VARCHAR(50) NOT NULL DEFAULT 'planned', -- 'watching', 'completed', 'planned', 'paused'
    rating INT DEFAULT 0, -- 0 to 10
    genre VARCHAR(255) DEFAULT '',
    duration VARCHAR(100) DEFAULT '',
    release_year VARCHAR(50) DEFAULT '',
    poster_url TEXT DEFAULT '',
    description TEXT DEFAULT '',
    note TEXT DEFAULT '',
    raw_input TEXT DEFAULT '', -- Raw user description for future AI context parsing
    ai_parsed BOOLEAN DEFAULT FALSE,
    youtube_url TEXT DEFAULT '',
    director TEXT DEFAULT '',
    cast_members TEXT DEFAULT '',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure description, youtube_url, director, cast_members & welcomed columns exist for existing deployments
ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS youtube_url TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS director TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS cast_members TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS author TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS isbn VARCHAR(100) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcomed BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code VARCHAR(50) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allows_write_to_pm BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS visits_count INT DEFAULT 1;

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_items_user_cat ON items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_items_user_status ON items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_items_user_created ON items(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_title_lower ON items(LOWER(title));

-- Trigger function to update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_users_timestamp ON users;
CREATE TRIGGER set_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS set_items_timestamp ON items;
CREATE TRIGGER set_items_timestamp
BEFORE UPDATE ON items
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
