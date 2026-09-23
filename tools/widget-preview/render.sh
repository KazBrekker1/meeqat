#!/usr/bin/env bash
# Render the widget through layoutlib and file the PNGs under renders/<label>/.
#   ./render.sh after      → renders/after/*.png, then open preview.html
# Labels let you keep a "before" set next to an "after" set for comparison.
set -euo pipefail
cd "$(dirname "$0")"
label="${1:-current}"

./gradlew recordPaparazziDebug --console=plain -q

mkdir -p "renders/$label"
rm -f "renders/$label"/*.png
for f in src/test/snapshots/images/*.png; do
  # com.meeqat…_WidgetPreviewTest_wide_wide_1752.png → wide_1752.png
  n="${f##*_WidgetPreviewTest_}"; cp "$f" "renders/$label/${n#*_}"
done

# manifest.js: { label: [files…] } for preview.html (file:// can't list directories)
{
  printf 'window.RENDERS = {\n'
  for d in renders/*/; do
    l=$(basename "$d")
    printf '  "%s": [%s],\n' "$l" "$(cd "$d" && ls *.png | sort | sed 's/.*/"&"/' | paste -sd, -)"
  done
  printf '};\n'
} > renders/manifest.js

echo "renders/$label: $(ls "renders/$label" | wc -l | tr -d ' ') images → open preview.html"
