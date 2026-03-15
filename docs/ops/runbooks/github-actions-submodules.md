# GitHub Actions: Submodule Token Configuration

## Overview

The `deploy-staging.yml` workflow requires access to private nested submodules during checkout. The default `GITHUB_TOKEN` cannot access repositories outside the current workflow's repo, so a Personal Access Token (PAT) with cross-repo access is required.

## Problem

When using `submodules: recursive`, GitHub Actions attempts to clone:

1. `saleor-platform` (current repo) - works with default token
2. `saleor-apps` submodule - works with default token
3. Nested submodules in `saleor-apps/apps/` - **fails** because these are separate private repos:
   - `michael-a-bean/saleor-app-inventory-ops`
   - `michael-a-bean/saleor-app-pos`

## Solution

A `SUBMODULES_TOKEN` secret provides cross-repo access.

## Setup Instructions

### Step 1: Create a Fine-Grained PAT

1. Go to **GitHub.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Configure:
   - **Token name:** `saleor-platform-submodules`
   - **Expiration:** 90 days (set a calendar reminder to rotate)
   - **Resource owner:** `michael-a-bean`
   - **Repository access:** Select repositories:
     - `saleor-platform`
     - `saleor-apps`
     - `saleor-app-inventory-ops`
     - `saleor-app-pos`
   - **Permissions:**
     - Repository permissions → **Contents: Read-only**
4. Click **Generate token**
5. **Copy the token immediately** (it won't be shown again)

### Step 2: Add Secret to Repository

1. Go to **saleor-platform repo → Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Configure:
   - **Name:** `SUBMODULES_TOKEN`
   - **Value:** (paste the PAT from Step 1)
4. Click **Add secret**

### Step 3: Verify

Trigger a `deploy-staging` workflow run (push to `platform/main` or manual dispatch). The checkout step should now succeed with recursive submodule cloning.

## Token Rotation

Fine-grained PATs have maximum 1-year expiration. Set a calendar reminder to rotate before expiration:

1. Create a new token (Step 1)
2. Update the secret (Step 2)
3. Delete the old token from GitHub

## Troubleshooting

### Error: "repository not found"

- Verify the token has access to all nested submodule repos
- Check token hasn't expired
- Ensure `Contents: Read-only` permission is granted

### Error: "Authentication failed"

- Secret name must be exactly `SUBMODULES_TOKEN`
- Token may have been revoked or expired
- Check Actions secrets are accessible to the workflow (not restricted to specific environments)

## Security Notes

- Use **fine-grained tokens** (not classic PATs) for minimal scope
- Grant **read-only** access - no write permissions needed
- Token only needs `Contents` permission, not `Metadata` or others
- Secrets are masked in workflow logs automatically
