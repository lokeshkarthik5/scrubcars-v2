# Card car photos: where they came from

The hero photos on the premium gift cards and scratch-prize cards
(`apps/users/components/premium-card`, picked by
`packages/core/src/card-cars.ts`). Keep this file next to the pictures, and
update it whenever a picture is added, replaced or edited.

**Never show a brand or model name with these pictures**, in the app, in a
file name, in alt text or in marketing. They are photos of real cars (one is a
studio render of a concept car) with every legible badge, wheel-centre logo,
model script, sponsor decal and tyre lettering removed. Under each gift card
the gift share screen and the recipient's page say: "Cars shown for
illustration only. Not affiliated with any car maker."

## Licence (all six)

- Unsplash licence: <https://unsplash.com/license>
- Free to use commercially, editing allowed, no attribution or permission
  required (a credit is optional).
- It does not allow selling the photos unaltered, or compiling them into a
  similar or competing photo service. Neither happens here.
- The licence covers the photographer's copyright, not trademarks or designs
  shown in a photo. That is why the badges are removed, no make or model is
  named, and the illustration-only line is shown.
- Downloaded at 2400 px wide and approved by the owner on 18 October 2026.
  The untouched downloads are kept outside the repo
  (`Detlio-Dev/reference/cars-unsplash/raw`).

## Files

Each photo is cropped for the card's photo area (16:13, the car big and
bleeding off the edge), retouched, and saved as WebP (quality 82) at 1600 px
(the shared Story/Post image) and 800 px (the card on screen).

| Files | Source (Unsplash) | Retouched |
|---|---|---|
| `red-rear-{800,1600}.webp` | <https://unsplash.com/photos/red-sports-car-tmAynVA_ihE> | Wheel-centre logo blurred; the edge of the rear badge at the frame edge blurred. Mirrored left to right, so the dark trees sit under the card's wordmark. |
| `grey-coupe-{800,1600}.webp` | <https://unsplash.com/photos/gray-coupe-parked-on-gray-concrete-pavement-7Nsarl91394> | Lettering on the rear wing and the script badge on the rear deck removed; wheel-centre logo blurred; brake-caliper lettering and tyre lettering removed. The fender badge and front of the car are cropped out. |
| `silver-concept-{800,1600}.webp` | <https://unsplash.com/photos/a-silver-sports-car-on-a-gray-background-7CI6l0yUZ7M> | Wheel-centre logo blurred. The fender badge is cropped out. |
| `white-track-rear-{800,1600}.webp` | <https://unsplash.com/photos/sleek-white-sports-car-with-large-spoiler-on-dark-background-BQwtmVs2K0o> | Maker lettering across the rear removed; wing end-plate logo and both wheel-centre logos blurred. No number plate is fitted. |
| `white-supercar-dark-{800,1600}.webp` | <https://unsplash.com/photos/a-sleek-white-sports-car-against-a-dark-background-S5ogDe0Uzp0> | Wheel-centre logo blurred; tyre lettering removed; the end of the sill's model badge at the frame edge removed. The nose badge is cropped out. |
| `purple-hypercar-{800,1600}.webp` | <https://unsplash.com/photos/a-purple-sports-car-driving-down-a-race-track-Ml6t-daUOO8> | Sticker lettering on the nose removed; brake-caliper lettering removed; the small maker logo on the side and the sponsor logo on the side pod removed; the red-and-white kerb at the bottom painted over with track (it showed as a pink band in the fade). The wing decal is cropped out. |

No photo shows a number plate.

## Adding a photo

1. Pick a photo whose licence allows commercial use with edits (Unsplash or
   Pexels), with the car big and no people.
2. Crop it to 16:13, retouch every legible badge, logo, decal, tyre lettering
   and number plate, and save `<name>-1600.webp` and `<name>-800.webp` here.
   Check each retouched area at full size.
3. Add a row above, and an entry to `CARD_CARS` in
   `packages/core/src/card-cars.ts` (tone, position, the looks it suits, and
   generic alt text such as "Red supercar, rear view"). Nothing else changes:
   cards pick from the pool by tone.
