# Car pictures: where they came from

The car on Home's hero (`apps/users/components/home/car-hero.tsx`, chosen by
`packages/core/src/car-images.ts`). Keep this file next to the pictures, and
update it whenever a picture is added, replaced or edited.

**Never show a brand or model name with these pictures.** Three of them are
photos of real production cars with every badge, wheel logo and number plate
removed. The Pexels licence forbids implying that the people or brands in a
photo endorse us, so a picture must not be captioned, labelled or described as
a particular make or model, in the app or in marketing. The hero shows the
customer's own car name above whichever picture matches its body type; that is
the customer's car, not the car in the picture.

## Licence (all three Pexels photos)

- Pexels licence: <https://www.pexels.com/license/>
- Free to use commercially, editing allowed, no attribution required (a credit
  is optional).
- Must not imply endorsement by the people or brands shown. All brand marks
  are removed in the shipped files.
- Downloaded on **12 October 2026**, after the owner approved the three photos.
  The files are the original-size downloads from `images.pexels.com` (no width
  parameters). Their sizes were checked against the CDN the same day and
  matched byte for byte.

## Files

| File | Body type | Source |
|---|---|---|
| `car-hatchback-1200.webp`, `car-hatchback-2400.webp` | Hatchback | Pexels photo 18517130 |
| `car-sedan-1200.webp`, `car-sedan-2400.webp` | Sedan | Pexels photo 21431027 |
| `car-suv-1200.webp`, `car-suv-2400.webp` | SUV (also shown for "SUV / MUV") | Pexels photo 12163946 |
| `car-default.webp`, `car-default.png` | Fallback for any other type, and for every car when `CAR_PICTURES_BY_TYPE` is off | The owner's own sports-car photo, not from Pexels |

### Hatchback

- Page: <https://www.pexels.com/photo/vehicle-on-a-road-18517130/>
- File: <https://images.pexels.com/photos/18517130/pexels-photo-18517130.jpeg>
- Photographer: Luke Miller / Pexels
- Original: 4557 × 6835 px, 1,340,296 bytes, SHA-1 `efcafdfac1716502e4267196fa4afa8738886cdf`
- Original scene: a black hatchback, pure side view, nose left, outdoors on an
  overcast road.

### Sedan

- Page: <https://www.pexels.com/photo/a-car-in-a-garage-21431027/>
- File: <https://images.pexels.com/photos/21431027/pexels-photo-21431027.jpeg>
- Photographer: Hyundai Motor Group / Pexels
- Original: 3000 × 3000 px, 320,345 bytes, SHA-1 `a77faef550a95cb063b12d5196fbb1efbe7768d9`
- Original scene: a graphite sedan, pure side view, nose left, grey studio.
- A small, heavily compressed file. The 3000 px working master was upscaled
  1.126×, but nothing shipped is upscaled from the source: the 2400 px file is
  0.90× and the 1200 px file 0.45× of it.

### SUV

- Page: <https://www.pexels.com/photo/12163946/>
- File: <https://images.pexels.com/photos/12163946/pexels-photo-12163946.jpeg>
- Photographer: **not confirmed.** The Pexels page could not be opened from the
  machine that downloaded it (a Cloudflare check). It is a carmaker's press
  studio shot, most likely "Hyundai Motor Group / Pexels". Check the page before
  crediting anyone; a credit is optional under the licence.
- Original: 10200 × 10200 px, 2,577,962 bytes, SHA-1 `dca3f58cae5a87342f1c640f00c1d9a8bfc8e6bd`
- Original scene: a white SUV with a black roof, pure side view, nose left (as
  shot: it was not flipped), blue studio.

A fourth candidate, Pexels photo 11808155, was rejected (a rear three-quarter
view) and never downloaded.

## Edits made to the three Pexels photos

The same for each, so the three match:

1. Badges, wheel-centre logos and the number plate removed.
2. Recoloured to grey tones, so the three sit together.
3. Cut out from the background onto transparency, with a soft contact shadow
   under the tyres.
4. Placed on one canvas, 1200 × 432 px (and 2400 × 864 px for dense screens),
   at one scale, with every car's tyres on the same line, 90.7% of the
   way down. Heights are true to the cars, so the SUV stands taller than the
   hatchback and the sedan. The hero places the pictures by that line
   (`.car-hero__car--body-type` in `apps/users/app/globals.css`).
5. Saved as WebP with transparency.

Shipped files (SHA-1):

| File | Size | SHA-1 |
|---|---|---|
| `car-hatchback-1200.webp` | 1200 × 432 | `4e4af4c794bbc8d5d1951aa0105473428e65d248` |
| `car-hatchback-2400.webp` | 2400 × 864 | `50dc79d0311804fd9e5029054c6e23f57abde0d3` |
| `car-sedan-1200.webp` | 1200 × 432 | `58a3c799812cf71cceba694ef86ffb6250e6475d` |
| `car-sedan-2400.webp` | 2400 × 864 | `0faa1e0b7bfd1125c48bee19e17a08f628ddceb5` |
| `car-suv-1200.webp` | 1200 × 432 | `75dc4189f6fd06897c521225bc11eba3d1f48bcd` |
| `car-suv-2400.webp` | 2400 × 864 | `1e992473af089c57e562598535d9b60370c8a120` |

The original downloads are not in the repository.
