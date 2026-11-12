/**
 * Tamil for words both customer apps show (apps/users and apps/users-app),
 * keyed by the exact English. Glossary: ../GLOSSARY.md.
 *
 * Each app's translator writes its own file (customer-web.ts, customer-app.ts);
 * strings both use can be moved here afterwards, in one pass, so two people
 * never edit this file at once.
 */
export const customer: Readonly<Record<string, string>> = {
  // ─── Customer cities (0070): the city chip, the sheet, small cities ───
  'Your city: {city}. Change': 'உங்கள் நகரம்: {city}. மாற்றவும்',
  'Your area: {area}, {city}. Change': 'உங்கள் பகுதி: {area}, {city}. மாற்றவும்',
  'All of {city}': '{city} முழுவதும்',
  'Location blocked — all of {city}': 'லொக்கேஷன் தடுக்கப்பட்டது — {city} முழுவதும்',
  'Show all of {city}': '{city} முழுவதையும் காட்டவும்',
  'Pick your city and area to see distances and drive times. No location permission needed.':
    'தூரங்களையும் பயண நேரங்களையும் பார்க்க உங்கள் நகரத்தையும் பகுதியையும் தேர்வு செய்யவும். லொக்கேஷன் அனுமதி தேவையில்லை.',
  'Search areas in {city}': '{city}-ல் பகுதிகளைத் தேடவும்',
  'garage in {city}': '{city}-ல் கேரேஜ்',
  'garages in {city}': '{city}-ல் கேரேஜ்கள்',
  'Open the map: {words}': 'மேப்பைத் திறக்கவும்: {words}',
  'Detlio in {city}': '{city}-ல் Detlio',
  'In {city}': '{city}-ல்',
  'Know a great garage in {city}?': '{city}-ல் நல்ல கேரேஜ் ஏதாவது தெரியுமா?',
  'Recommend it': 'பரிந்துரைக்கவும்',
  'Verify and send': 'சரிபார்த்து அனுப்பவும்',
  'Give the garage’s name, and a Google Maps link or their phone.':
    'கேரேஜின் பெயரையும், Google Maps லிங்க் அல்லது அவர்களின் போன் நம்பரையும் கொடுங்கள்.',
  // ─── Garages in other towns: the town chip and line, the 150 km limit ───
  '{town} · {km} km': '{town} · {km} km',
  '{km} km away': '{km} km தொலைவில்',
  'Further away · other towns': 'தொலைவில் · மற்ற ஊர்கள்',
  'This garage is in {town}, about {km} km from you.':
    'இந்த கேரேஜ் {town}-ல் உள்ளது, உங்களிடமிருந்து சுமார் {km} km.',
  'This garage is about {km} km from you.':
    'இந்த கேரேஜ் உங்களிடமிருந்து சுமார் {km} km தொலைவில் உள்ளது.',
  'This garage is about {km} km from {city}.':
    'இந்த கேரேஜ் {city}-லிருந்து சுமார் {km} km தொலைவில் உள்ளது.',
  'No garages within {km} km of you yet. Search finds a garage by its name, wherever it is.':
    'உங்களிடமிருந்து {km} km-க்குள் இன்னும் கேரேஜ்கள் இல்லை. கேரேஜ் எங்கே இருந்தாலும், அதன் பெயரைத் தேடிக் கண்டுபிடிக்கலாம்.',
  'No garages within {km} km of {city} yet. Search finds a garage by its name, wherever it is.':
    '{city}-லிருந்து {km} km-க்குள் இன்னும் கேரேஜ்கள் இல்லை. கேரேஜ் எங்கே இருந்தாலும், அதன் பெயரைத் தேடிக் கண்டுபிடிக்கலாம்.',
  // ─── "All over <city>" garages (0069), on a Doorstep or Pickup & drop list ───
  'Comes anywhere in {city}': '{city}-ல் எங்கும் வருவார்கள்',
  'Collects anywhere in {city}': '{city}-ல் எங்கிருந்தும் எடுத்துச் செல்வார்கள்',
}
