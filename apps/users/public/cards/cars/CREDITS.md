# Card car photos: where they came from

The hero photos on the premium gift cards and scratch-prize cards
(`apps/users/components/premium-card`, picked by
`packages/core/src/card-cars.ts`). Keep this file next to the pictures, and
update it whenever a picture is added, replaced or edited.

**Never show a brand or model name with these pictures**, in the app, in a
file name, in alt text or in marketing. They are photos of real cars (a few are
studio renders) with every legible badge, wheel-centre logo,
model script, sponsor decal and tyre lettering removed. Under each gift card
the gift share screen and the recipient's page say: "Cars shown for
illustration only. Not affiliated with any car maker."

## Licence

- Unsplash licence: <https://unsplash.com/license>. Pexels licence:
  <https://www.pexels.com/license/>. Each photo's licence is named in its row
  (Pexels links are given by photo number; the full page addresses are in
  `Detlio-Dev/reference/cars-unsplash/sources.txt`).
- Both: free to use commercially, editing allowed, no attribution or
  permission required (a credit is optional).
- Neither allows selling the photos unaltered, or compiling them into a
  similar or competing photo service. Neither happens here.
- The licence covers the photographer's copyright, not trademarks or designs
  shown in a photo. That is why the badges are removed, no make or model is
  named, and the illustration-only line is shown.
- Downloaded at 2400 px wide and approved by the owner: the first six on
  18 October 2026, the next 24 on 19 October 2026. The untouched downloads
  are kept outside the repo (`Detlio-Dev/reference/cars-unsplash/raw` and
  `raw-batch2`).

## Files

Each photo is cropped for the card's photo area (16:13, the car big and
bleeding off the edge), retouched, and saved as WebP at 1600 px (the shared
Story/Post image) and 800 px (the card on screen): quality 82, lowered
(to no less than 62) where the 1600 px file would pass about 110 KB.

| Files | Source | Retouched |
|---|---|---|
| `red-rear-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/red-sports-car-tmAynVA_ihE> | Wheel-centre logo blurred; the edge of the rear badge at the frame edge blurred. Mirrored left to right, so the dark trees sit under the card's wordmark. |
| `grey-coupe-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/gray-coupe-parked-on-gray-concrete-pavement-7Nsarl91394> | Lettering on the rear wing and the script badge on the rear deck removed; wheel-centre logo blurred; brake-caliper lettering and tyre lettering removed. The fender badge and front of the car are cropped out. |
| `silver-concept-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/a-silver-sports-car-on-a-gray-background-7CI6l0yUZ7M> | Wheel-centre logo blurred. The fender badge is cropped out. |
| `white-track-rear-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/sleek-white-sports-car-with-large-spoiler-on-dark-background-BQwtmVs2K0o> | Maker lettering across the rear removed; wing end-plate logo and both wheel-centre logos blurred. No number plate is fitted. |
| `white-supercar-dark-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/a-sleek-white-sports-car-against-a-dark-background-S5ogDe0Uzp0> | Wheel-centre logo blurred; tyre lettering removed; the end of the sill's model badge at the frame edge removed. The nose badge is cropped out. |
| `purple-hypercar-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/a-purple-sports-car-driving-down-a-race-track-Ml6t-daUOO8> | Sticker lettering on the nose removed; brake-caliper lettering removed; the small maker logo on the side and the sponsor logo on the side pod removed; the red-and-white kerb at the bottom painted over with track (it showed as a pink band in the fade). The wing decal is cropped out. |
| `white-wing-rear-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/Lwdor-SjOHc> | Maker script across the tail painted out; the model badge under the tail light, the dealer number plate and plate holder, the decal on the roof spoiler and the decals under the wing removed; both wheel-centre logos blurred; tyre lettering removed. |
| `white-coupe-side-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/bhuyaZftOB8> | Model script on the door removed; both wheel-centre crests, the lettering on both brake calipers and the tyre lettering removed. |
| `white-supercar-front-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/37519991/> | Nose badge removed; the front number plate painted over as dark grille; a small letter badge on the side removed. |
| `silver-roadster-front-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/37276593/> | Nose badge removed. |
| `bronze-coupe-side-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/iqBvptZ-UI4> | Both wheel-centre logos and the tyre lettering removed. The nose and tail badges are too small to read at this crop. |
| `green-racer-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/tdRWPPphY3g> | Team lettering across the windscreen banner painted out; tyre lettering on both tyres removed. Studio render. |
| `black-widebody-front-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/dDMLlk4ULy4> | Red nose badge removed. Studio render. |
| `black-coupe-rooftop-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/6yTAcRpWiYY> | Both wheel-centre logos, the lettering on both brake calipers and the tyre lettering removed; the painted bay numbers and lines on the floor removed. |
| `orange-coupe-side-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/19076555/> | Both wheel-centre roundels removed. |
| `silver-supercar-close-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/33636456/> | None needed: no badge or lettering in the crop. Studio render. |
| `blue-coupe-rear-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/17476943/> | Yellow number plate removed; the maker emblem and two model badges on the boot lid removed; the wheel-centre emblem and the tyre lettering removed. The side-vent lettering is cropped out. |
| `green-coupe-front-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/RqJ8TBk6D-Q> | Maker roundel on the bonnet, the model badge on the grille and the wheel-centre roundel removed. |
| `red-supercar-studio-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/7Pi2q0OPM14> | Nose badge removed. The studio light stand is cropped out. |
| `blue-supercar-outline-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/_0eOyLYXIto> | None needed: only the car's outline is lit. |
| `yellow-coupe-street-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/T0lc-9uoR-8> | Street behind the car (shop signs, flags, posters, a traffic light) blurred and darkened; model script on the door, both wheel-centre crests, the lettering on both brake calipers and the tyre lettering removed. The tail script is cropped out. |
| `white-concept-top-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/A8GidxsiDAM> | Small maker mark on the nose removed. Studio render. |
| `black-coupe-blue-light-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/jbHbnz3lR3E> | Front number plate and the crest on the bonnet removed. |
| `green-grey-concept-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/UoaneoDCahQ> | Winged maker badge on the nose and the wheel-centre logo removed. |
| `silver-hypercar-light-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/hzDhkABhGKc> | Crest on the nose removed. |
| `silver-coupe-black-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/4HejFecAiuw> | Crest on the bonnet removed; a dealer's lettering on the windscreen and its mirror image reflected in the bonnet removed; a small windscreen sticker removed. The blank front plate holder is cropped out. |
| `red-concept-reflection-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/SV17ouchi3k> | Emblem on the rear deck, the lettering on the tail and the diffuser, the model script on the door and both wheel-centre logos removed. Studio render; no maker emblem remains. |
| `black-coupe-silhouette-{800,1600}.webp` | Unsplash: <https://unsplash.com/photos/vRFub4wGFHs> | None needed: only the rim light shows. |
| `grey-coupe-taillights-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/919073/> | Tyre lettering and the lettering on a wheel spoke removed. |
| `white-roadster-garage-{800,1600}.webp` | Pexels: <https://www.pexels.com/photo/33268786/> | Maker badge on the grille, the wheel-centre logo and the model script on the side removed; a museum plate on the front and a maker's placard on the floor removed. |

No photo shows a number plate: plates are removed or cropped out.

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
