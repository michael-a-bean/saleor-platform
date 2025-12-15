#!/bin/bash
# Database backup script for Saleor platform
# Creates a compressed PostgreSQL dump with timestamp

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PLATFORM_DIR/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="saleor_backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

echo "=== Saleor Database Backup ==="
echo "Timestamp: $TIMESTAMP"

# Create backups directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database container is running
if ! docker compose -f "$PLATFORM_DIR/docker-compose.yml" ps db | grep -q "Up"; then
    echo "Error: Database container is not running"
    echo "Start it with: docker compose up -d db"
    exit 1
fi

echo "Creating database dump..."
docker compose -f "$PLATFORM_DIR/docker-compose.yml" exec -T db \
    pg_dump -U saleor --no-owner --no-acl saleor > "$BACKUP_DIR/$BACKUP_FILE"

echo "Compressing backup..."
gzip "$BACKUP_DIR/$BACKUP_FILE"

# Get file size
SIZE=$(du -h "$BACKUP_DIR/$COMPRESSED_FILE" | cut -f1)

echo ""
echo "=== Backup Complete ==="
echo "File: $BACKUP_DIR/$COMPRESSED_FILE"
echo "Size: $SIZE"
echo ""
echo "To restore on another machine:"
echo "  gunzip -c $COMPRESSED_FILE | docker compose exec -T db psql -U saleor saleor"
