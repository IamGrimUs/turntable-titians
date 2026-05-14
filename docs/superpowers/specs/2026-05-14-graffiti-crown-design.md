# Graffiti Crown — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

## Summary

Replace the animated gold crown and silver laurel ornaments on the battle submission cards with a graffiti spray-paint crown PNG that feels like someone tagged the winner's card. The rank-2 laurel is removed with no replacement.

## Reference

- Crown style: bold black graffiti silhouette, drips, splatter — like the Notorious B.I.G. crown photo. Centered above the card like it's being worn, not tucked in a corner.
- Crown asset: user-supplied PNG (`crown.png`) — clean black silhouette on white background.

## Files Changed

### `turntable-titans/client/app/battles/[id]/SubmissionCard.tsx`

**Remove:**
- `CrownOrnament` component (lines 51–92) — animated gold clip-path crown with shimmer
- `LaurelOrnament` component (lines 94–146) — SVG silver laurel wreath
- Both render calls (lines 203–204)
- `cardGlowStyle` logic (lines 165–185) and `style={cardGlowStyle}` on the card element — removes the pulsing gold/silver box-shadow animation

**Add:**
- `GraffitiCrown` component: `<img>` pointing to `/crown.png`, absolutely positioned centered above the card, `mix-blend-mode: screen`, `filter: invert(1)`. White ink shows through on the dark card background. `pointer-events: none`.
- Render `<GraffitiCrown />` on the outer wrapper when `rank === 1 && (isWinner || isLeading)`

**`showOrnament` simplifies to:** `rank === 1 && (isWinner || isLeading)`

### `turntable-titans/client/app/globals.css`

**Remove** the four keyframes (lines 61–79):
- `@keyframes ornament-float`
- `@keyframes ornament-shimmer`
- `@keyframes card-glow-gold`
- `@keyframes card-glow-silver`

### `turntable-titans/client/public/crown.png`

Add the graffiti crown PNG asset here. Next.js serves `/public` at the root, so the image is available at `/crown.png`.

## Crown Positioning

```
position: absolute
top: -60px          (sits above the card, crown base overlapping the top edge)
left: 50%
transform: translateX(-50%)
width: 180px
height: auto
mix-blend-mode: screen
filter: invert(1)   (black PNG → white on dark card)
pointer-events: none
z-index: 20
```

The outer card wrapper already has `position: relative` and no `overflow: hidden`, so the crown bleeds above the card boundary freely.

## What Stays the Same

- Winner/Leading badges (amber chip top-left of card)
- Podium border colors (`border-amber-400`, `border-slate-400`, `border-amber-700`)
- `#3` rank badge on third card
- All vote and card body markup
- `WinnerBanner` component — unchanged
