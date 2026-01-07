#!/bin/bash
# validate-brand-colors.sh
# Ensures brand hex values only appear in approved locations

set -e

BRAND_COLORS=(
  "#07074E"  # Deep Purple
  "#00B3C5"  # Bright Blue
  "#FFCF01"  # Sunny Yellow
  "#005B23"  # Fresh Green
  "#E3D2B2"  # Bleached Bone
)

ALLOWED_FILES=(
  "src/lib/brand.ts"
  "src/app/globals.css"
)

DOCS_PATH="docs/"

echo "🔍 Scanning for brand color hex values..."
echo ""

VIOLATIONS=0

for color in "${BRAND_COLORS[@]}"; do
  # Search for the color in src/ excluding allowed files
  matches=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.css" "$color" src/ 2>/dev/null || true)

  while IFS= read -r match; do
    if [ -z "$match" ]; then
      continue
    fi

    file=$(echo "$match" | cut -d':' -f1)

    # Check if file is in allowed list
    is_allowed=false
    for allowed in "${ALLOWED_FILES[@]}"; do
      if [[ "$file" == *"$allowed" ]]; then
        is_allowed=true
        break
      fi
    done

    if [ "$is_allowed" = false ]; then
      echo "❌ VIOLATION: $color found in $file"
      echo "   $match"
      echo ""
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done <<< "$matches"
done

if [ $VIOLATIONS -eq 0 ]; then
  echo "✅ All brand colors are properly centralized!"
  exit 0
else
  echo ""
  echo "⚠️  Found $VIOLATIONS violation(s)"
  echo ""
  echo "Brand hex values should only appear in:"
  for file in "${ALLOWED_FILES[@]}"; do
    echo "  - $file"
  done
  echo ""
  echo "Use CSS variables (var(--brand-*)) or Tailwind classes (bg-brand-*) instead."
  exit 1
fi
