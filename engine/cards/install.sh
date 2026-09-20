#!/usr/bin/env bash
# Copy this project's hand-written cards into an alpharune checkout.
#
# Refuses to overwrite a file that differs from the copy here, because the
# difference might be an improvement made in the checkout — and losing that
# silently is the same failure this directory exists to prevent, pointed the
# other way. Pass --force to overwrite anyway.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="${ALPHARUNE_ROOT:-$(cd "$HERE/../../../chorlick/alpharune" 2>/dev/null && pwd || true)}"
FORCE="${1:-}"

[ -n "$ROOT" ] && [ -d "$ROOT/src/cards" ] || {
  echo "No alpharune checkout found. Set ALPHARUNE_ROOT." >&2; exit 2; }

copied=0 same=0 differs=0
for src in "$HERE"/*.cpp; do
  [ -e "$src" ] || continue
  name="$(basename "$src")"
  # Card type directory is implied by the class it derives from.
  case "$(grep -oE 'public (Unit|Spell|Gear|Legend|Battlefield|Rune)Card' "$src" | head -1)" in
    *UnitCard)        sub=units ;;
    *SpellCard)       sub=spells ;;
    *GearCard)        sub=gear ;;
    *LegendCard)      sub=legends ;;
    *BattlefieldCard) sub=battlefields ;;
    *RuneCard)        sub=runes ;;
    *) echo "  cannot tell the card type of $name" >&2; exit 1 ;;
  esac
  dst="$ROOT/src/cards/$sub/$name"

  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then same=$((same+1)); continue; fi
  if [ -f "$dst" ] && [ "$FORCE" != "--force" ]; then
    echo "  DIFFERS: $sub/$name — the checkout's copy is not this one."
    echo "           Compare them, then re-run with --force to overwrite."
    differs=$((differs+1)); continue
  fi
  cp "$src" "$dst"; echo "  installed: $sub/$name"; copied=$((copied+1))
done

echo "$copied copied, $same already identical, $differs left alone."
[ "$differs" -gt 0 ] && exit 1
[ "$copied" -gt 0 ] && echo "Rebuild: (cd $ROOT && cmake --build build) && ./engine/build.sh"
exit 0
