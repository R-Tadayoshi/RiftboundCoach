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
  # Card type directory, from the CardDef the file carries. Deriving it from
  # the base class breaks on any card that inherits a helper base instead —
  # SimpleEquipGear, and whatever comes next — so read the type the card
  # actually declares.
  # Anchored to the DECLARATION. An unanchored match reads whatever
  # CardType the card's logic happens to mention first — Decree of Unity
  # tests `obj.card_type == CardType::Gear` while looking for targets, and
  # got installed as gear, registering card 918 twice from two directories.
  case "$(grep -oE 'd\.card_type = CardType::(Unit|Spell|Gear|Legend|Battlefield|Rune)' "$src" | head -1)" in
    *::Unit)        sub=units ;;
    *::Spell)       sub=spells ;;
    *::Gear)        sub=gear ;;
    *::Legend)      sub=legends ;;
    *::Battlefield) sub=battlefields ;;
    *::Rune)        sub=runes ;;
    *) echo "  cannot tell the card type of $name (no 'd.card_type = CardType::...')" >&2; exit 1 ;;
  esac
  dst="$ROOT/src/cards/$sub/$name"

  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then same=$((same+1)); continue; fi

  # A file the checkout has NOT touched is upstream's pristine copy, and
  # overwriting it loses nothing — that is the whole point of the cards here
  # that modify an existing upstream card (the counterspells carrying the
  # canBeCountered guard). Only a checkout-side *modification* is worth
  # refusing over, since that is the improvement this guard exists to protect.
  if [ -f "$dst" ] && git -C "$ROOT" diff --quiet HEAD -- "src/cards/$sub/$name" 2>/dev/null; then
    cp "$src" "$dst"; echo "  installed over pristine upstream: $sub/$name"
    copied=$((copied+1)); continue
  fi

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
