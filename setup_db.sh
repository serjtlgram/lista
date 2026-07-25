#!/usr/bin/env bash
set -e

echo "Updating postgresql.conf..."
sudo sed -i 's/^max_connections = .*/max_connections = 25/' /etc/postgresql/16/main/postgresql.conf
sudo sed -i 's/^shared_buffers = .*/shared_buffers = 64MB/' /etc/postgresql/16/main/postgresql.conf

echo "Restarting PostgreSQL..."
sudo systemctl restart postgresql

echo "Setting up database and user..."
sudo -u postgres psql -c "CREATE USER tracklist_user WITH PASSWORD 'tracklist_pass';" || true
sudo -u postgres psql -c "CREATE DATABASE tracklist_db OWNER tracklist_user;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE tracklist_db TO tracklist_user;"
sudo -u postgres psql -c "ALTER USER tracklist_user WITH SUPERUSER;" || true

echo "PostgreSQL setup complete!"
