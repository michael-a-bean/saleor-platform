#!/bin/bash
# Saleor Platform Setup Script
# Run this script on a fresh clone to set up the development environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_ROOT"

echo ""
echo "=============================================="
echo "  Saleor Hobby Gaming Platform Setup"
echo "=============================================="
echo ""

# Step 1: Check prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    log_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker."
    exit 1
fi

log_success "Prerequisites checked"

# Step 2: Initialize git submodules
log_info "Initializing git submodules..."
git submodule update --init --recursive
log_success "Git submodules initialized"

# Step 3: Set up environment files
log_info "Setting up environment files..."

# Storefront
if [ ! -f "$PROJECT_ROOT/storefront/.env" ]; then
    cp "$PROJECT_ROOT/storefront/.env.example" "$PROJECT_ROOT/storefront/.env"
    log_success "Created storefront/.env from template"
else
    log_warn "storefront/.env already exists, skipping"
fi

log_success "Environment files configured"

# Step 4: Build Docker images
log_info "Building Docker images (this may take a while)..."
docker compose build
log_success "Docker images built"

# Step 5: Start core services (db, cache, api)
log_info "Starting core services (database, cache, API)..."
docker compose up -d db cache
sleep 5  # Wait for postgres to initialize

# Step 6: Run database migrations
log_info "Running database migrations..."
docker compose run --rm api python3 manage.py migrate
log_success "Database migrations complete"

# Step 7: Ask about sample data
echo ""
read -p "Would you like to populate sample data and create a superuser? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Populating sample data..."
    docker compose run --rm api python3 manage.py populatedb --createsuperuser
    log_success "Sample data populated"
    echo ""
    log_info "Default superuser credentials:"
    echo "  Email: admin@example.com"
    echo "  Password: admin"
fi

# Step 8: Start remaining services
log_info "Starting all services..."
docker compose up -d api worker jaeger mailpit dashboard meilisearch
log_success "Core services started"

# Step 9: Set up Stripe DynamoDB table (if AWS CLI available)
if command -v aws &> /dev/null; then
    log_info "Setting up Stripe DynamoDB table..."
    docker compose up -d dynamodb-local
    sleep 3
    "$SCRIPT_DIR/setup-stripe-dynamodb.sh" 2>/dev/null || log_warn "DynamoDB table setup skipped (may already exist)"
fi

# Step 10: Start app services
log_info "Starting Saleor apps..."
docker compose up -d stripe-app inventory-ops-app pos-app

# Final status
echo ""
echo "=============================================="
log_success "Setup complete!"
echo "=============================================="
echo ""
echo "Services are starting up. Access them at:"
echo ""
echo "  Storefront:  http://localhost:3000"
echo "  Dashboard:   http://localhost:9000"
echo "  GraphQL API: http://localhost:8000/graphql/"
echo "  Mailpit:     http://localhost:8025"
echo "  Jaeger:      http://localhost:16686"
echo "  Meilisearch: http://localhost:7700"
echo ""
echo "Saleor Apps:"
echo "  Stripe:        http://localhost:3001"
echo "  Inventory Ops: http://localhost:3002"
echo "  Buylist:       http://localhost:3003"
echo "  POS:           http://localhost:3004"
echo ""
echo "To build and start the storefront:"
echo "  docker compose up -d storefront"
echo ""
echo "To view logs:"
echo "  docker compose logs -f [service-name]"
echo ""
echo "To stop all services:"
echo "  docker compose down"
echo ""
