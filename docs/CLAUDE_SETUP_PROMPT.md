# Claude Code Setup Prompt

Copy and paste this to Claude Code on your new machine after cloning the repo and copying the backup file.

---

## Prompt

I've cloned the saleor-platform repository and copied a database backup file to the project root. Please help me set up the environment:

1. Checkout the `platform/main` branch
2. Start the database, cache, API, worker, mailpit, and jaeger services
3. Wait for the database to be ready, then restore from the backup file (`saleor_backup_*.sql.gz` in the project root or specify the path)
4. Update the search indexes
5. Build the storefront image (needs `--network=host` to access the API during build)
6. Start the storefront
7. Verify everything is working by checking the product count via GraphQL

The backup contains ~106k MTG cards. After setup, the storefront should be at http://localhost:3000 and show the MTG Card Marketplace.
