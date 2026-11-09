/**
 * Tamil for the customer app (apps/users-app), keyed by the exact English it
 * shows. Glossary: ../GLOSSARY.md.
 *
 * Strings the customer website shares are often the same English: the same
 * English in two ta/ files must have the same Tamil (i18n.test.ts).
 */
export const customerApp: Readonly<Record<string, string>> = {
  // app/login.tsx
  'By continuing, you agree to our {terms}.\nOur {privacy} explains how we use your data.':
    'தொடர்வதன் மூலம் எங்கள் {terms}-ஐ ஏற்கிறீர்கள்.\nஉங்கள் தகவலை எப்படிப் பயன்படுத்துகிறோம் என்பதை எங்கள் {privacy} விளக்குகிறது.',
  // app/bookings/[id]/index.tsx
  "We're still checking your last payment. There's no need to pay again.":
    'உங்கள் கடைசி பேமெண்ட்டை இன்னும் சரிபார்க்கிறோம். மீண்டும் செலுத்த வேண்டாம்.',
  'Your payment went through.': 'உங்கள் பேமெண்ட் வெற்றிகரமாகச் சென்றது.',
  'New time sent to {name}. Waiting for them to accept.':
    'புதிய நேரம் {name}-க்கு அனுப்பப்பட்டது. அவர்கள் ஏற்கக் காத்திருக்கிறோம்.',
  'Checking your payment…': 'உங்கள் பேமெண்ட்டைச் சரிபார்க்கிறோம்…',
  'Call {name}': '{name}-ஐ அழைக்கவும்',
  "{name} has collected your car, so this booking can't be cancelled or moved in the app. To change anything, or if something isn't right, use Help with this booking to reach the garage or our team, or raise a complaint there.":
    '{name} உங்கள் காரை எடுத்துச் சென்றுவிட்டது, அதனால் இந்த புக்கிங்கை ஆப்பில் ரத்து செய்யவோ நேரத்தை மாற்றவோ முடியாது. ஏதாவது மாற்ற வேண்டுமென்றால் அல்லது ஏதாவது சரியில்லை என்றால், "இந்த புக்கிங்கிற்கான உதவி" மூலம் கேரேஜையோ எங்கள் டீமையோ தொடர்பு கொள்ளுங்கள், அல்லது அங்கேயே புகார் அளியுங்கள்.',
  "Your slot is less than 2 hours away, so it can't be moved here. Use Help with this booking to reach {name} or our team.":
    'உங்கள் ஸ்லாட்டுக்கு 2 மணிநேரத்துக்கும் குறைவாகவே உள்ளது, அதனால் இங்கே நேரத்தை மாற்ற முடியாது. {name}-ஐயோ எங்கள் டீமையோ தொடர்பு கொள்ள "இந்த புக்கிங்கிற்கான உதவி"-ஐப் பயன்படுத்துங்கள்.',
  'You can reschedule twice in all · {count} of 2 left. Your booking goes back to Requested until {name} accepts the new time.':
    'மொத்தம் இரண்டு முறை நேரத்தை மாற்றலாம் · 2-இல் {count} மீதம். {name} புதிய நேரத்தை ஏற்கும் வரை உங்கள் புக்கிங் மீண்டும் "கோரப்பட்டது" நிலைக்குச் செல்லும்.',
  'You can reschedule twice in all · {count} of 2 left. {name} will need to accept the new time.':
    'மொத்தம் இரண்டு முறை நேரத்தை மாற்றலாம் · 2-இல் {count} மீதம். புதிய நேரத்தை {name} ஏற்க வேண்டும்.',
  "Your slot is less than 2 hours away and {name} has accepted it, so it can't be cancelled here. Use Help with this booking to reach the garage or our team.":
    'உங்கள் ஸ்லாட்டுக்கு 2 மணிநேரத்துக்கும் குறைவாகவே உள்ளது, {name} அதை ஏற்றுவிட்டது, அதனால் இங்கே ரத்து செய்ய முடியாது. கேரேஜையோ எங்கள் டீமையோ தொடர்பு கொள்ள "இந்த புக்கிங்கிற்கான உதவி"-ஐப் பயன்படுத்துங்கள்.',
  "{name} hasn't accepted yet, so you can cancel any time. This cannot be undone.":
    '{name} இன்னும் ஏற்கவில்லை, அதனால் எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். இதைத் திரும்ப மாற்ற முடியாது.',
  'Waiting for {name} to accept your {when} slot.':
    'உங்கள் {when} ஸ்லாட்டை {name} ஏற்கக் காத்திருக்கிறோம்.',
  '{services} at {name} · {when}': '{name}-இல் {services} · {when}',
  'You can reschedule only twice · {count} of 2 left. Pick a new time; {name} will be asked to accept it.':
    'இரண்டு முறை மட்டுமே நேரத்தை மாற்றலாம் · 2-இல் {count} மீதம். புதிய நேரத்தைத் தேர்ந்தெடுங்கள்; அதை ஏற்கும்படி {name}-இடம் கேட்போம்.',
  // app/bookings/[id]/guarantee.tsx
  'Ask by {time}': '{time}-க்குள் கேளுங்கள்',
  'Take at least {count} with your camera, close up on what was missed. Location and camera details are removed before upload.':
    'விடுபட்ட இடத்தை அருகில் வைத்து, உங்கள் கேமராவில் குறைந்தது {count} போட்டோக்கள் எடுங்கள். அப்லோட் செய்வதற்கு முன் லொக்கேஷன், கேமரா விவரங்கள் நீக்கப்படும்.',
  'Problem photo {number}': 'பிரச்சனை போட்டோ {number}',
  'Remove photo {number}': 'போட்டோ {number}-ஐ நீக்கவும்',
  'Pick a time at {name}': '{name}-இல் ஒரு நேரத்தைத் தேர்ந்தெடுங்கள்',
  'Free of charge, by {time}.': 'இலவசம், {time}-க்குள்.',
  // app/bookings/[id]/receipt.tsx
  "Sharing isn't available on this phone.": 'இந்த போனில் பகிர முடியாது.',
  "Couldn't make the PDF. Try again.":
    'PDF-ஐ உருவாக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Making it…': 'உருவாக்குகிறது…',
  // app/verify/[token].tsx
  'Go to Detlio': 'Detlio-க்குச் செல்லுங்கள்',
  'Check a Service History': 'சர்வீஸ் வரலாற்றைச் சரிபாருங்கள்',
  'Couldn’t check this certificate':
    'இந்தச் சான்றிதழைச் சரிபார்க்க முடியவில்லை',
  "Detlio isn't answering right now. Please try again in a few minutes.":
    'Detlio இப்போது பதில் அளிக்கவில்லை. சில நிமிடங்களில் மீண்டும் முயற்சிக்கவும்.',
  'This certificate is no longer shared': 'இந்தச் சான்றிதழ் இனி பகிரப்படவில்லை',
  "The car's owner may have stopped sharing it, or the link has run out or was copied wrongly. Ask the owner for a new link.":
    'கார் உரிமையாளர் பகிர்வதை நிறுத்தியிருக்கலாம், அல்லது லிங்க் காலாவதியாகியிருக்கலாம் அல்லது தவறாக நகலெடுக்கப்பட்டிருக்கலாம். உரிமையாளரிடம் புதிய லிங்க் கேளுங்கள்.',
  'Too many checks just now': 'இப்போது பல முறை சரிபார்க்கப்பட்டுள்ளது',
  'Please wait a minute and open the link again.':
    'ஒரு நிமிடம் காத்திருந்து லிங்க்கை மீண்டும் திறக்கவும்.',
  'Genuine Detlio record': 'உண்மையான Detlio பதிவு',
  "Certificate {number}, read from Detlio on {day}. It shows the car's record as it stands today, without the owner's details.":
    'சான்றிதழ் {number}, {day} அன்று Detlio-விலிருந்து படிக்கப்பட்டது. உரிமையாளர் விவரங்கள் இல்லாமல், இன்றைய நிலையில் காரின் பதிவைக் காட்டுகிறது.',
  Checked: 'சரிபார்க்கப்பட்டது',
  "Shared by the car's owner through Detlio. Owner's name, phone and address are never shown.":
    'கார் உரிமையாளர் Detlio மூலம் பகிர்ந்தது. உரிமையாளரின் பெயர், போன், முகவரி ஒருபோதும் காட்டப்படாது.',
  // app/(tabs)/home.tsx
  '{amount} off ready to use': '{amount} தள்ளுபடி பயன்படுத்தத் தயார்',
  // app/(tabs)/map.tsx
  '{name}, from ₹{price}': '{name}, ₹{price} முதல்',
  '{count} garages here. Zoom in': 'இங்கே {count} கேரேஜ்கள். பெரிதாக்குங்கள்',
  "The map isn't available in this version of the app. Garages near you are listed here.":
    'ஆப்பின் இந்த வெர்ஷனில் மேப் கிடையாது. உங்கள் அருகிலுள்ள கேரேஜ்கள் இங்கே பட்டியலிடப்பட்டுள்ளன.',
  'No garages within {km} km of you yet.':
    'உங்களிடமிருந்து {km} km-க்குள் இன்னும் கேரேஜ் இல்லை.',
  '{number} of {total}': '{total}-இல் {number}',
  'Showing the nearest {count}.': 'அருகிலுள்ள {count} காட்டப்படுகின்றன.',
  'Showing the first {count} — zoom in to narrow it down.':
    'முதல் {count} காட்டப்படுகின்றன — குறைக்க பெரிதாக்குங்கள்.',
  // app/(tabs)/bookings.tsx
  '{services} at {name}': '{name}-இல் {services}',
  '{label}. Starts in {time}': '{label}. {time}-இல் தொடங்கும்',
  'Book again: {services} at {name}':
    'மீண்டும் புக் செய்யுங்கள்: {name}-இல் {services}',
  // app/(tabs)/profile.tsx
  'Terms of Use': 'பயன்பாட்டு விதிமுறைகள்',
  'Cancellation & Refunds': 'ரத்து & பணத்தைத் திருப்பித் தருதல்',
  'Service delivery': 'சர்வீஸ் வழங்குதல்',
  'Contact & grievances': 'தொடர்பு & குறைகள்',
  '{count} badge': '{count} பேட்ஜ்',
  '{count} badges': '{count} பேட்ஜ்கள்',
  // app/invite.tsx
  '{name} invited you to Detlio': '{name} உங்களை Detlio-க்கு அழைத்துள்ளார்',
  'Get {amount} off when your first booking of {min} or more is done. {name} gets {amount} off too.':
    '{min} அல்லது அதற்கு மேலான உங்கள் முதல் புக்கிங் முடிந்ததும் {amount} தள்ளுபடி பெறுங்கள். {name}-க்கும் {amount} தள்ளுபடி கிடைக்கும்.',
  // app/profile/rewards/index.tsx
  '{count} scratch cards for you': 'உங்களுக்கு {count} ஸ்கிராட்ச் கார்டுகள்',
  'Your {year} Detlio Wrapped': 'உங்கள் {year} Detlio Wrapped',
  "You joined through {name}'s invite.":
    '{name}-இன் அழைப்பின் மூலம் சேர்ந்தீர்கள்.',
  '{count} of {goal} stamps': '{goal}-இல் {count} ஸ்டாம்ப்கள்',
  '{goal} stamps make {amount} off. One for every booking of {min} or more paid through Detlio.':
    '{goal} ஸ்டாம்ப்கள் = {amount} தள்ளுபடி. Detlio மூலம் செலுத்திய {min} அல்லது அதற்கு மேலான ஒவ்வொரு புக்கிங்கிற்கும் ஒன்று.',
  everyone: 'அனைவரும்',
  'Up to {amount} · scratch card': '{amount} வரை · ஸ்கிராட்ச் கார்டு',
  'Use by {day}': '{day}-க்குள் பயன்படுத்துங்கள்',
  // app/profile/rewards/wrapped.tsx
  'Detlio Wrapped {year}, card {number} of {total}':
    'Detlio Wrapped {year}, {total}-இல் கார்டு {number}',
  '{level} level': '{level} லெவல்',
  // app/profile/slot-alerts.tsx
  'Stop waiting for {name}, {when}':
    '{name}, {when}-க்குக் காத்திருப்பதை நிறுத்தவும்',
  "Up to {max} at once. If a time opens it shows in Updates, and as a notification if they're on. It isn't held: the first to book gets it.":
    'ஒரே நேரத்தில் {max} வரை. ஒரு நேரம் காலியானால் அது அப்டேட்களில் தெரியும், அறிவிப்புகள் ஆன் என்றால் அறிவிப்பாகவும் வரும். அது உங்களுக்காக ஒதுக்கப்படாது: முதலில் புக் செய்பவருக்குக் கிடைக்கும்.',
  // app/profile/notifications.tsx
  'This phone': 'இந்த போன்',
  'Notifications on this phone': 'இந்த போனில் அறிவிப்புகள்',
  'Notifications are blocked for Detlio in this phone’s settings.':
    'இந்த போனின் அமைப்புகளில் Detlio-வுக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன.',
  'Open settings': 'அமைப்புகளைத் திறக்கவும்',
  'Also on for {count} other device': 'மேலும் {count} சாதனத்திலும் ஆன்',
  'Also on for {count} other devices': 'மேலும் {count} சாதனங்களிலும் ஆன்',
  // app/profile/credit.tsx
  '{amount} expires on {day}': '{amount} {day} அன்று காலாவதியாகும்',
  '{amount} expires in the next 30 days':
    '{amount} அடுத்த 30 நாட்களில் காலாவதியாகும்',
  // app/profile/gifts/index.tsx
  '{amount} for {name}': '{name}-க்கு {amount}',
  'Redeemed on {day}': '{day} அன்று பெறப்பட்டது',
  // app/profile/gifts/new.tsx
  "We're still checking your last gift payment. There's no need to pay again.":
    'உங்கள் கடைசி பரிசு பேமெண்ட்டை இன்னும் சரிபார்க்கிறோம். மீண்டும் செலுத்த வேண்டாம்.',
  'Your gift is paid. Get its link in Gifts you sent.':
    'உங்கள் பரிசுக்குப் பணம் செலுத்தப்பட்டது. அதன் லிங்க்கை "நீங்கள் அனுப்பிய பரிசுகள்"-இல் பெறுங்கள்.',
  'Nothing was charged.': 'எந்தப் பணமும் எடுக்கப்படவில்லை.',
  'Amount ({min} to {max})': 'தொகை ({min} முதல் {max} வரை)',
  'They can use it on any booking on Detlio for {months} months from today. You get a link to send them after paying. Up to {amount} of gifts a day.':
    'இன்றிலிருந்து {months} மாதங்களுக்கு Detlio-வில் எந்த புக்கிங்கிலும் அவர்கள் இதைப் பயன்படுத்தலாம். பணம் செலுத்திய பின் அவர்களுக்கு அனுப்ப ஒரு லிங்க் கிடைக்கும். ஒரு நாளில் {amount} வரை பரிசுகள்.',
  'The total has changed': 'மொத்தத் தொகை மாறிவிட்டது',
  'The total to pay is now {amount}. Nothing has been charged.':
    'செலுத்த வேண்டிய மொத்தம் இப்போது {amount}. எந்தப் பணமும் எடுக்கப்படவில்லை.',
  "Don't pay": 'செலுத்த வேண்டாம்',
  // app/profile/cars/[id]/index.tsx
  '{amount} on {washes} since {since}': '{since} முதல் {washes}-க்கு {amount}',
  'No {category} jobs for this car yet.':
    'இந்தக் காருக்கு இன்னும் {category} வேலைகள் இல்லை.',
  '{count} cancelled bookings for this car aren’t listed here.':
    'இந்தக் காரின் {count} ரத்தான புக்கிங்குகள் இங்கே பட்டியலிடப்படவில்லை.',
  // app/profile/cars/[id]/certificate.tsx
  'Photos added to your link': 'உங்கள் லிங்க்கில் போட்டோக்கள் சேர்க்கப்பட்டன',
  'Photos removed from your link':
    'உங்கள் லிங்க்கிலிருந்து போட்டோக்கள் நீக்கப்பட்டன',
  'New link made': 'புதிய லிங்க் உருவாக்கப்பட்டது',
  'Link ready to share': 'லிங்க் பகிரத் தயார்',
  "Sign in to see your car's certificate":
    'உங்கள் காரின் சான்றிதழைப் பார்க்க உள்நுழையவும்',
  "Couldn't load this certificate. Check your connection.":
    'இந்தச் சான்றிதழை ஏற்ற முடியவில்லை. உங்கள் இணைப்பைச் சரிபாருங்கள்.',
  'Print / Save as PDF': 'அச்சிடுங்கள் / PDF ஆகச் சேமியுங்கள்',
  'On Android, choose Save as PDF as the printer; on iPhone, tap Share on the print screen, then Save to Files.':
    'Android-இல், பிரிண்டராக "Save as PDF"-ஐத் தேர்ந்தெடுங்கள்; iPhone-இல், பிரிண்ட் திரையில் Share-ஐத் தட்டி, பிறகு "Save to Files"-ஐத் தட்டுங்கள்.',
  'Share link': 'லிங்க்கைப் பகிருங்கள்',
  'Anyone with the link, or the QR code on the printout, can check this record is genuine. They see the car, garages, dates and services. Never your name, phone or address, or the full number plate.':
    'லிங்க் அல்லது அச்சில் உள்ள QR கோட் உள்ள எவரும் இந்தப் பதிவு உண்மையானது என்று சரிபார்க்கலாம். அவர்கள் கார், கேரேஜ்கள், தேதிகள், சர்வீஸ்களைப் பார்ப்பார்கள். உங்கள் பெயர், போன், முகவரி அல்லது முழு நம்பர் பிளேட் ஒருபோதும் தெரியாது.',
  'Include before/after photos': 'முன்பு/பின்பு போட்டோக்களைச் சேர்க்கவும்',
  'Off unless you turn it on.': 'நீங்கள் ஆன் செய்யாதவரை ஆஃப்.',
  'Photos may show your number plate':
    'போட்டோக்களில் உங்கள் நம்பர் பிளேட் தெரியலாம்',
  'Include photos': 'போட்டோக்களைச் சேர்க்கவும்',
  'Stopped sharing': 'பகிர்வது நிறுத்தப்பட்டது',
  'Your link ran out on {day}. Make a new one to share again.':
    'உங்கள் லிங்க் {day} அன்று காலாவதியானது. மீண்டும் பகிர புதியதை உருவாக்குங்கள்.',
  'Your link ran out. Make a new one to share again.':
    'உங்கள் லிங்க் காலாவதியானது. மீண்டும் பகிர புதியதை உருவாக்குங்கள்.',
  "Your link still works for whoever has it, but it can't be shown here. Make a new link to print a QR code; the old one will stop working.":
    'உங்கள் லிங்க் அதை வைத்திருப்பவர்களுக்கு இன்னும் வேலை செய்யும், ஆனால் இங்கே காட்ட முடியாது. QR கோடை அச்சிட புதிய லிங்க்கை உருவாக்குங்கள்; பழையது வேலை செய்யாது.',
  'Link works for': 'லிங்க் செல்லுபடியாகும் காலம்',
  'Until you stop it': 'நீங்கள் நிறுத்தும் வரை',
  'Make a new link': 'புதிய லிங்க்கை உருவாக்குங்கள்',
  'Detlio Service History': 'Detlio சர்வீஸ் வரலாறு',
  'works until {day}': '{day} வரை செல்லும்',
  'works until you stop it': 'நீங்கள் நிறுத்தும் வரை செல்லும்',
  'Stop sharing?': 'பகிர்வதை நிறுத்தவா?',
  'Make a new link?': 'புதிய லிங்க்கை உருவாக்கவா?',
  'The link and the QR code on any printout stop working at once.':
    'லிங்க், அச்சுகளில் உள்ள QR கோட் இரண்டும் உடனே வேலை செய்வதை நிறுத்தும்.',
  'The current link and the QR code on any printout stop working. Print the certificate again for the new one.':
    'தற்போதைய லிங்க், அச்சுகளில் உள்ள QR கோட் இரண்டும் வேலை செய்யாது. புதியதற்கு சான்றிதழை மீண்டும் அச்சிடுங்கள்.',
  'Stop sharing': 'பகிர்வதை நிறுத்தவும்',
  'New link': 'புதிய லிங்க்',
  // app/profile/complaints.tsx
  'Your complaints': 'உங்கள் புகார்கள்',
  'Sign in to see your complaints': 'உங்கள் புகார்களைப் பார்க்க உள்நுழையவும்',
  // app/gift.tsx
  'This gift expired on {day}.': 'இந்தப் பரிசு {day} அன்று காலாவதியானது.',
  'Open its link again, or type its code in Profile → Detlio credit.':
    'அதன் லிங்க்கை மீண்டும் திறக்கவும், அல்லது சுயவிவரம் → Detlio கிரெடிட்டில் அதன் கோடை டைப் செய்யுங்கள்.',
  '{amount} Detlio gift for {name}': '{name}-க்கு {amount} Detlio பரிசு',
  'From {name}': '{name}-இடமிருந்து',
  'Use by {day}.': '{day}-க்குள் பயன்படுத்துங்கள்.',
  'A Detlio gift': 'ஒரு Detlio பரிசு',
  // app/book/[vendorId].tsx
  'Nothing was booked or charged.':
    'எதுவும் புக் ஆகவில்லை, பணமும் எடுக்கப்படவில்லை.',
  '{rating} stars from {count} reviews':
    '{count} மதிப்பாய்வுகளில் {rating} நட்சத்திரங்கள்',
  'Held for you until {time}. The car, address and time are what the garage said yes to.':
    '{time} வரை உங்களுக்காக ஒதுக்கப்பட்டுள்ளது. கார், முகவரி, நேரம் — இவற்றுக்குத்தான் கேரேஜ் சம்மதித்தது.',
  'It was answered, cancelled or ran out of time.':
    'அதற்குப் பதில் அளிக்கப்பட்டது, ரத்தானது அல்லது நேரம் முடிந்தது.',
  '{name} collects your car from your address, works on it at the garage and brings it back.':
    '{name} உங்கள் முகவரியிலிருந்து காரை எடுத்து, கேரேஜில் வேலை செய்து, திருப்பிக் கொண்டு வரும்.',
  '{type} · new': '{type} · புதியது',
  'Saves {amount} · applied': '{amount} சேமிப்பு · பயன்படுத்தப்பட்டது',
  'Saves {amount}': '{amount} சேமிப்பு',
  "{code} doesn't apply to this booking. {problem}":
    '{code} இந்த புக்கிங்கிற்குப் பொருந்தாது. {problem}',
  'Use {amount} Detlio credit': '{amount} Detlio கிரெடிட்டைப் பயன்படுத்துங்கள்',
  "Cancel any time until the garage accepts. Once it has, cancel or reschedule up to 2 hours before your slot. You can reschedule up to 2 times; each new time goes back to the garage to accept, and if it can't take it, the booking is cancelled. If you don't turn up for an accepted booking, it isn't refunded.":
    'கேரேஜ் ஏற்கும் வரை எப்போது வேண்டுமானாலும் ரத்து செய்யலாம். ஏற்றபின், உங்கள் ஸ்லாட்டுக்கு 2 மணிநேரம் முன்பு வரை ரத்து செய்யலாம் அல்லது நேரத்தை மாற்றலாம். 2 முறை வரை நேரத்தை மாற்றலாம்; ஒவ்வொரு புதிய நேரமும் கேரேஜின் ஏற்புக்குச் செல்லும், அது ஏற்க முடியாவிட்டால் புக்கிங் ரத்தாகும். ஏற்கப்பட்ட புக்கிங்கிற்கு நீங்கள் வராவிட்டால், பணம் திருப்பித் தரப்படாது.',
  'Verify and pay {amount}': 'சரிபார்த்து {amount} செலுத்துங்கள்',
  'Signed in as {name}': '{name} ஆக உள்நுழைந்துள்ளீர்கள்',
  'By paying you agree to the {terms} and the {policy}.':
    'செலுத்துவதன் மூலம் {terms}-ஐயும் {policy}-ஐயும் ஏற்கிறீர்கள்.',
  'Your last payment': 'உங்கள் கடைசி பேமெண்ட்',
  "Your last payment isn't settled yet":
    'உங்கள் கடைசி பேமெண்ட் இன்னும் முடியவில்லை',
  "If you finished paying, it shows up here in a minute, so there's no need to pay again. If you closed the payment without paying, you can start over.":
    'நீங்கள் செலுத்தி முடித்திருந்தால், ஒரு நிமிடத்தில் இங்கே தெரியும், அதனால் மீண்டும் செலுத்த வேண்டாம். செலுத்தாமல் பேமெண்ட்டை மூடியிருந்தால், மீண்டும் தொடங்கலாம்.',
  'Wait a minute': 'ஒரு நிமிடம் காத்திருங்கள்',
  "I didn't pay. Start over": 'நான் செலுத்தவில்லை. மீண்டும் தொடங்கு',
  '{services} is not priced for your vehicle type. Remove it, pick another car, or contact the garage.':
    'உங்கள் வாகன வகைக்கு {services}-க்கு விலை இல்லை. அதை நீக்குங்கள், வேறு காரைத் தேர்ந்தெடுங்கள், அல்லது கேரேஜைத் தொடர்பு கொள்ளுங்கள்.',
  '{services} are not priced for your vehicle type. Remove them, pick another car, or contact the garage.':
    'உங்கள் வாகன வகைக்கு {services}-க்கு விலை இல்லை. அவற்றை நீக்குங்கள், வேறு காரைத் தேர்ந்தெடுங்கள், அல்லது கேரேஜைத் தொடர்பு கொள்ளுங்கள்.',
  // app/_layout.tsx
  'Could not reach Detlio': 'Detlio-வை அணுக முடியவில்லை',
  'You are still signed in. Check your connection.':
    'நீங்கள் இன்னும் உள்நுழைந்தே இருக்கிறீர்கள். உங்கள் இணைப்பைச் சரிபாருங்கள்.',
  // app/coupon.tsx
  'Open its link again, or type its code in Profile → Coupons.':
    'அதன் லிங்க்கை மீண்டும் திறக்கவும், அல்லது சுயவிவரம் → கூப்பன்களில் அதன் கோடை டைப் செய்யுங்கள்.',
  'A Detlio coupon': 'ஒரு Detlio கூப்பன்',
  // app/garage/[id].tsx
  'from {amount}': '{amount} முதல்',
  '{time} drive': '{time} பயணம்',
  '{count} services': '{count} சர்வீஸ்கள்',
  'Photo {number} of {total}': '{total}-இல் போட்டோ {number}',
  // components/home/action-cards.tsx
  '+{count} more to pay': '+{count} மேலும் செலுத்த வேண்டியவை',
  "Can't do {time} — pick another time":
    '{time} முடியாது — வேறு நேரத்தைத் தேர்ந்தெடுங்கள்',
  '+{count} more to answer': '+{count} மேலும் பதில் தர வேண்டியவை',
  'A holiday, the day of your {time} booking.':
    'விடுமுறை நாள் — உங்கள் {time} புக்கிங் உள்ள நாள்.',
  'Its weekly day off, the day of your {time} booking.':
    'அதன் வாராந்திர விடுமுறை — உங்கள் {time} புக்கிங் உள்ள நாள்.',
  '1 time offered · answer by {when}':
    '1 நேரம் பரிந்துரைக்கப்பட்டது · {when}-க்குள் பதில் தாருங்கள்',
  '{count} times offered · answer by {when}':
    '{count} நேரங்கள் பரிந்துரைக்கப்பட்டன · {when}-க்குள் பதில் தாருங்கள்',
  // components/home/nearby-tip.tsx
  'No garages nearby. See all garages':
    'அருகில் கேரேஜ் இல்லை. எல்லா கேரேஜ்களையும் பாருங்கள்',
  'No garages within {km} km yet': '{km} km-க்குள் இன்னும் கேரேஜ் இல்லை',
  'Within {km} km': '{km} km-க்குள்',
  '· nearest {distance}': '· அருகிலுள்ளது {distance}',
  'Car care tip · {season}': 'கார் பராமரிப்பு டிப் · {season}',
  '{count} garage nearby': 'அருகில் {count} கேரேஜ்',
  '{count} garages nearby': 'அருகில் {count} கேரேஜ்கள்',
  '{number} garage': '{number} கேரேஜ்',
  '{number} garages': '{number} கேரேஜ்கள்',
  // components/home/offers.tsx
  '{title} at {name}': '{name}-இல் {title}',
  // components/home/car-hero.tsx
  'Shine Card: {count} of {goal} stamps. {line}.':
    'Shine Card: {goal}-இல் {count} ஸ்டாம்ப்கள். {line}.',
  // components/home/tiles.tsx
  '{name} changed its services': '{name} தன் சர்வீஸ்களை மாற்றியுள்ளது',
  // components/update-required.tsx
  'Update Detlio to keep going': 'தொடர Detlio-வை அப்டேட் செய்யுங்கள்',
  'Your version {version} · needed {needed}':
    'உங்கள் வெர்ஷன் {version} · தேவை {needed}',
  // components/collect/garage-card.tsx
  'Series {series} · Detlio Garage': 'சீரிஸ் {series} · Detlio Garage',
  '{name}’s Garage': '{name}-இன் Garage',
  'Collected on Detlio': 'Detlio-வில் சேகரித்தது',
  // components/collect/pull-reveal-sheet.tsx
  'Next card ({count} more)': 'அடுத்த கார்டு (இன்னும் {count})',
  // components/collect/garage-album.tsx
  '{count} cars collected': '{count} கார்கள் சேகரிக்கப்பட்டன',
  'Every booking earns a card. Finish a row of five for ₹{reward} off.':
    'ஒவ்வொரு புக்கிங்கிற்கும் ஒரு கார்டு. ஐந்து கொண்ட ஒரு வரிசையை முடித்தால் ₹{reward} தள்ளுபடி.',
  'All {count}': 'அனைத்தும் {count}',
  'Row {row}': 'வரிசை {row}',
  '{count} of {total}': '{total}-இல் {count}',
  'Done · {amount} off given': 'முடிந்தது · {amount} தள்ளுபடி வழங்கப்பட்டது',
  '{amount} off when complete': 'முடித்தால் {amount} தள்ளுபடி',
  '{count} of {total} {rarity} cards': '{total}-இல் {count} {rarity} கார்டுகள்',
  'Odds for each card: Common {common}%, Rare {rare}%, Epic {epic}%, Legendary {legendary}%. A Rare or better is certain within {pityRare} cards, a Legendary within {pityLegendary}.':
    'ஒவ்வொரு கார்டுக்குமான வாய்ப்பு: Common {common}%, Rare {rare}%, Epic {epic}%, Legendary {legendary}%. {pityRare} கார்டுகளுக்குள் Rare அல்லது அதற்கு மேல் நிச்சயம், {pityLegendary}-க்குள் Legendary நிச்சயம்.',
  'Every {count} duplicates make a bonus Shine Card stamp. Finish a row of 5 for {amount} off your next booking.':
    'ஒவ்வொரு {count} இரட்டைக் கார்டுகளுக்கும் ஒரு போனஸ் Shine Card ஸ்டாம்ப். 5 கொண்ட ஒரு வரிசையை முடித்தால் அடுத்த புக்கிங்கில் {amount} தள்ளுபடி.',
  '{series} · supercar cards': '{series} · சூப்பர்கார் கார்டுகள்',
  'Each row of 5: {amount} off':
    '5 கொண்ட ஒவ்வொரு வரிசைக்கும்: {amount} தள்ளுபடி',
  'Series complete on {day}. You are a Garage Legend.':
    '{day} அன்று சீரிஸ் முடிந்தது. நீங்கள் ஒரு Garage லெஜண்ட்.',
  'first on {day}': 'முதலில் {day} அன்று',
  // components/collect/garage-share.tsx
  'Show “{name}’s Garage” on the picture':
    'படத்தில் “{name}-இன் Garage” என்று காட்டவும்',
  // components/collect/pull-reveal.tsx
  'Row {row} complete — {amount} off your next booking.':
    'வரிசை {row} முடிந்தது — அடுத்த புக்கிங்கில் {amount} தள்ளுபடி.',
  '{source}: a card for your Garage.':
    '{source}: உங்கள் Garage-க்கு ஒரு கார்டு.',
  // components/complaints/my-complaints.tsx
  'booking #{reference}': 'புக்கிங் #{reference}',
  // components/complaints/raise-complaint-sheet.tsx
  'About booking {reference} · {name}': 'புக்கிங் {reference} பற்றி · {name}',
  'At least {count} characters': 'குறைந்தது {count} எழுத்துகள்',
  // components/offline-banner.tsx
  "You're offline. Showing what's already on your phone.":
    'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். உங்கள் போனில் ஏற்கனவே உள்ளதைக் காட்டுகிறோம்.',
  // components/moments/unread-light.tsx
  new: 'புதியது',
  // components/moments/road.tsx
  '{step}, current step': '{step}, இப்போதைய படி',
  // components/area/location-prompt.tsx
  'Your phone is blocking location for Detlio. You can turn it back on in Settings.':
    'உங்கள் போன் Detlio-வுக்கு லொக்கேஷனைத் தடுக்கிறது. அமைப்புகளில் மீண்டும் ஆன் செய்யலாம்.',
  'Enable location asks your phone. We only use it to sort garages — it is never shared.':
    'லொக்கேஷனை இயக்கினால் உங்கள் போன் அனுமதி கேட்கும். கேரேஜ்களை வரிசைப்படுத்த மட்டுமே பயன்படுத்துகிறோம் — அது ஒருபோதும் பகிரப்படாது.',
  // components/area/area-picker.tsx
  'Location is off for Detlio. Pick your area instead — distances work the same.':
    'Detlio-வுக்கு லொக்கேஷன் ஆஃப். அதற்குப் பதிலாக உங்கள் பகுதியைத் தேர்ந்தெடுங்கள் — தூரங்கள் அதேபோல் காட்டப்படும்.',
  'No area called “{trim}” yet. Try a nearby one, or All of Chennai.':
    '“{trim}” என்ற பகுதி இன்னும் இல்லை. அருகிலுள்ள ஒன்றை, அல்லது சென்னை முழுவதையும் முயற்சிக்கவும்.',
  // components/booking/job-photos-card.tsx
  '{stage} photo {number} of {total}': '{stage} போட்டோ, {total}-இல் {number}',
  // components/booking/extra-work-card.tsx
  'Approved. {name} can go ahead.': 'ஒப்புதல் அளிக்கப்பட்டது. {name} தொடரலாம்.',
  'Declined. {name} can see your answer.':
    'மறுக்கப்பட்டது. உங்கள் பதிலை {name} பார்க்கலாம்.',
  'Asked for by {name}. Nothing is done or charged unless you approve and pay here.':
    '{name} கேட்டது. நீங்கள் இங்கே ஒப்புதல் அளித்து செலுத்தாவிட்டால் எதுவும் செய்யப்படாது, பணமும் எடுக்கப்படாது.',
  'Open photo {number} of {total} of {description}':
    '{description}-இன் {total} போட்டோக்களில் {number}-ஐத் திறக்கவும்',
  'Approved and paid on {day}': '{day} அன்று ஒப்புதல் அளித்து செலுத்தப்பட்டது',
  // components/booking/help-sheet.tsx
  'WhatsApp {name}': '{name}-க்கு WhatsApp செய்யுங்கள்',
  'Booking {reference} · {name} · {when}':
    'புக்கிங் {reference} · {name} · {when}',
  'Common questions:': 'பொதுவான கேள்விகள்:',
  // components/booking/directions-sheet.tsx
  '{distance} away in a straight line': 'நேர்கோட்டில் {distance} தூரம்',
  // components/booking/final-bill-card.tsx
  'From {name}, after inspecting your car.':
    'உங்கள் காரைப் பரிசோதித்த பின், {name}-இடமிருந்து.',
  'Paid on {day}': '{day} அன்று செலுத்தப்பட்டது',
  // components/booking/time-proposal-card.tsx
  'Booked for {time}. {name} has accepted it.':
    '{time}-க்கு புக் செய்யப்பட்டது. {name} அதை ஏற்றுவிட்டது.',
  "{name} can't do {time} — pick another time":
    '{name}-ஆல் {time} முடியாது — வேறு நேரத்தைத் தேர்ந்தெடுங்கள்',
  "Pick one by {time}. It's accepted as soon as you pick it.":
    '{time}-க்குள் ஒன்றைத் தேர்ந்தெடுங்கள். தேர்ந்தெடுத்தவுடன் ஏற்கப்படும்.',
  'Book {time}': '{time}-ஐ புக் செய்யுங்கள்',
  'The times {name} suggested have all been taken. You can cancel for a full refund, or use Help with this booking.':
    '{name} பரிந்துரைத்த நேரங்கள் அனைத்தும் புக் ஆகிவிட்டன. முழுப் பணத்தையும் திரும்பப் பெற ரத்து செய்யலாம், அல்லது "இந்த புக்கிங்கிற்கான உதவி"-ஐப் பயன்படுத்தலாம்.',
  'Cancel this booking? Your payment will be refunded in full to your original payment method.':
    'இந்த புக்கிங்கை ரத்து செய்யவா? உங்கள் பணம் முழுவதுமாக நீங்கள் செலுத்திய முறைக்கே திருப்பித் தரப்படும்.',
  'Cancel this booking? Nothing was paid, so there is nothing to refund.':
    'இந்த புக்கிங்கை ரத்து செய்யவா? எதுவும் செலுத்தப்படவில்லை, அதனால் திருப்பித் தர எதுவும் இல்லை.',
  // components/booking/review-card.tsx
  'How was {name}?': '{name} எப்படி இருந்தது?',
  'Your rating': 'உங்கள் ரேட்டிங்',
  '{rating} of 5': '5-இல் {rating}',
  'What stood out? (optional)': 'எது சிறப்பாக இருந்தது? (விருப்பம்)',
  'Tell others more (optional)':
    'மற்றவர்களுக்கு மேலும் சொல்லுங்கள் (விருப்பம்)',
  'Posting…': 'பதிவிடுகிறது…',
  'Post review': 'மதிப்பாய்வைப் பதிவிடுங்கள்',
  '{count} star': '{count} நட்சத்திரம்',
  '{count} stars': '{count} நட்சத்திரங்கள்',
  // components/rewards/invite-card.tsx
  'Book your car wash on Detlio and get {amount} off your first booking: {url}':
    'Detlio-வில் உங்கள் கார் வாஷை புக் செய்து, முதல் புக்கிங்கில் {amount} தள்ளுபடி பெறுங்கள்: {url}',
  'You both get {amount} off when their first booking of {min} or more is done.':
    'அவர்களின் {min} அல்லது அதற்கு மேலான முதல் புக்கிங் முடிந்ததும் உங்கள் இருவருக்கும் {amount} தள்ளுபடி.',
  '{count} rewarded this year (up to {max}; {left} left)':
    'இந்த ஆண்டு {count} பேருக்கு ரிவார்டு ({max} வரை; {left} மீதம்)',
  '{count} waiting for a first booking':
    '{count} பேர் முதல் புக்கிங்கிற்காகக் காத்திருக்கிறார்கள்',
  'For people new to Detlio only.': 'Detlio-க்குப் புதியவர்களுக்கு மட்டும்.',
  // components/rewards/badge-celebration.tsx
  'Next badge ({count} more)': 'அடுத்த பேட்ஜ் (இன்னும் {count})',
  // components/rewards/scratch-card.tsx
  'Scratch by {day}': '{day}-க்குள் ஸ்கிராட்ச் செய்யுங்கள்',
  'In your rewards. Use by {day}':
    'உங்கள் ரிவார்டுகளில் உள்ளது. {day}-க்குள் பயன்படுத்துங்கள்',
  "Added to your Shine Card, and it's full: {amount} off is ready.":
    'உங்கள் Shine Card-இல் சேர்க்கப்பட்டது, அது நிரம்பிவிட்டது: {amount} தள்ளுபடி தயார்.',
  // components/rewards/birthday-form.tsx
  'From {level}, a wash on us in your birthday month. Only the day and month.':
    '{level} லெவலிலிருந்து, உங்கள் பிறந்த மாதத்தில் ஒரு வாஷ் எங்கள் செலவில். நாளும் மாதமும் மட்டும்.',
  'Your birthday, for birthday treats. Only the day and month.':
    'பிறந்தநாள் சிறப்புகளுக்காக உங்கள் பிறந்தநாள். நாளும் மாதமும் மட்டும்.',
  // components/rewards/badge-cabinet.tsx
  Badges: 'பேட்ஜ்கள்',
  '{count} of {total} earned': '{total}-இல் {count} கிடைத்தன',
  'Earned {day}': '{day} அன்று கிடைத்தது',
  '{bonus} on your Shine Card.': 'உங்கள் Shine Card-இல் {bonus}.',
  '{bonus} on your Shine Card when you earn it.':
    'இதைப் பெறும்போது உங்கள் Shine Card-இல் {bonus}.',
  // components/guarantee/guarantee-card.tsx
  'Free redo': 'இலவச ரீடூ',
  'Ask with photos of the problem by {time}.':
    '{time}-க்குள் பிரச்சனையின் போட்டோக்களுடன் கேளுங்கள்.',
  // components/checkout/when-picker.tsx
  'When?': 'எப்போது?',
  'No times left on this day. {notice} Pick another day.':
    'இந்த நாளில் நேரங்கள் மீதம் இல்லை. {notice} வேறு நாளைத் தேர்ந்தெடுங்கள்.',
  // components/checkout/continue-booking.tsx
  'Continue your booking at {name}': '{name}-இல் உங்கள் புக்கிங்கைத் தொடரவும்',
  // components/checkout/sign-in.tsx
  'Send code in {time}': '{time}-இல் கோட் அனுப்பலாம்',
  'Resend in {time}': '{time}-இல் மீண்டும் அனுப்பலாம்',
  'New to Detlio? Your account is made when you verify. By continuing you agree to our {terms}; our {privacy} explains how we use your data.':
    'Detlio-க்குப் புதியவரா? சரிபார்த்ததும் உங்கள் கணக்கு உருவாகும். தொடர்வதன் மூலம் எங்கள் {terms}-ஐ ஏற்கிறீர்கள்; உங்கள் தகவலை எப்படிப் பயன்படுத்துகிறோம் என்பதை எங்கள் {privacy} விளக்குகிறது.',
  // components/checkout/payment-received-panel.tsx
  'Payment ID {id}.': 'பேமெண்ட் ID {id}.',
  "We've received your payment (ID {id}). We're confirming it against your bill — it shows here as paid in a minute, or WhatsApp us with this payment ID.":
    'உங்கள் பேமெண்ட் கிடைத்தது (ID {id}). உங்கள் பில்லுடன் உறுதிசெய்கிறோம் — ஒரு நிமிடத்தில் இங்கே செலுத்தப்பட்டதாகத் தெரியும், அல்லது இந்த பேமெண்ட் ID-யுடன் எங்களுக்கு WhatsApp செய்யுங்கள்.',
  "We've received your payment (ID {id}). We're confirming your booking — check My bookings in a minute, or WhatsApp us with this payment ID.":
    'உங்கள் பேமெண்ட் கிடைத்தது (ID {id}). உங்கள் புக்கிங்கை உறுதிசெய்கிறோம் — ஒரு நிமிடத்தில் "என் புக்கிங்குகள்"-ஐப் பாருங்கள், அல்லது இந்த பேமெண்ட் ID-யுடன் எங்களுக்கு WhatsApp செய்யுங்கள்.',
  // components/checkout/add-address-sheet.tsx
  Office: 'அலுவலகம்',
  // components/coupons/coupon-scanner.tsx
  'Camera access is off for Detlio. Allow it in your phone’s settings, or type the code instead.':
    'Detlio-வுக்கு கேமரா அனுமதி ஆஃப். உங்கள் போன் அமைப்புகளில் அனுமதியுங்கள், அல்லது அதற்குப் பதிலாக கோடை டைப் செய்யுங்கள்.',
  // components/coupons/coupon-ticket.tsx
  off: 'தள்ளுபடி',
  FREE: 'இலவசம்',
  'car wash': 'கார் வாஷ்',
  stamp: 'ஸ்டாம்ப்',
  stamps: 'ஸ்டாம்ப்கள்',
  // components/service-media/service-media-area.tsx
  'Play the video of {name}': '{name}-இன் வீடியோவை இயக்கவும்',
  'Photo {number} of {name}': '{name}-இன் போட்டோ {number}',
  'Open photo {number} of {name}': '{name}-இன் போட்டோ {number}-ஐத் திறக்கவும்',
  // components/gifts/gift-share.tsx
  'Your {amount} gift for {name} is ready':
    '{name}-க்கான உங்கள் {amount} பரிசு தயார்',
  'Send them this link. Whoever opens it can add the gift to their Detlio credit, so send it only to {name}.':
    'இந்த லிங்க்கை அவர்களுக்கு அனுப்புங்கள். இதைத் திறக்கும் எவரும் பரிசைத் தங்கள் Detlio கிரெடிட்டில் சேர்க்கலாம், அதனால் {name}-க்கு மட்டும் அனுப்புங்கள்.',
  'The gift can be used until {day}.': 'இந்தப் பரிசை {day} வரை பயன்படுத்தலாம்.',
  // components/premium-card/share-card-image.tsx
  'Show “{name}” on the picture': 'படத்தில் “{name}” என்று காட்டவும்',
  // components/premium-card/premium-card.tsx
  'Book on detlio.com  ↗': 'detlio.com-இல் புக் செய்யுங்கள்  ↗',
  // components/slot-alerts/garage-slot-alerts.tsx
  'Stop waiting for {when}': '{when}-க்குக் காத்திருப்பதை நிறுத்தவும்',
  // components/slot-alerts/slot-alert-ask.tsx
  'Waiting for a slot on {when}':
    '{when} அன்று ஸ்லாட்டுக்காகக் காத்திருக்கிறது',
  "If one opens it shows in Updates, and as a notification if they're on. It isn't held for you.":
    'ஒன்று காலியானால் அப்டேட்களில் தெரியும், அறிவிப்புகள் ஆன் என்றால் அறிவிப்பாகவும் வரும். அது உங்களுக்காக ஒதுக்கப்படாது.',
  'None of these suit you?': 'இவை எதுவும் உங்களுக்குச் சரிவரவில்லையா?',
  // components/app-lock-screen.tsx
  'Detlio is locked on this phone.': 'இந்த போனில் Detlio பூட்டப்பட்டுள்ளது.',
  // components/garage/service-cards.tsx
  'for your {carModel}': 'உங்கள் {carModel}-க்கு',
  'Save {amount}': '{amount} சேமியுங்கள்',
  '+{count} more': '+{count} மேலும்',
  'Save {amount} vs {total} separately':
    'தனித்தனியாக {total}-க்குப் பதிலாக {amount} சேமியுங்கள்',
  'save {amount}': '{amount} சேமிப்பு',
  // components/garage/next-free-row.tsx
  'Book {name}, {day} at {time}': '{name}-ஐ புக் செய்யுங்கள், {day} {time}',
  // components/garage/garage-list.tsx
  'See prices': 'விலைகளைப் பாருங்கள்',
  '{action} from {name}': '{name}-இடம் {action}',
  garages: 'கேரேஜ்கள்',
  'Try {mode}': '{mode} முயற்சிக்கவும்',
  // components/garage/reviews-tab.tsx
  "Report {name}'s review": '{name}-இன் மதிப்பாய்வைப் புகாரளிக்கவும்',
  'Booked on Detlio': 'Detlio-வில் புக் செய்தது',
  // components/garage/showroom-card.tsx
  'Known for {what}': '{what}-க்குப் பெயர் பெற்றது',
  'From ₹{price}.': '₹{price} முதல்.',
  'Press and hold for a quick look':
    'விரைவுப் பார்வைக்கு அழுத்திப் பிடியுங்கள்',
  // components/garage/vendor-card.tsx
  'Known for {label}': '{label}-க்குப் பெயர் பெற்றது',
  // components/reach/request-card.tsx
  'They reply by {time}': '{time}-க்குள் பதில் சொல்வார்கள்',
  'Sent · {time}': 'அனுப்பப்பட்டது · {time}',
  "Detlio also calls them if there's no reply in {minutes} min.":
    '{minutes} min-இல் பதில் இல்லையென்றால் Detlio-வும் அவர்களை அழைக்கும்.',
  'Held for you until {time} ({left} left)':
    '{time} வரை உங்களுக்காக ஒதுக்கப்பட்டுள்ளது ({left} மீதம்)',
  'Confirm & pay {amount}': 'உறுதிசெய்து {amount} செலுத்துங்கள்',
  'Visit a garage instead, or get a free wash when we reach your area.':
    'அதற்குப் பதிலாக கேரேஜுக்குச் செல்லுங்கள், அல்லது நாங்கள் உங்கள் பகுதிக்கு வரும்போது இலவச வாஷ் பெறுங்கள்.',
  // components/reach/request-sheet.tsx
  'Waiting for {name}. They reply by {time}, or we ask the next garage. Nothing to pay yet.':
    '{name}-க்காகக் காத்திருக்கிறோம். {time}-க்குள் பதில் சொல்வார்கள், இல்லையென்றால் அடுத்த கேரேஜிடம் கேட்போம். இப்போது செலுத்த எதுவும் இல்லை.',
  'covers {km} km, {outside} km outside':
    '{km} km வரை வருவார்கள், {outside} km வெளியே',
  '{outside} km outside': '{outside} km வெளியே',
  '{action}: free to ask, no payment until they say yes.':
    '{action}: கேட்பது இலவசம், அவர்கள் சம்மதிக்கும் வரை பணம் இல்லை.',
  // components/reach/free-wash.tsx
  'No garage in your area yet': 'உங்கள் பகுதியில் இன்னும் கேரேஜ் இல்லை',
  'Be told when we reach {area}':
    'நாங்கள் {area}-க்கு வரும்போது தெரிந்துகொள்ளுங்கள்',
  "The {count} free washes for {area} are taken. We'll still tell you the day we open.":
    '{area}-க்கான {count} இலவச வாஷ்களும் தீர்ந்துவிட்டன. நாங்கள் தொடங்கும் நாளில் இன்னும் உங்களுக்குச் சொல்வோம்.',
  "Up to ₹{amount}, the day Detlio opens in {area}, for {days} days. Saved to your account; we'll tell you.":
    '₹{amount} வரை, {area}-இல் Detlio தொடங்கும் நாளிலிருந்து {days} நாட்களுக்கு. உங்கள் கணக்கில் சேமிக்கப்படும்; உங்களுக்குச் சொல்வோம்.',
  '₹{amount} Detlio credit if they join and you book them (up to ₹{max}).':
    'அவர்கள் சேர்ந்து, நீங்கள் அவர்களிடம் புக் செய்தால் ₹{amount} Detlio கிரெடிட் (₹{max} வரை).',
  // components/reach/reach-status.tsx
  'Up to ₹{amount} off a car wash in {area} · use by {day}':
    '{area}-இல் கார் வாஷுக்கு ₹{amount} வரை தள்ளுபடி · {day}-க்குள் பயன்படுத்துங்கள்',
  'Free wash saved ·': 'இலவச வாஷ் சேமிக்கப்பட்டது ·',
  'Leave the list for {area}': '{area}-க்கான பட்டியலிலிருந்து விலகவும்',
  'You left the list for {area}': '{area}-க்கான பட்டியலிலிருந்து விலகினீர்கள்',
  'Leave the list for {area}?': '{area}-க்கான பட்டியலிலிருந்து விலகவா?',
  'Detlio is now in {area}': 'Detlio இப்போது {area}-இல்',
  '{name} · waiting · {time} left': '{name} · காத்திருக்கிறது · {time} மீதம்',
  // components/payment-recovery.tsx
  'Your payment went through. The booking is with the garage.':
    'உங்கள் பேமெண்ட் வெற்றிகரமாகச் சென்றது. புக்கிங் கேரேஜிடம் உள்ளது.',
  'Your payment': 'உங்கள் பேமெண்ட்',
  // lib/price.ts
  '{amount} inspection': '{amount} இன்ஸ்பெக்ஷன்',
  // lib/gifts.ts
  '{name}, here is a {amount} Detlio gift for you. Open the link to add it to your Detlio credit and book a car wash: {url}':
    '{name}, உங்களுக்காக {amount} Detlio பரிசு. இதை உங்கள் Detlio கிரெடிட்டில் சேர்த்து கார் வாஷ் புக் செய்ய லிங்க்கைத் திறக்கவும்: {url}',
  // lib/push-device.ts
  'Notifications are on for this phone': 'இந்த போனுக்கு அறிவிப்புகள் ஆன்',
  "This build of the app can't get notifications.":
    'ஆப்பின் இந்த பில்டில் அறிவிப்புகள் வராது.',
  'Notifications are blocked for this app in the phone’s settings.':
    'போன் அமைப்புகளில் இந்த ஆப்புக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன.',
  'Notifications are off for this phone': 'இந்த போனுக்கு அறிவிப்புகள் ஆஃப்',
  // lib/checkout.ts
  'Payment failed. If money left your account it will be refunded.':
    'பேமெண்ட் தோல்வியடைந்தது. உங்கள் கணக்கிலிருந்து பணம் போயிருந்தால், திருப்பித் தரப்படும்.',
  'Test payment': 'டெஸ்ட் பேமெண்ட்',
  Fail: 'தோல்வி',
  'Your bank declined this payment. Nothing was charged.':
    'உங்கள் வங்கி இந்த பேமெண்ட்டை மறுத்துவிட்டது. எந்தப் பணமும் எடுக்கப்படவில்லை.',
  'Leave open': 'திறந்தே விடவும்',
  // lib/pending-payment.ts
  "Your gift didn't go through": 'உங்கள் பரிசு வெற்றிகரமாகச் செல்லவில்லை',
  "Your payment couldn't be used": 'உங்கள் பேமெண்ட்டைப் பயன்படுத்த முடியவில்லை',
  "Your payment didn't make a booking":
    'உங்கள் பேமெண்ட்டால் புக்கிங் உருவாகவில்லை',
  'This gift was cancelled. If you paid, the money comes back to you.':
    'இந்தப் பரிசு ரத்து செய்யப்பட்டது. நீங்கள் செலுத்தியிருந்தால், பணம் உங்களுக்குத் திரும்ப வரும்.',
  // lib/premium-card.ts
  'A gift for you': 'உங்களுக்கு ஒரு பரிசு',
  'Happy birthday': 'பிறந்தநாள் வாழ்த்துகள்',
  'Happy Diwali': 'தீபாவளி வாழ்த்துகள்',
  'Gift card': 'பரிசுக் கார்டு',
  'For {name}': '{name}-க்கு',
  'Valid {count} months': '{count} மாதங்கள் செல்லும்',
  '{amount} of car care': '{amount} கார் பராமரிப்பு',
  'Car care, gifted': 'பரிசாக கார் பராமரிப்பு',
  'Bonus star': 'போனஸ் நட்சத்திரம்',
  'On your Shine Card': 'உங்கள் Shine Card-இல்',
  Jackpot: 'ஜாக்பாட்',
  'Off your next booking': 'அடுத்த புக்கிங்கில் தள்ளுபடி',
  'Up to {amount}': '{amount} வரை',
  Story: 'ஸ்டோரி',
  Post: 'போஸ்ட்',
  // lib/booking-status.ts
  'Garage answers by {time} today': 'கேரேஜ் இன்று {time}-க்குள் பதில் சொல்லும்',
  'Garage answers by {time} tomorrow':
    'கேரேஜ் நாளை {time}-க்குள் பதில் சொல்லும்',
  'Garage answers by {time} on {day}':
    'கேரேஜ் {day} அன்று {time}-க்குள் பதில் சொல்லும்',
  // lib/coupon-lines.ts
  'This coupon expired on {day}.': 'இந்தக் கூப்பன் {day} அன்று காலாவதியானது.',
  'This coupon can be added from {day}.':
    'இந்தக் கூப்பனை {day} முதல் சேர்க்கலாம்.',
  '{useBy}. It comes off at checkout.': '{useBy}. செக்அவுட்டில் கழிக்கப்படும்.',
  'Expired on {day}.': '{day} அன்று காலாவதியானது.',
  // lib/booking-detail.ts
  'Our team will refund your payment to your original payment method within {days}.':
    'எங்கள் டீம் {days}-க்குள் நீங்கள் செலுத்திய முறைக்கே உங்கள் பணத்தைத் திருப்பித் தரும்.',
  '{amount} goes back to your Detlio credit.':
    '{amount} உங்கள் Detlio கிரெடிட்டுக்குத் திரும்பும்.',
  'Our team will refund the {amount} you paid online to your original payment method within {days}.':
    'நீங்கள் ஆன்லைனில் செலுத்திய {amount}-ஐ எங்கள் டீம் {days}-க்குள் நீங்கள் செலுத்திய முறைக்கே திருப்பித் தரும்.',
  "{name} couldn't do your time and suggested others, so this booking was cancelled.":
    'உங்கள் நேரம் {name}-க்கு முடியவில்லை, வேறு நேரங்களைப் பரிந்துரைத்தது, அதனால் இந்த புக்கிங் ரத்து செய்யப்பட்டது.',
  '{name} accepted this booking, then had to cancel it. Sorry about that.':
    '{name} இந்த புக்கிங்கை ஏற்று, பிறகு ரத்து செய்ய வேண்டியதாயிற்று. அதற்கு வருந்துகிறோம்.',
}
