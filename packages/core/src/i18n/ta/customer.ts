/**
 * Tamil for words both customer apps show (apps/users and apps/users-app),
 * keyed by the exact English. Glossary: ../GLOSSARY.md.
 *
 * Each app's translator writes its own file (customer-web.ts, customer-app.ts);
 * strings both use can be moved here afterwards, in one pass, so two people
 * never edit this file at once.
 */
export const customer: Readonly<Record<string, string>> = {
  // ─── The rescue: other garages when one doesn't answer (Nov 2026) ───
  'These garages can do the same job': 'இந்த கேரேஜ்கள் அதே வேலையைச் செய்ய முடியும்',
  '{job}, at your address': '{job}, உங்கள் முகவரியில்',
  '{job}, collected from your address': '{job}, உங்கள் முகவரியிலிருந்து எடுத்துச் செல்லப்படும்',
  '{job} · tap a time to book.': '{job} · புக் செய்ய ஒரு நேரத்தைத் தட்டவும்.',
  'You pay again as usual; your first payment is refunded.':
    'வழக்கம்போல் மீண்டும் பணம் செலுத்துவீர்கள்; உங்கள் முதல் பணம் திருப்பித் தரப்படும்.',
  'Usually answers in {mins} min': 'பொதுவாக {mins} நிமிடத்தில் பதில் தரும்',
  '{day}, near {time}': '{day}, {time} அருகில்',
  "{vendorName} can't take this booking": '{vendorName} இந்த புக்கிங்கை எடுக்க முடியாது',
  'Same job': 'அதே வேலை',
  'The same job': 'அதே வேலை',
  'No other garage nearby has a time for this job right now.':
    'இப்போது அருகில் வேறு எந்த கேரேஜிலும் இந்த வேலைக்கு நேரம் இல்லை.',
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
  // Home and the list when nothing is within 150 km: another city instead.
  'No Detlio garages near you yet': 'உங்கள் அருகில் இன்னும் Detlio கேரேஜ்கள் இல்லை',
  'Choose a city': 'நகரத்தைத் தேர்வு செய்யவும்',
  // ─── Bring your garage (21 Nov 2026): the list's end card, the sheet, Profile ───
  'Know a good garage? Bring it to Detlio': 'நல்ல கேரேஜ் ஏதாவது தெரியுமா? அதை Detlio-க்கு கொண்டு வாருங்கள்',
  'Get {amount} when they join and you book them': 'அவர்கள் சேர்ந்து நீங்கள் அவர்களை புக் செய்தால் {amount} கிடைக்கும்',
  '{amount} Detlio credit if they join and you book them.':
    'அவர்கள் சேர்ந்து நீங்கள் அவர்களை புக் செய்தால் {amount} Detlio கிரெடிட்.',
  'Bring your garage · Get {amount}': 'உங்கள் கேரேஜைக் கொண்டு வாருங்கள் · {amount} பெறுங்கள்',
  'How to send': 'எப்படி அனுப்புவது',
  'Send to Detlio': 'Detlio-க்கு அனுப்பவும்',
  'Send on WhatsApp': 'WhatsApp-ல் அனுப்பவும்',
  'We write the message. You send it to the garage owner from your own WhatsApp.':
    'மெசேஜை நாங்கள் எழுதித் தருகிறோம். நீங்கள் உங்கள் சொந்த WhatsApp-லிருந்து கேரேஜ் உரிமையாளருக்கு அனுப்புங்கள்.',
  'Their WhatsApp number': 'அவர்களின் WhatsApp நம்பர்',
  'Your message': 'உங்கள் மெசேஜ்',
  'Open WhatsApp': 'WhatsApp-ஐத் திறக்கவும்',
  'Give the garage’s name and their 10-digit WhatsApp number.':
    'கேரேஜின் பெயரையும் அவர்களின் 10 இலக்க WhatsApp நம்பரையும் கொடுங்கள்.',
  'Detlio sends nothing. You can change the words in WhatsApp before you send.':
    'Detlio எதையும் அனுப்பாது. அனுப்பும் முன் WhatsApp-லேயே வார்த்தைகளை மாற்றலாம்.',
  'Thanks! We’ll call them': 'நன்றி! நாங்கள் அவர்களை அழைப்போம்',
  'We’ll get in touch with {name} and help them join.': '{name}-ஐத் தொடர்பு கொண்டு, அவர்கள் சேர உதவுவோம்.',
  'You get {amount} Detlio credit once they join and you finish a paid booking with them.':
    'அவர்கள் சேர்ந்து, நீங்கள் அவர்களிடம் பணம் செலுத்தி ஒரு புக்கிங்கை முடித்ததும் உங்களுக்கு {amount} Detlio கிரெடிட் கிடைக்கும்.',
  'Recommend another garage': 'இன்னொரு கேரேஜைப் பரிந்துரைக்கவும்',
  'Done': 'முடிந்தது',
  // ─── "All over <city>" garages (0069), on a Doorstep or Pickup & drop list ───
  'Comes anywhere in {city}': '{city}-ல் எங்கும் வருவார்கள்',
  'Collects anywhere in {city}': '{city}-ல் எங்கிருந்தும் எடுத்துச் செல்வார்கள்',
}
