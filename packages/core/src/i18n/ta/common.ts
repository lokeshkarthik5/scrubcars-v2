/**
 * Tamil for words every app shares: the glossary's words, packages/ui,
 * packages/native-ui and core's helpers. Keyed by the exact English, so the
 * English never changes; a key with no entry shows in English.
 *
 * Everyday Chennai Tamil, as a car owner or a garage hand says it: the
 * car-care words people use in English stay English in Tamil script
 * (சர்வீஸ், வாஷ், கேரேஜ்), the actions are Tamil, and the customer is asked
 * politely (-ங்கள்). The word list is ../GLOSSARY.md: use it, and add to it.
 */
export const common: Readonly<Record<string, string>> = {
  // ─── The glossary's words ──────────────────────────────────────────────
  Booking: 'புக்கிங்',
  Bookings: 'புக்கிங்குகள்',
  'Book now': 'புக் செய்யுங்கள்',
  Garage: 'கேரேஜ்',
  Garages: 'கேரேஜ்கள்',
  Service: 'சர்வீஸ்',
  Services: 'சர்வீஸ்கள்',
  Wash: 'வாஷ்',
  Car: 'கார்',
  Doorstep: 'வீட்டில்',
  'Pickup & drop': 'பிக்கப் & டிராப்',
  'At garage': 'கேரேஜில்',
  'Drop-in': 'கேரேஜில்',
  'Pay {amount}': '{amount} செலுத்துங்கள்',
  Accept: 'ஏற்கவும்',
  Decline: 'மறுக்கவும்',
  Cancel: 'ரத்து செய்யவும்',
  Reschedule: 'நேரத்தை மாற்றவும்',
  Today: 'இன்று',
  Tomorrow: 'நாளை',
  Price: 'விலை',
  Total: 'மொத்தம்',
  Refund: 'பணத்தைத் திருப்பித் தருதல்',
  Review: 'மதிப்பாய்வு',
  Reviews: 'மதிப்பாய்வுகள்',
  Help: 'உதவி',
  Profile: 'சுயவிவரம்',
  Settings: 'அமைப்புகள்',
  'Sign in': 'உள்நுழையவும்',
  'Sign out': 'வெளியேறவும்',
  Login: 'உள்நுழையவும்',
  'Log in': 'உள்நுழையவும்',
  'Log out': 'வெளியேறவும்',
  Logout: 'வெளியேறவும்',
  Save: 'சேமிக்கவும்',
  Done: 'முடிந்தது',
  'Near you': 'உங்கள் அருகில்',
  Earnings: 'வருமானம்',
  Customer: 'வாடிக்கையாளர்',
  Home: 'முகப்பு',
  Close: 'மூடவும்',
  'Go back': 'பின்செல்லவும்',
  // One word for both: the button, and a photo's angle (the car's back).
  Back: 'பின்',
  Next: 'அடுத்து',
  Continue: 'தொடரவும்',
  'Try again': 'மீண்டும் முயற்சிக்கவும்',
  Retry: 'மீண்டும் முயற்சிக்கவும்',
  Loading: 'ஏற்றுகிறது',
  'Loading…': 'ஏற்றுகிறது…',
  'Loading...': 'ஏற்றுகிறது...',
  Edit: 'திருத்தவும்',
  Remove: 'நீக்கவும்',
  Delete: 'நீக்கவும்',
  Add: 'சேர்க்கவும்',
  Search: 'தேடவும்',
  Undo: 'திரும்ப மாற்றவும்',
  Confirm: 'உறுதிசெய்யவும்',
  Yes: 'ஆம்',
  No: 'இல்லை',
  'Keep it': 'அப்படியே இருக்கட்டும்',
  'Something went wrong': 'ஏதோ தவறு நடந்துவிட்டது',
  '{count} garage': '{count} கேரேஜ்',
  '{count} garages': '{count} கேரேஜ்கள்',
  '{count} package': '{count} பேக்கேஜ்',
  '{count} packages': '{count} பேக்கேஜ்கள்',
  '{count} service': '{count} சர்வீஸ்',

  // ─── Language ───────────────────────────────────────────────────────────
  // "(Language)" stays beside it, so someone who switched by mistake finds the way back.
  Language: 'மொழி (Language)',

  // ─── packages/ui: shared parts ─────────────────────────────────────────
  'Type {word} to confirm': 'உறுதிசெய்ய {word} என டைப் செய்யுங்கள்',
  'Verification code': 'சரிபார்ப்புக் கோட்',
  'Digit {n} of {length}': '{length} இல் {n}-வது எண்',
  'Loading more…': 'மேலும் ஏற்றுகிறது…',
  'Phone number': 'போன் நம்பர்',
  "Couldn't load {what}.": '{what} ஏற்ற முடியவில்லை.',
  "Couldn't load.": 'ஏற்ற முடியவில்லை.',
  'Retrying…': 'மீண்டும் முயற்சிக்கிறது…',
  'Add-on': 'ஆட்-ஆன்',
  'Need help?': 'உதவி வேண்டுமா?',
  'Reach our team at {phone}': 'எங்கள் குழுவை {phone} இல் தொடர்புகொள்ளுங்கள்',
  'Detlio support': 'Detlio சப்போர்ட்',
  Active: 'செயலில்',
  Pending: 'நிலுவையில்',
  Suspended: 'நிறுத்தி வைக்கப்பட்டது',
  Archived: 'காப்பகத்தில்',
  New: 'புதியது',
  Confirmed: 'உறுதியானது',
  'In progress': 'நடக்கிறது',
  Completed: 'முடிந்தது',
  Cancelled: 'ரத்தானது',
  Rescheduled: 'நேரம் மாற்றப்பட்டது',
  Requested: 'கோரப்பட்டது',
  'Before and after': 'முன்பும் பின்பும்',
  'Before, {angle}': 'முன்பு, {angle}',
  'After, {angle}': 'பின்பு, {angle}',
  Before: 'முன்பு',
  After: 'பின்பு',
  'Slide between before and after, {angle}':
    'முன்பு மற்றும் பின்பு இடையே நகர்த்துங்கள், {angle}',
  '{percent}% before': '{percent}% முன்பு',
  Angle: 'கோணம்',
  garage: 'கேரேஜ்',
  'What this means': 'இதன் அர்த்தம்',
  '{name}: what this means': '{name}: இதன் அர்த்தம்',
  'Detlio shows this medal on a garage that:':
    'இந்தத் தகுதிகள் உள்ள கேரேஜுக்கு Detlio இந்தப் பதக்கத்தைக் காட்டுகிறது:',
  '{tier} standards': '{tier} தரநிலைகள்',
  'View {photo}': '{photo} பார்க்கவும்',
  "Customer's photos of the problem":
    'பிரச்சனை பற்றி வாடிக்கையாளர் எடுத்த போட்டோக்கள்',
  "Garage's before and after photos":
    'கேரேஜ் எடுத்த முன்பு, பின்பு போட்டோக்கள்',
  'problem photo {n}': 'பிரச்சனை போட்டோ {n}',
  'Problem photo {n}': 'பிரச்சனை போட்டோ {n}',
  'The garage took no photos of this job.':
    'இந்த வேலைக்கு கேரேஜ் போட்டோ எதுவும் எடுக்கவில்லை.',
  'Compare before and after': 'முன்பும் பின்பும் ஒப்பிடுங்கள்',
  'before — {angle}': 'முன்பு — {angle}',
  'after — {angle}': 'பின்பு — {angle}',
  'No before photos from the garage.':
    'கேரேஜிடமிருந்து "முன்பு" போட்டோக்கள் இல்லை.',
  'No after photos from the garage.':
    'கேரேஜிடமிருந்து "பின்பு" போட்டோக்கள் இல்லை.',
  'Close photo': 'போட்டோவை மூடவும்',
  'Call {who}': '{who}-ஐ அழைக்கவும்',
  Call: 'அழைக்கவும்',
  'WhatsApp {who}': '{who}-க்கு WhatsApp செய்யவும்',
  '{count} hour': '{count} மணிநேரம்',
  '{count} hours': '{count} மணிநேரம்',
  '{count} minute': '{count} நிமிடம்',
  '{count} minutes': '{count} நிமிடங்கள்',
  '{verb} by {time}': '{time}-க்குள் {verb}',
  '{time} left {action}': '{action} இன்னும் {time} உள்ளது',
  'to answer': 'பதிலளிக்க',
  Answer: 'பதிலளிக்கவும்',
  Missed: 'தவறவிட்டது',
  'Failed to send OTP': 'OTP அனுப்ப முடியவில்லை',
  'Welcome to Detlio': 'Detlio-க்கு வரவேற்கிறோம்',
  'Log in or sign up with your mobile number.':
    'உங்கள் மொபைல் நம்பருடன் உள்நுழையுங்கள் அல்லது பதிவு செய்யுங்கள்.',
  'Sending...': 'அனுப்புகிறது...',
  'Send OTP in {time}': '{time}-ல் OTP அனுப்பவும்',
  'Send OTP': 'OTP அனுப்பவும்',
  'New to Detlio? Your account is created when you verify your number.':
    'Detlio-க்கு புதியவரா? உங்கள் நம்பரைச் சரிபார்த்ததும் உங்கள் கணக்கு உருவாகிவிடும்.',
  'By continuing, you agree to our {terms}.':
    'தொடர்வதன் மூலம், எங்கள் {terms}-ஐ ஏற்கிறீர்கள்.',
  Terms: 'விதிமுறைகள்',
  'Our {privacy} explains how we use your data.':
    'உங்கள் தகவலை நாங்கள் எப்படிப் பயன்படுத்துகிறோம் என்பதை எங்கள் {privacy} விளக்குகிறது.',
  'Privacy Policy': 'தனியுரிமைக் கொள்கை',
  'How we use your data is set out in our':
    'உங்கள் தகவலை நாங்கள் எப்படிப் பயன்படுத்துகிறோம் என்பது இதில் உள்ளது:',
  'Verification failed': 'சரிபார்ப்பு தோல்வியடைந்தது',
  'Failed to resend OTP': 'OTP-ஐ மீண்டும் அனுப்ப முடியவில்லை',
  'Verify your number': 'உங்கள் நம்பரைச் சரிபார்க்கவும்',
  'Enter the 6-digit code sent to':
    'இந்த நம்பருக்கு அனுப்பிய 6 இலக்க கோட் உள்ளிடுங்கள்',
  'Code expires in {time}': 'கோட் {time}-ல் காலாவதியாகும்',
  'Code expired — resend': 'கோட் காலாவதியானது — மீண்டும் அனுப்புங்கள்',
  'Resend OTP in {time}': '{time}-ல் OTP-ஐ மீண்டும் அனுப்பலாம்',
  'Resend OTP': 'OTP-ஐ மீண்டும் அனுப்பவும்',
  'Verifying...': 'சரிபார்க்கிறது...',
  Verify: 'சரிபார்க்கவும்',
  'Nearest First': 'அருகில் உள்ளவை முதலில்',
  Relevance: 'பொருத்தம்',
  'Top Rated': 'அதிக ரேட்டிங்',
  'Cost: Low to High': 'விலை: குறைவு முதல் அதிகம்',
  'Cost: High to Low': 'விலை: அதிகம் முதல் குறைவு',
  'Sort by': 'வரிசைப்படுத்து',
  'Turn on location to use this': 'இதைப் பயன்படுத்த லொக்கேஷனை ஆன் செய்யுங்கள்',
  'Sent to the garage': 'கேரேஜுக்கு அனுப்பப்பட்டது',
  'Waiting for garage': 'கேரேஜின் பதிலுக்காக',
  Accepted: 'ஏற்கப்பட்டது',
  'Your slot is reserved': 'உங்கள் ஸ்லாட் உறுதியாகிவிட்டது',
  'Shows here as soon as the garage accepts': 'கேரேஜ் ஏற்றவுடன் இங்கே தெரியும்',
  'The garage accepts your slot': 'கேரேஜ் உங்கள் ஸ்லாட்டை ஏற்கும்',
  'Work started on your car': 'உங்கள் காரில் வேலை தொடங்கியது',
  'Work has started on your car': 'உங்கள் காரில் வேலை தொடங்கிவிட்டது',
  'Starts at your booked time': 'நீங்கள் புக் செய்த நேரத்தில் தொடங்கும்',
  'Your car is ready': 'உங்கள் கார் தயார்',
  'Marked here when the work is done': 'வேலை முடிந்ததும் இங்கே குறிக்கப்படும்',
  'Booking progress': 'புக்கிங் நிலை',
  'Reference {reference}': 'குறிப்பு எண் {reference}',
  '{name} logo': '{name} லோகோ',
  'From {price}': '{price} முதல்',
  'Offers {service}': '{service} வழங்குகிறது',
  '{label}: {quiet} garages only': '{label}: {quiet} கேரேஜ்கள் மட்டும்',
  'Rate {count} star': '{count} நட்சத்திரம் கொடுங்கள்',
  'Rate {count} stars': '{count} நட்சத்திரங்கள் கொடுங்கள்',
  Admin: 'அட்மின்',
  Operator: 'ஆப்பரேட்டர்',
  Owner: 'உரிமையாளர்',
  Member: 'உறுப்பினர்',
  'Close popup': 'பாப்-அப்பை மூடவும்',
  'Zoom in': 'பெரிதாக்கவும்',
  'Zoom out': 'சிறிதாக்கவும்',
  'Find my location': 'என் இடத்தைக் கண்டறியவும்',
  'Toggle fullscreen': 'முழுத்திரை ஆன்/ஆஃப்',
  'Reset bearing to north': 'வடக்கு நோக்கி மீட்டமைக்கவும்',
  'Car added': 'கார் சேர்க்கப்பட்டது',
  'Failed to add car': 'காரைச் சேர்க்க முடியவில்லை',
  'Add a car': 'கார் சேர்க்கவும்',
  Make: 'நிறுவனம்',
  'e.g. Maruti': 'எ.கா. Maruti',
  Model: 'மாடல்',
  'e.g. Swift': 'எ.கா. Swift',
  'License plate (optional)': 'நம்பர் பிளேட் (விருப்பத்தேர்வு)',
  'e.g. TN 01 AB 1234': 'எ.கா. TN 01 AB 1234',
  Type: 'வகை',
  'Pricing can differ by car type.': 'கார் வகையைப் பொறுத்து விலை மாறலாம்.',
  'Saving…': 'சேமிக்கிறது…',
  'Saving...': 'சேமிக்கிறது...',
  'Save car': 'காரைச் சேமிக்கவும்',
  'Real distances': 'உண்மையான தூரம்',
  'See how far each garage actually is, not just its area.':
    'ஒவ்வொரு கேரேஜும் உண்மையில் எவ்வளவு தூரம் என்று பாருங்கள், பகுதி மட்டும் அல்ல.',
  'Nearest first': 'அருகில் உள்ளவை முதலில்',
  'Sort by what is closest instead of scrolling to find it.':
    'தேடி ஸ்க்ரோல் செய்யாமல், அருகில் உள்ளதை முதலில் பாருங்கள்.',
  'Doorstep that reaches you': 'உங்கள் வீட்டுக்கே வரும் சர்வீஸ்',
  'Only show garages that travel to your address.':
    'உங்கள் முகவரிக்கு வரும் கேரேஜ்களை மட்டும் காட்டும்.',
  'Enable location': 'லொக்கேஷனை ஆன் செய்யவும்',
  'Location is blocked': 'லொக்கேஷன் தடுக்கப்பட்டுள்ளது',
  'Find garages near you': 'உங்கள் அருகில் உள்ள கேரேஜ்களைக் கண்டறியுங்கள்',
  'Your browser is blocking location for this site. You can turn it back on in the address bar, under site settings.':
    'உங்கள் பிரவுசர் இந்தத் தளத்துக்கு லொக்கேஷனைத் தடுக்கிறது. அட்ரஸ் பாரில் உள்ள site settings-ல் மீண்டும் ஆன் செய்யலாம்.',
  'Share your location and we’ll show the closest garages first, with real distances.':
    'உங்கள் லொக்கேஷனைப் பகிருங்கள், அருகில் உள்ள கேரேஜ்களை உண்மையான தூரத்துடன் முதலில் காட்டுவோம்.',
  'Finding you…': 'உங்கள் இடத்தைக் கண்டறிகிறது…',
  'All of Chennai': 'சென்னை முழுவதும்',
  'Not now': 'இப்போது வேண்டாம்',
  'Enable location asks your browser. We only use it to sort garages — it is never shared.':
    'லொக்கேஷனை ஆன் செய்தால் உங்கள் பிரவுசர் அனுமதி கேட்கும். கேரேஜ்களை வரிசைப்படுத்த மட்டுமே பயன்படுத்துவோம் — யாருடனும் பகிர மாட்டோம்.',
  'That looks like a Google place-share link, which carries no location. We placed the pin from its address — check it before saving.':
    'இது Google place-share லிங்க் போலத் தெரிகிறது, இதில் லொக்கேஷன் இல்லை. அதன் முகவரியை வைத்துப் பின்னை வைத்தோம் — சேமிக்கும் முன் சரிபாருங்கள்.',
  'That was a directions link, so we used its destination. Check the pin before saving.':
    'இது ஒரு directions லிங்க், அதனால் அதன் சேருமிடத்தைப் பயன்படுத்தினோம். சேமிக்கும் முன் பின்னைச் சரிபாருங்கள்.',
  'Could not read a location from that link. Search above, or drop the pin by hand.':
    'அந்த லிங்கிலிருந்து லொக்கேஷனைப் படிக்க முடியவில்லை. மேலே தேடுங்கள், அல்லது பின்னை நீங்களே வையுங்கள்.',
  'Could not open that link. Search above, or drop the pin by hand.':
    'அந்த லிங்கைத் திறக்க முடியவில்லை. மேலே தேடுங்கள், அல்லது பின்னை நீங்களே வையுங்கள்.',
  'Could not look up that address — you can type it below.':
    'அந்த முகவரியைக் கண்டறிய முடியவில்லை — கீழே டைப் செய்யலாம்.',
  'Could not locate that address. Try dropping the pin instead.':
    'அந்த முகவரியைக் கண்டறிய முடியவில்லை. பதிலாகப் பின்னை வைத்துப் பாருங்கள்.',
  'This link points to “{place}”, which does not look like {city}. Check the pin.':
    'இந்த லிங்க் “{place}”-ஐக் காட்டுகிறது, அது {city} போலத் தெரியவில்லை. பின்னைச் சரிபாருங்கள்.',
  'Pin placed from the link’s address — check it before saving.':
    'லிங்கில் உள்ள முகவரியை வைத்துப் பின் வைக்கப்பட்டது — சேமிக்கும் முன் சரிபாருங்கள்.',
  'This browser cannot share your location.':
    'இந்தப் பிரவுசரால் உங்கள் லொக்கேஷனைப் பகிர முடியாது.',
  'Location access was blocked. Search or drop the pin instead.':
    'லொக்கேஷன் அனுமதி தடுக்கப்பட்டது. பதிலாகத் தேடுங்கள் அல்லது பின்னை வையுங்கள்.',
  'Search for area, street or landmark':
    'பகுதி, தெரு அல்லது அடையாளத்தைத் தேடுங்கள்',
  'Looking up this location…': 'இந்த இடத்தைக் கண்டறிகிறது…',
  'Google Maps link or coordinates': 'Google Maps லிங்க் அல்லது coordinates',
  'Paste Google Maps link or 13.0043, 80.2554':
    'Google Maps லிங்க் அல்லது 13.0043, 80.2554 ஒட்டுங்கள்',
  'Locating…': 'கண்டறிகிறது…',
  Use: 'பயன்படுத்தவும்',
  'Use my current location': 'என் தற்போதைய இடத்தைப் பயன்படுத்தவும்',
  'Search above, tap the map, or use your current location. Drag the pin to place it exactly.':
    'மேலே தேடுங்கள், மேப்பில் தட்டுங்கள், அல்லது உங்கள் தற்போதைய இடத்தைப் பயன்படுத்துங்கள். சரியான இடத்துக்குப் பின்னை இழுத்து வையுங்கள்.',
  'Pin is at:': 'பின் உள்ள இடம்:',
  'Notifications are on for this device':
    'இந்தச் சாதனத்தில் அறிவிப்புகள் ஆன் ஆகிவிட்டன',
  "Couldn't turn notifications on. Try again.":
    'அறிவிப்புகளை ஆன் செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Notifications are off for this device':
    'இந்தச் சாதனத்தில் அறிவிப்புகள் ஆஃப் ஆகிவிட்டன',
  "Couldn't turn notifications off. Try again.":
    'அறிவிப்புகளை ஆஃப் செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Turn notifications on first': 'முதலில் அறிவிப்புகளை ஆன் செய்யுங்கள்',
  'Sent. It should show in a few seconds.':
    'அனுப்பப்பட்டது. சில வினாடிகளில் தெரியும்.',
  'This device stopped taking notifications. Turn them on again.':
    'இந்தச் சாதனம் அறிவிப்புகளை ஏற்பதை நிறுத்திவிட்டது. மீண்டும் ஆன் செய்யுங்கள்.',
  "The browser's push service didn't take it. Try again in a minute.":
    'பிரவுசரின் push சேவை இதை ஏற்கவில்லை. ஒரு நிமிடத்தில் மீண்டும் முயற்சிக்கவும்.',
  "Couldn't send a test notification.": 'சோதனை அறிவிப்பை அனுப்ப முடியவில்லை.',
  'On iPhone, add {app} to your Home Screen first':
    'iPhone-ல், முதலில் {app}-ஐ உங்கள் Home Screen-ல் சேர்க்கவும்',
  'In Safari, tap Share, then Add to Home Screen. Open {app} from the new icon and turn notifications on here. Needs iOS 16.4 or later.':
    'Safari-ல் Share, பிறகு Add to Home Screen தட்டுங்கள். புதிய ஐகானிலிருந்து {app}-ஐத் திறந்து இங்கே அறிவிப்புகளை ஆன் செய்யுங்கள். iOS 16.4 அல்லது அதற்குப் பிறகு தேவை.',
  'Notifications are blocked for this site':
    'இந்தத் தளத்துக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன',
  "Allow them in your browser's site settings, then come back to this page.":
    'உங்கள் பிரவுசரின் site settings-ல் அனுமதித்துவிட்டு, இந்தப் பக்கத்துக்குத் திரும்பி வாருங்கள்.',
  "This browser can't show notifications":
    'இந்தப் பிரவுசரால் அறிவிப்புகளைக் காட்ட முடியாது',
  'Try Chrome, Edge, Firefox or Samsung Internet, or Safari from the Home Screen on iPhone.':
    'Chrome, Edge, Firefox அல்லது Samsung Internet பயன்படுத்துங்கள்; iPhone-ல் Home Screen-லிருந்து Safari.',
  "Couldn't load your notification settings":
    'உங்கள் அறிவிப்பு அமைப்புகளை ஏற்ற முடியவில்லை',
  'Check your connection and open this page again.':
    'உங்கள் இணைய இணைப்பைச் சரிபார்த்து இந்தப் பக்கத்தை மீண்டும் திறங்கள்.',
  'Notifications on this device': 'இந்தச் சாதனத்தில் அறிவிப்புகள்',
  'Also on for {count} other device.':
    'மேலும் {count} சாதனத்தில் ஆன் ஆக உள்ளது.',
  'Also on for {count} other devices.':
    'மேலும் {count} சாதனங்களில் ஆன் ஆக உள்ளது.',
  'Send me a test notification': 'எனக்கு ஒரு சோதனை அறிவிப்பு அனுப்பவும்',
  'Coverage area saved': 'சேவைப் பகுதி சேமிக்கப்பட்டது',
  'Coverage area cleared': 'சேவைப் பகுதி அழிக்கப்பட்டது',
  'Could not save the area': 'பகுதியைச் சேமிக்க முடியவில்லை',
  'Tap the map to draw the area you travel to. Until you do, your {km} km radius applies.':
    'நீங்கள் சென்று சர்வீஸ் செய்யும் பகுதியை வரைய மேப்பில் தட்டுங்கள். அதுவரை உங்கள் {km} km சுற்றளவு பொருந்தும்.',
  'Tap the map to draw the area you travel to. Until you do, the default {km} km radius applies.':
    'நீங்கள் சென்று சர்வீஸ் செய்யும் பகுதியை வரைய மேப்பில் தட்டுங்கள். அதுவரை இயல்பான {km} km சுற்றளவு பொருந்தும்.',
  '{count} of 3 corners — an area needs at least three.':
    '3-ல் {count} முனைகள் — ஒரு பகுதிக்குக் குறைந்தது மூன்று தேவை.',
  '{count} corners. Tap to add more, or save.':
    '{count} முனைகள். மேலும் சேர்க்கத் தட்டுங்கள், அல்லது சேமியுங்கள்.',
  'Undo corner': 'கடைசி முனையை நீக்கவும்',
  Clear: 'அழிக்கவும்',
  'Save coverage area': 'சேவைப் பகுதியைச் சேமிக்கவும்',
  'Clear area and use radius': 'பகுதியை அழித்து சுற்றளவைப் பயன்படுத்தவும்',
  'Preview on Home': 'முகப்பில் முன்னோட்டம்',
  'Live as you type': 'டைப் செய்யும்போதே மாறும்',
  '{count} more offer beside it.': 'அருகில் இன்னும் {count} ஆஃபர்.',
  '{count} more offers beside it.': 'அருகில் இன்னும் {count} ஆஃபர்கள்.',
  'Offers on Home': 'முகப்பில் ஆஃபர்கள்',
  'Switch on Show on Home to see the card customers will get.':
    'வாடிக்கையாளர்கள் பார்க்கும் கார்டைப் பார்க்க "முகப்பில் காட்டு"-ஐ ஆன் செய்யுங்கள்.',
  'Your car': 'உங்கள் கார்',
  '{label} · Offer': '{label} · ஆஃபர்',
  'Code {code}': 'கோட் {code}',
  '{title} at {place}': '{place}-ல் {title}',
  'code {code}': 'கோட் {code}',
  'use offer': 'ஆஃபரைப் பயன்படுத்தவும்',
  'Hide offer': 'ஆஃபரை மறைக்கவும்',
  Offers: 'ஆஃபர்கள்',
  'Offer {n} of {count}': '{count}-ல் {n}-வது ஆஃபர்',
  'Use a JPEG, PNG or WebP photo.':
    'JPEG, PNG அல்லது WebP போட்டோவைப் பயன்படுத்துங்கள்.',
  'That photo is over 5 MB. Pick a smaller one.':
    'அந்தப் போட்டோ 5 MB-க்கு மேல் உள்ளது. சிறியதைத் தேர்ந்தெடுங்கள்.',
  'The photo did not upload. Try again.':
    'போட்டோ அப்லோட் ஆகவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'That file is not a video.': 'அந்த ஃபைல் வீடியோ இல்லை.',
  'That file is over 2 GB.': 'அந்த ஃபைல் 2 GB-க்கு மேல் உள்ளது.',
  'The video did not upload. Try again.':
    'வீடியோ அப்லோட் ஆகவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'That did not go. Try again.': 'அது நடக்கவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Photos and video of {service}': '{service} போட்டோக்களும் வீடியோவும்',
  'Photos and video': 'போட்டோக்களும் வீடியோவும்',
  'Up to {photos} photos and {videos} video':
    'அதிகபட்சம் {photos} போட்டோக்கள், {videos} வீடியோ',
  'Up to {photos} photos': 'அதிகபட்சம் {photos} போட்டோக்கள்',
  'Before adding:': 'சேர்க்கும் முன்:',
  'Photo {n} of {service}': '{service} போட்டோ {n}',
  Sample: 'மாதிரி',
  'Remove photo {n} of {service}': '{service} போட்டோ {n}-ஐ நீக்கவும்',
  'Add a photo of {service}': '{service} போட்டோ சேர்க்கவும்',
  'Tick the box above first': 'முதலில் மேலே உள்ள பெட்டியில் டிக் செய்யுங்கள்',
  'Adding…': 'சேர்க்கிறது…',
  'Add photo': 'போட்டோ சேர்க்கவும்',
  'Upload the original file from the phone’s gallery — not a WhatsApp forward — for the sharpest result.':
    'தெளிவான படத்துக்கு, போனின் gallery-லிருந்து அசல் ஃபைலை அப்லோட் செய்யுங்கள் — WhatsApp forward வேண்டாம்.',
  'Photo file for {service}': '{service}-க்கான போட்டோ ஃபைல்',
  'Video file for {service}': '{service}-க்கான வீடியோ ஃபைல்',
  'Add a different video of {service}':
    '{service}-க்கு வேறு வீடியோ சேர்க்கவும்',
  'Checking the video': 'வீடியோவைச் சரிபார்க்கிறது',
  'Uploading, {percent}%': 'அப்லோட் ஆகிறது, {percent}%',
  'Add a video of {service}': '{service} வீடியோ சேர்க்கவும்',
  'Add video': 'வீடியோ சேர்க்கவும்',
  'up to {seconds} sec': 'அதிகபட்சம் {seconds} வினாடி',
  'Video failed': 'வீடியோ தோல்வியடைந்தது',
  'Video of {service}': '{service} வீடியோ',
  'Video processing': 'வீடியோ தயாராகிறது',
  'Checking the video…': 'வீடியோவைச் சரிபார்க்கிறது…',
  'Uploading…': 'அப்லோட் ஆகிறது…',
  'Customers see the earlier video until the new one is ready.':
    'புதியது தயாராகும் வரை வாடிக்கையாளர்கள் பழைய வீடியோவைப் பார்ப்பார்கள்.',
  'Processing…': 'தயாராகிறது…',
  'ready in about a minute': 'சுமார் ஒரு நிமிடத்தில் தயாராகும்',
  Replace: 'மாற்றவும்',
  'Remove video': 'வீடியோவை நீக்கவும்',
  'This video could not be processed — try uploading it again':
    'இந்த வீடியோவைத் தயார் செய்ய முடியவில்லை — மீண்டும் அப்லோட் செய்து பாருங்கள்',
  'Customers still see the earlier video. Remove this one to go back to it.':
    'வாடிக்கையாளர்கள் இன்னும் பழைய வீடியோவையே பார்க்கிறார்கள். அதற்குத் திரும்ப இதை நீக்குங்கள்.',
  Ready: 'தயார்',

  // ─── packages/core: helpers' words ─────────────────────────────────────
  Hatchback: 'ஹேட்ச்பேக்',
  Sedan: 'செடான்',
  'SUV / MUV': 'SUV / MUV',
  'Type "{word}" to confirm.': 'உறுதிசெய்ய "{word}" என டைப் செய்யுங்கள்.',
  "The garage's number shows {hours} hours before your booking.":
    'உங்கள் புக்கிங்குக்கு {hours} மணிநேரம் முன்பு கேரேஜின் நம்பர் தெரியும்.',
  "The garage's number is hidden after your booking.":
    'உங்கள் புக்கிங்குக்குப் பிறகு கேரேஜின் நம்பர் மறைக்கப்படும்.',
  "Customer's number shows {hours} hours before the job.":
    'வேலைக்கு {hours} மணிநேரம் முன்பு வாடிக்கையாளரின் நம்பர் தெரியும்.',
  "Customer's number is hidden after the job.":
    'வேலைக்குப் பிறகு வாடிக்கையாளரின் நம்பர் மறைக்கப்படும்.',
  'This browser cannot read the image':
    'இந்தப் பிரவுசரால் படத்தைப் படிக்க முடியவில்லை',
  "We couldn't send the code right now. Try again in a minute, or WhatsApp us on {phone}.":
    'இப்போது கோட் அனுப்ப முடியவில்லை. ஒரு நிமிடத்தில் மீண்டும் முயற்சிக்கவும், அல்லது {phone}-க்கு WhatsApp செய்யுங்கள்.',
  'Check your connection and try again.':
    'உங்கள் இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  'Longer than 60 seconds — trim it on the phone and upload again':
    '60 வினாடிக்கு மேல் உள்ளது — போனில் குறைத்து மீண்டும் அப்லோட் செய்யுங்கள்',
  'no number plates or faces can be read, or the owner agreed':
    'நம்பர் பிளேட்டோ முகமோ தெரியக்கூடாது, அல்லது உரிமையாளர் சம்மதித்திருக்க வேண்டும்',
  'Starting now': 'இப்போது தொடங்குகிறது',
  '{count} day': '{count} நாள்',
  '{count} days': '{count} நாட்கள்',
  '{list} and {last}': '{list} மற்றும் {last}',
  'Car wash': 'கார் வாஷ்',
  Detailing: 'டீடெய்லிங்',
  Coating: 'கோட்டிங்',
  'Scratch removal': 'கீறல் நீக்கம்',
  Others: 'மற்றவை',
  Package: 'பேக்கேஜ்',
  All: 'அனைத்தும்',
  Packages: 'பேக்கேஜ்கள்',
  'Car Wash': 'கார் வாஷ்',
  'Scratch Removal': 'கீறல் நீக்கம்',
  Front: 'முன்பக்கம்',
  'Left side': 'இடப்புறம்',
  'Right side': 'வலப்புறம்',
  Interior: 'உட்புறம்',
  Extra: 'கூடுதல்',
  'Add {count} more before photo to start.':
    'தொடங்க இன்னும் {count} "முன்பு" போட்டோ சேர்க்கவும்.',
  'Add {count} more before photos to start.':
    'தொடங்க இன்னும் {count} "முன்பு" போட்டோக்கள் சேர்க்கவும்.',
  'Add {count} before photo to start.':
    'தொடங்க {count} "முன்பு" போட்டோ சேர்க்கவும்.',
  'Add {count} before photos to start.':
    'தொடங்க {count} "முன்பு" போட்டோக்கள் சேர்க்கவும்.',
  'Add {count} more after photo to complete.':
    'முடிக்க இன்னும் {count} "பின்பு" போட்டோ சேர்க்கவும்.',
  'Add {count} more after photos to complete.':
    'முடிக்க இன்னும் {count} "பின்பு" போட்டோக்கள் சேர்க்கவும்.',
  'Add {count} after photo to complete.':
    'முடிக்க {count} "பின்பு" போட்டோ சேர்க்கவும்.',
  'Add {count} after photos to complete.':
    'முடிக்க {count} "பின்பு" போட்டோக்கள் சேர்க்கவும்.',
  'Free wash when we reach {area}': '{area}-க்கு நாங்கள் வரும்போது இலவச வாஷ்',
  '{count} waiting here': 'இங்கே {count} பேர் காத்திருக்கிறார்கள்',
  'Be the first in {area}': '{area}-ல் முதல் ஆளாக இருங்கள்',
  'Know a good garage here? ₹{amount} credit if they join and you book them':
    'இங்கே நல்ல கேரேஜ் தெரியுமா? அவர்கள் சேர்ந்து நீங்கள் புக் செய்தால் ₹{amount} கிரெடிட்',
  'closes {time}': '{time}-க்கு மூடும்',
  'opens {time}': '{time}-க்குத் திறக்கும்',
  'opens {time} tomorrow': 'நாளை {time}-க்குத் திறக்கும்',
  'opens next {day} {time}': 'அடுத்த {day} {time}-க்குத் திறக்கும்',
  'opens {day} {time}': '{day} {time}-க்குத் திறக்கும்',
  'Notifications are blocked for this site in your browser settings.':
    'உங்கள் பிரவுசர் அமைப்புகளில் இந்தத் தளத்துக்கு அறிவிப்புகள் தடுக்கப்பட்டுள்ளன.',
  'Notifications were not allowed.':
    'அறிவிப்புகளுக்கு அனுமதி கொடுக்கப்படவில்லை.',
  "This browser can't show notifications.":
    'இந்தப் பிரவுசரால் அறிவிப்புகளைக் காட்ட முடியாது.',
  Yesterday: 'நேற்று',
  'just now': 'இப்போதுதான்',
  'in {count} min': '{count} நிமிடத்தில்',
  '{count} min ago': '{count} நிமிடம் முன்பு',
  'in {count} h': '{count} மணிநேரத்தில்',
  '{count} h ago': '{count} மணிநேரம் முன்பு',
  tomorrow: 'நாளை',
  yesterday: 'நேற்று',
  'in {count} days': '{count} நாட்களில்',
  '{count} days ago': '{count} நாட்கள் முன்பு',
  'By {time}': '{time}-க்குள்',
  "1 hour's notice": '1 மணிநேர முன்னறிவிப்பு',
  "{count} hours' notice": '{count} மணிநேர முன்னறிவிப்பு',
  'Doorstep visits need at least {notice}.':
    'வீட்டுக்கே வந்து செய்யும் சர்வீஸுக்குக் குறைந்தது {notice} தேவை.',
  'Pickup & drop needs at least {notice}.':
    'பிக்கப் & டிராப்-க்குக் குறைந்தது {notice} தேவை.',
  'At-garage bookings need at least {notice}.':
    'கேரேஜில் செய்யும் புக்கிங்குகளுக்குக் குறைந்தது {notice} தேவை.',
  'Doorstep visits need {notice}.':
    'வீட்டுக்கே வந்து செய்யும் சர்வீஸுக்கு {notice} தேவை.',
  'Pickup & drop needs {notice}.': 'பிக்கப் & டிராப்-க்கு {notice} தேவை.',
  'At-garage bookings need {notice}.':
    'கேரேஜில் செய்யும் புக்கிங்குகளுக்கு {notice} தேவை.',
  "We are responsible for the customer's car from pickup until it is returned":
    'எடுத்துச் சென்றதிலிருந்து திருப்பித் தரும் வரை வாடிக்கையாளரின் காருக்கு நாங்களே பொறுப்பு',
  'Picked up': 'எடுக்கப்பட்டது',
  'Out for delivery': 'திரும்ப வருகிறது',
  Delivered: 'ஒப்படைக்கப்பட்டது',
  'Pickup within {km} km (default)':
    '{km} km-க்குள் எடுத்துச் செல்லுதல் (இயல்பு)',
  'Pickup within {km} km': '{km} km-க்குள் எடுத்துச் செல்லுதல்',
  'Enter a distance from {min} to {max} km, or leave it empty for {default} km.':
    '{min} முதல் {max} km வரை தூரத்தை உள்ளிடுங்கள், அல்லது {default} km-க்குக் காலியாக விடுங்கள்.',
  Booked: 'புக் ஆனது',
  'Being worked on': 'வேலை நடக்கிறது',
  'Car collected': 'கார் எடுத்துச் செல்லப்பட்டது',
  'At the garage': 'கேரேஜில் உள்ளது',
  'On its way back': 'திரும்பி வந்துகொண்டிருக்கிறது',
  'Car returned': 'கார் திருப்பித் தரப்பட்டது',
  '{garage} accepted your booking': '{garage} உங்கள் புக்கிங்கை ஏற்றது',
  'Waiting for {garage} to accept': '{garage} ஏற்கக் காத்திருக்கிறது',
  'The garage has your car': 'உங்கள் கார் கேரேஜிடம் உள்ளது',
  'The garage comes to your address at your booked time':
    'நீங்கள் புக் செய்த நேரத்தில் கேரேஜ் உங்கள் முகவரிக்கு வரும்',
  'The garage collects your car from your address':
    'கேரேஜ் உங்கள் முகவரியிலிருந்து காரை எடுத்துச் செல்லும்',
  'Your car reached the garage': 'உங்கள் கார் கேரேஜை அடைந்தது',
  'On the way to the garage': 'கேரேஜுக்குச் சென்றுகொண்டிருக்கிறது',
  'Your car is taken to the garage':
    'உங்கள் கார் கேரேஜுக்குக் கொண்டு செல்லப்படும்',
  'The work on your car is done': 'உங்கள் காரில் வேலை முடிந்தது',
  'Work starts once your car is at the garage':
    'கார் கேரேஜுக்கு வந்ததும் வேலை தொடங்கும்',
  'The garage works on your car': 'கேரேஜ் உங்கள் காரில் வேலை செய்யும்',
  'Your car is on its way back': 'உங்கள் கார் திரும்பி வந்துகொண்டிருக்கிறது',
  'Shows here when your car leaves the garage':
    'கார் கேரேஜிலிருந்து கிளம்பியதும் இங்கே தெரியும்',
  'The garage brings your car back':
    'கேரேஜ் உங்கள் காரைத் திருப்பிக் கொண்டு வரும்',
  'Your car is back with you': 'உங்கள் கார் உங்களிடம் திரும்பி வந்துவிட்டது',
  'On its way back to you': 'உங்களிடம் திரும்பி வந்துகொண்டிருக்கிறது',
  'Pickup code': 'பிக்கப் கோட்',
  'Give this code to the garage when they collect your car:':
    'கேரேஜ் உங்கள் காரை எடுத்துச் செல்லும்போது இந்தக் கோட் கொடுங்கள்:',
  'Delivery code': 'டெலிவரி கோட்',
  'Give this code when your car is returned:':
    'கார் திருப்பித் தரப்படும்போது இந்தக் கோட் கொடுங்கள்:',
  'A bonus stamp': 'ஒரு போனஸ் ஸ்டாம்ப்',
  'A Garage card': 'ஒரு Garage கார்டு',
  'A free wash (up to {amount})': 'ஒரு இலவச வாஷ் ({amount} வரை)',
  '{amount} off': '{amount} தள்ளுபடி',
  'Your reward is ready': 'உங்கள் ரிவார்டு தயார்',
  '{count} more wash to your reward':
    'உங்கள் ரிவார்டுக்கு இன்னும் {count} வாஷ்',
  '{count} more washes to your reward':
    'உங்கள் ரிவார்டுக்கு இன்னும் {count} வாஷ்கள்',
  'Book this month to start a streak':
    'ஸ்ட்ரீக் தொடங்க இந்த மாதம் புக் செய்யுங்கள்',
  '{count}-month streak': '{count} மாத ஸ்ட்ரீக்',
  '{streak} — book this month to keep it':
    '{streak} — தொடர இந்த மாதம் புக் செய்யுங்கள்',
  '{streak} — book next month for a bonus stamp':
    '{streak} — போனஸ் ஸ்டாம்புக்கு அடுத்த மாதம் புக் செய்யுங்கள்',
  '{streak} — {count} more months for a bonus stamp':
    '{streak} — போனஸ் ஸ்டாம்புக்கு இன்னும் {count} மாதங்கள்',
  '{count} more wash by {day} to keep {level}':
    '{level}-ஐத் தக்கவைக்க {day}-க்குள் இன்னும் {count} வாஷ்',
  '{count} more washes by {day} to keep {level}':
    '{level}-ஐத் தக்கவைக்க {day}-க்குள் இன்னும் {count} வாஷ்கள்',
  '{count} more wash to reach {level}': '{level}-ஐ அடைய இன்னும் {count} வாஷ்',
  '{count} more washes to reach {level}':
    '{level}-ஐ அடைய இன்னும் {count} வாஷ்கள்',
  '{level} is next': 'அடுத்தது {level}',
  "You're at the top: {level}": 'நீங்கள் உச்சத்தில் இருக்கிறீர்கள்: {level}',
  '{count} wash': '{count} வாஷ்',
  '{count} washes': '{count} வாஷ்கள்',
  "You've saved {amount} with Detlio Rewards":
    'Detlio Rewards மூலம் {amount} சேமித்துள்ளீர்கள்',
  'since {date}': '{date} முதல்',
  Silver: 'சில்வர்',
  Gold: 'கோல்டு',
  Platinum: 'பிளாட்டினம்',
  Diamond: 'டயமண்ட்',
  Icon: 'ஐகான்',
  Bronze: 'பிரான்ஸ்',
  'On time': 'சரியான நேரத்தில்',
  'Spotless finish': 'பளிச்சென்ற வேலை',
  Friendly: 'அன்பான அணுகுமுறை',
  'Good value': 'விலைக்கு ஏற்ற தரம்',
  'Missed spots': 'சில இடங்கள் விடுபட்டன',
  Late: 'தாமதம்',
  'Damp/wet interior': 'உள்ளே ஈரமாக இருந்தது',
  Rude: 'மரியாதையின்றி நடந்தார்கள்',
  'New on Detlio': 'Detlio-ல் புதியது',
  '{count} review so far': 'இதுவரை {count} மதிப்பாய்வு',
  '{count} reviews so far': 'இதுவரை {count} மதிப்பாய்வுகள்',
  'Missed spots or dirt left':
    'சில இடங்கள் விடுபட்டன அல்லது அழுக்கு மீதம் உள்ளது',
  'Water marks or streaks': 'தண்ணீர்க் கறைகள் அல்லது கோடுகள்',
  'Interior not cleaned': 'உட்புறம் சுத்தம் செய்யப்படவில்லை',
  'Wrong service done': 'தவறான சர்வீஸ் செய்யப்பட்டது',
  'Something else': 'வேறு ஏதோ',
  'Waiting for the garage': 'கேரேஜின் பதிலுக்காக',
  'With Detlio': 'Detlio பார்க்கிறது',
  'Redo approved — customer to pick a time':
    'மீண்டும் செய்ய அனுமதி — வாடிக்கையாளர் நேரம் தேர்வு செய்ய வேண்டும்',
  'Redo booked': 'மீண்டும் செய்ய புக் ஆனது',
  'Redo done': 'மீண்டும் செய்து முடிந்தது',
  'Refund instead': 'பதிலாகப் பணம் திருப்பித் தரப்படும்',
  'Not approved': 'அனுமதிக்கப்படவில்லை',
  Closed: 'மூடப்பட்டது',
  'Withdrawn by the customer': 'வாடிக்கையாளர் திரும்பப் பெற்றார்',
  'Detlio Guarantee': 'Detlio Guarantee',
  'Covered by Detlio Guarantee': 'Detlio Guarantee உள்ளது',
  'Not happy? Detlio Guarantee — free redo':
    'திருப்தி இல்லையா? Detlio Guarantee — இலவசமாக மீண்டும் செய்து தருவோம்',
  'Car washes and detailing, including packages of them.':
    'கார் வாஷ் மற்றும் டீடெய்லிங், அவற்றின் பேக்கேஜ்கள் உட்பட.',
  'Not happy with a wash or detailing? Ask for a free redo within 48 hours, with photos of the problem.':
    'வாஷ் அல்லது டீடெய்லிங்கில் திருப்தி இல்லையா? பிரச்சனையின் போட்டோக்களுடன் 48 மணிநேரத்துக்குள் இலவசமாக மீண்டும் செய்யக் கேளுங்கள்.',
  'Take at least 2 photos of the problem in the app.':
    'ஆப்பில் பிரச்சனையின் குறைந்தது 2 போட்டோக்கள் எடுங்கள்.',
  "We compare them with the garage's before and after photos.":
    'அவற்றைக் கேரேஜின் முன்பு, பின்பு போட்டோக்களுடன் ஒப்பிடுவோம்.',
  "The garage answers within 12 hours of its opening hours. If it doesn't, your redo is approved.":
    'கேரேஜ் தனது வேலை நேரத்தில் 12 மணிநேரத்துக்குள் பதிலளிக்கும். பதிலளிக்காவிட்டால், மீண்டும் செய்ய அனுமதி கிடைக்கும்.',
  'If the garage disagrees, Detlio decides within 24 hours.':
    'கேரேஜ் ஒப்புக்கொள்ளாவிட்டால், Detlio 24 மணிநேரத்துக்குள் முடிவு செய்யும்.',
  'Once approved, pick a free redo time at the same garage within 7 days.':
    'அனுமதி கிடைத்ததும், அதே கேரேஜில் 7 நாட்களுக்குள் இலவசமாக மீண்டும் செய்ய நேரத்தைத் தேர்ந்தெடுங்கள்.',
  "Pick what's wrong.": 'என்ன தவறு என்று தேர்ந்தெடுங்கள்.',
  "Say what's wrong in a few words.":
    'என்ன தவறு என்று சில வார்த்தைகளில் சொல்லுங்கள்.',
  'Add at least {count} photos of the problem.':
    'பிரச்சனையின் குறைந்தது {count} போட்டோக்கள் சேர்க்கவும்.',
  'Add at most {count} photos.': 'அதிகபட்சம் {count} போட்டோக்கள் சேர்க்கவும்.',
  'Payment or refund': 'பணம் செலுத்துதல் அல்லது திருப்பித் தருதல்',
  'Quality of the work': 'வேலையின் தரம்',
  "Garage didn't turn up": 'கேரேஜ் வரவில்லை',
  'Damage to my car': 'என் காருக்குச் சேதம்',
  'Problem with the app': 'ஆப்பில் பிரச்சனை',
  'You told us by phone': 'நீங்கள் போனில் சொன்னீர்கள்',
  'You told us on WhatsApp': 'நீங்கள் WhatsApp-ல் சொன்னீர்கள்',
  'You told us by email': 'நீங்கள் ஈமெயிலில் சொன்னீர்கள்',
  'You told us in person': 'நீங்கள் நேரில் சொன்னீர்கள்',
  'You told our team': 'நீங்கள் எங்கள் குழுவிடம் சொன்னீர்கள்',
  Received: 'பெறப்பட்டது',
  'Being looked into': 'பரிசீலிக்கப்படுகிறது',
  Resolved: 'தீர்க்கப்பட்டது',
  "Complaint {number} received — we'll get back to you within {hours} hours.":
    'புகார் {number} பெறப்பட்டது — {hours} மணிநேரத்துக்குள் உங்களைத் தொடர்புகொள்வோம்.',
  '{tier} garage': '{tier} கேரேஜ்',
  'Has accepted the Detlio garage agreement.':
    'Detlio கேரேஜ் ஒப்பந்தத்தை ஏற்றுள்ளது.',
  'Documents checked by Detlio, well rated and reliable.':
    'Detlio ஆவணங்களைச் சரிபார்த்தது, நல்ல ரேட்டிங், நம்பகமானது.',
  'Detlio’s highest standards, checked in person.':
    'Detlio-வின் உயர்ந்த தரநிலைகள், நேரில் சரிபார்க்கப்பட்டது.',
  'Detlio has checked the owner’s ID, bank details and shop.':
    'உரிமையாளரின் ID, வங்கி விவரங்கள், கடை ஆகியவற்றை Detlio சரிபார்த்துள்ளது.',
  'Rated 4.2 or more by at least 5 customers.':
    'குறைந்தது 5 வாடிக்கையாளர்களிடமிருந்து 4.2 அல்லது அதற்கு மேல் ரேட்டிங்.',
  'At least 10 jobs completed through Detlio in the last 90 days.':
    'கடந்த 90 நாட்களில் Detlio மூலம் குறைந்தது 10 வேலைகள் முடித்துள்ளது.',
  'Answers at least 85% of bookings in time.':
    'குறைந்தது 85% புக்கிங்குகளுக்கு நேரத்தில் பதிலளிக்கிறது.',
  'Has not missed a booking in the last 90 days.':
    'கடந்த 90 நாட்களில் எந்த புக்கிங்கையும் தவறவிடவில்லை.',
  'Rated 4.5 or more by at least 10 customers.':
    'குறைந்தது 10 வாடிக்கையாளர்களிடமிருந்து 4.5 அல்லது அதற்கு மேல் ரேட்டிங்.',
  'At least 20 jobs completed through Detlio in the last 90 days.':
    'கடந்த 90 நாட்களில் Detlio மூலம் குறைந்தது 20 வேலைகள் முடித்துள்ளது.',
  'Answers at least 90% of bookings in time.':
    'குறைந்தது 90% புக்கிங்குகளுக்கு நேரத்தில் பதிலளிக்கிறது.',
  'Complaints about damage, poor work or not turning up on fewer than 3 in 100 jobs.':
    'சேதம், மோசமான வேலை அல்லது வராமல் போனது பற்றிய புகார்கள் 100 வேலைகளில் 3-க்கும் குறைவு.',
  'Takes before and after photos of the car on at least 90% of jobs.':
    'குறைந்தது 90% வேலைகளில் காரின் முன்பு, பின்பு போட்டோக்கள் எடுக்கிறது.',
  'Has not been found asking customers to book or pay outside Detlio in the last 180 days.':
    'கடந்த 180 நாட்களில் Detlio-க்கு வெளியே புக் செய்யவோ பணம் செலுத்தவோ வாடிக்கையாளர்களைக் கேட்டதாகக் கண்டறியப்படவில்லை.',
  'Visited and checked in person by Detlio in the last 6 months.':
    'கடந்த 6 மாதங்களில் Detlio நேரில் வந்து சரிபார்த்துள்ளது.',
  'Detlio checks these every day. A garage that stops meeting them loses its medal after 14 days.':
    'Detlio இவற்றைத் தினமும் சரிபார்க்கிறது. இவற்றைப் பூர்த்தி செய்யாத கேரேஜ் 14 நாட்களுக்குப் பிறகு பதக்கத்தை இழக்கும்.',
  'Silver & above': 'சில்வர் மற்றும் அதற்கு மேல்',
  'Silver+': 'சில்வர்+',
  'Silver & Gold': 'சில்வர் & கோல்டு',
  "You're {tier}.": 'நீங்கள் {tier}.',
  'No tier yet.': 'இன்னும் tier இல்லை.',
  "{now} That's the top tier.": '{now} இதுவே உயர்ந்த tier.',
  '{now} Next: {tier}, {done} of {total} done.':
    '{now} அடுத்தது: {tier}, {total}-ல் {done} முடிந்தது.',
  'Bronze shows customers you have agreed to Detlio’s terms.':
    'நீங்கள் Detlio விதிமுறைகளை ஏற்றுள்ளீர்கள் என்பதை பிரான்ஸ் வாடிக்கையாளர்களுக்குக் காட்டுகிறது.',
  'Silver garages show up under “Silver & above”, which customers use to pick a garage.':
    'சில்வர் கேரேஜ்கள் “சில்வர் மற்றும் அதற்கு மேல்” என்பதில் தெரியும்; வாடிக்கையாளர்கள் கேரேஜைத் தேர்வு செய்ய இதைப் பயன்படுத்துகிறார்கள்.',
  'Gold is Detlio’s highest tier: customers see it first.':
    'கோல்டு Detlio-வின் உயர்ந்த tier: வாடிக்கையாளர்கள் இதை முதலில் பார்ப்பார்கள்.',
  'Read and accept': 'படித்து ஏற்கவும்',
  'Upload documents': 'ஆவணங்களை அப்லோட் செய்யவும்',
  'Add your car first': 'முதலில் உங்கள் காரைச் சேர்க்கவும்',
  'for today': 'இன்றைக்கு',
  'for tomorrow': 'நாளைக்கு',
  'for {day}': '{day} அன்று',
  'Overdue by {count} day': '{count} நாள் தாமதம்',
  'Overdue by {count} days': '{count} நாட்கள் தாமதம்',
  'Due today': 'இன்று செய்ய வேண்டும்',
  'Due in {count} day': '{count} நாளில் செய்ய வேண்டும்',
  'Due in {count} days': '{count} நாட்களில் செய்ய வேண்டும்',
  'No wash through Detlio yet': 'Detlio மூலம் இன்னும் வாஷ் இல்லை',
  'Default is every 14 days, every 10 days during the Oct–Dec monsoon.':
    'இயல்பாக 14 நாட்களுக்கு ஒருமுறை; Oct–Dec மழைக்காலத்தில் 10 நாட்களுக்கு ஒருமுறை.',
  'Just now': 'இப்போதுதான்',
  'This week': 'இந்த வாரம்',
  Earlier: 'முன்பு',
  Chennai: 'சென்னை',
  'This garage is in {town}.': 'இந்த கேரேஜ் {town}-ல் உள்ளது.',
  'This garage is in {town}, about {km} km from {city}.':
    'இந்த கேரேஜ் {town}-ல் உள்ளது, {city}-லிருந்து சுமார் {km} km.',
  'Asked me to book directly next time':
    'அடுத்த முறை நேரடியாக புக் செய்யச் சொன்னார்கள்',
  'Offered a lower price outside Detlio':
    'Detlio-க்கு வெளியே குறைந்த விலை சொன்னார்கள்',
  'Asked me to pay cash or UPI directly':
    'நேரடியாக கேஷ் அல்லது UPI-ல் பணம் கொடுக்கச் சொன்னார்கள்',
  'Gave their number for future bookings':
    'அடுத்த புக்கிங்குகளுக்குத் தங்கள் நம்பரைக் கொடுத்தார்கள்',
  'Did the garage ask you to book directly or pay outside Detlio?':
    'கேரேஜ் உங்களை நேரடியாக புக் செய்யவோ Detlio-க்கு வெளியே பணம் செலுத்தவோ சொன்னதா?',
  'Did the garage ask you to book directly?':
    'கேரேஜ் உங்களை நேரடியாக புக் செய்யச் சொன்னதா?',
  'The garage is never told who reported it.':
    'யார் புகார் சொன்னார்கள் என்று கேரேஜுக்கு ஒருபோதும் தெரிவிக்கப்படாது.',
  'If we confirm it, we add ₹{amount} to your Detlio credit (once per garage).':
    'நாங்கள் உறுதிசெய்தால், உங்கள் Detlio கிரெடிட்டில் ₹{amount} சேர்ப்போம் (ஒரு கேரேஜுக்கு ஒருமுறை).',
  'Thanks for telling us': 'எங்களிடம் சொன்னதற்கு நன்றி',
  'We’ll look into it. The garage is never told who reported it.':
    'இதைப் பரிசீலிப்போம். யார் புகார் சொன்னார்கள் என்று கேரேஜுக்கு ஒருபோதும் தெரிவிக்கப்படாது.',
  'You reported this booking. We’re looking into it.':
    'இந்த புக்கிங் பற்றி நீங்கள் புகார் செய்தீர்கள். நாங்கள் பரிசீலிக்கிறோம்.',
  'You reported this booking. We looked into it — thank you for telling us.':
    'இந்த புக்கிங் பற்றி நீங்கள் புகார் செய்தீர்கள். நாங்கள் பரிசீலித்தோம் — சொன்னதற்கு நன்றி.',
  'We confirmed your report — ₹{amount} added to your Detlio credit. Thank you.':
    'உங்கள் புகாரை உறுதிசெய்தோம் — உங்கள் Detlio கிரெடிட்டில் ₹{amount} சேர்க்கப்பட்டது. நன்றி.',
  'We confirmed your report. Your ₹{amount} reward is on its way. Thank you.':
    'உங்கள் புகாரை உறுதிசெய்தோம். உங்கள் ₹{amount} ரிவார்டு வந்துகொண்டிருக்கிறது. நன்றி.',
  'We confirmed your report. Thank you for telling us.':
    'உங்கள் புகாரை உறுதிசெய்தோம். சொன்னதற்கு நன்றி.',
  'Asking Detlio customers to book directly breaks your agreement and can lead to suspension.':
    'Detlio வாடிக்கையாளர்களை நேரடியாக புக் செய்யச் சொல்வது உங்கள் ஒப்பந்தத்தை மீறுவதாகும், கணக்கு நிறுத்தப்படலாம்.',
  'Free — booking {n} of your first {count}':
    'இலவசம் — உங்கள் முதல் {count}-ல் {n}-வது புக்கிங்',
  Due: 'செலுத்த வேண்டியது',
  Paid: 'செலுத்தப்பட்டது',
  'Owed to Detlio': 'Detlio-க்குத் தர வேண்டியது',
  'Nothing to pay': 'செலுத்த எதுவும் இல்லை',
  'Bank transfer': 'வங்கிப் பரிமாற்றம்',
  UPI: 'UPI',
  Other: 'மற்றவை',
  'Customer no-show': 'வாடிக்கையாளர் வரவில்லை',
  'Refunded after payout': 'பணம் கொடுத்த பிறகு திருப்பித் தரப்பட்டது',
  'Shop photo': 'கடை போட்டோ',
  'Owner ID': 'உரிமையாளர் ID',
  'Bank proof': 'வங்கிச் சான்று',
  'Signed agreement (old, on paper)':
    'கையெழுத்திட்ட ஒப்பந்தம் (பழையது, காகிதத்தில்)',
  'GST certificate': 'GST சான்றிதழ்',
  'Trade licence': 'வர்த்தக உரிமம்',
  'A photo of the shop front with your name board showing.':
    'உங்கள் பெயர்ப் பலகை தெரியும்படி கடையின் முன்பக்க போட்டோ.',
  'Your PAN card, or your Aadhaar card with the number masked. Front and back if it has two sides.':
    'உங்கள் PAN கார்டு, அல்லது நம்பர் மறைக்கப்பட்ட Aadhaar கார்டு. இரண்டு பக்கம் இருந்தால் முன்பக்கமும் பின்பக்கமும்.',
  'A cancelled cheque, or the passbook or statement page that shows the account we pay you into.':
    'ரத்து செய்த காசோலை, அல்லது நாங்கள் பணம் அனுப்பும் கணக்கைக் காட்டும் பாஸ்புக் அல்லது ஸ்டேட்மென்ட் பக்கம்.',
  'The paper agreement from before you could agree in the app. Kept for the record.':
    'ஆப்பில் ஒப்புக்கொள்ளும் வசதிக்கு முன்பு காகிதத்தில் போட்ட ஒப்பந்தம். பதிவுக்காக வைக்கப்படுகிறது.',
  'Only if your garage is registered for GST.':
    'உங்கள் கேரேஜ் GST-ல் பதிவு செய்திருந்தால் மட்டும்.',
  'Your trade licence from the corporation or panchayat, if you have one.':
    'கார்ப்பரேஷன் அல்லது பஞ்சாயத்திலிருந்து பெற்ற வர்த்தக உரிமம், இருந்தால்.',
  'Optional. You work at customers’ doorsteps, so there may be no shop front. Add a photo of one if you have it.':
    'விருப்பத்தேர்வு. நீங்கள் வாடிக்கையாளர்களின் வீட்டுக்கே சென்று வேலை செய்வதால் கடை இல்லாமல் இருக்கலாம். இருந்தால் அதன் போட்டோவைச் சேர்க்கவும்.',
  'Cover the first 8 digits of an Aadhaar number':
    'Aadhaar நம்பரின் முதல் 8 இலக்கங்களை மறைக்கவும்',
  'Not uploaded': 'அப்லோட் செய்யப்படவில்லை',
  'Waiting for review': 'சரிபார்ப்பில்',
  Approved: 'அனுமதிக்கப்பட்டது',
  Rejected: 'நிராகரிக்கப்பட்டது',
  '{done} of {count} required approved':
    'தேவையானவற்றில் {count}-ல் {done} அனுமதிக்கப்பட்டது',
  'Pick a file.': 'ஒரு ஃபைலைத் தேர்ந்தெடுங்கள்.',
  'Two files at most: the front and the back.':
    'அதிகபட்சம் இரண்டு ஃபைல்கள்: முன்பக்கமும் பின்பக்கமும்.',
  'Use a photo (JPEG, PNG or WebP) or a PDF.':
    'போட்டோ (JPEG, PNG அல்லது WebP) அல்லது PDF பயன்படுத்துங்கள்.',
  'That file is empty.': 'அந்த ஃபைல் காலியாக உள்ளது.',
  'Files can be up to 10 MB.': 'ஃபைல்கள் 10 MB வரை இருக்கலாம்.',
  Photo: 'போட்டோ',
  'Morning 9–12': 'காலை 9–12',
  'Afternoon 2–5': 'மதியம் 2–5',
  'Evening 5–8': 'மாலை 5–8',
  'No payment now': 'இப்போது பணம் செலுத்த வேண்டாம்',
  'They reply within 2 hours, or we ask the next garage':
    'அவர்கள் 2 மணிநேரத்துக்குள் பதிலளிப்பார்கள், இல்லையென்றால் அடுத்த கேரேஜிடம் கேட்போம்',
  'Any travel fee is shown before you pay':
    'பயணக் கட்டணம் ஏதாவது இருந்தால் பணம் செலுத்தும் முன் காட்டப்படும்',
  None: 'இல்லை',
  'Request a pickup': 'பிக்கப் கோருங்கள்',
  'Request a visit': 'வருகை கோருங்கள்',
  'Tried {tried} of {count} nearby garage.':
    'அருகிலுள்ள {count} கேரேஜில் {tried} முயற்சித்தோம்.',
  'Tried {tried} of {count} nearby garages.':
    'அருகிலுள்ள {count} கேரேஜ்களில் {tried} முயற்சித்தோம்.',
  '5–7 working days': '5–7 வேலை நாட்கள்',
  '{amount} back in your Detlio credit.':
    '{amount} உங்கள் Detlio கிரெடிட்டுக்குத் திரும்ப வந்துவிட்டது.',
  '{amount} going back to your Detlio credit.':
    '{amount} உங்கள் Detlio கிரெடிட்டுக்குத் திரும்ப வருகிறது.',
  'It can take {days} to show in your account.':
    'உங்கள் கணக்கில் தெரிய {days} ஆகலாம்.',
  'Refunded {done} for the earlier final bill so far. A further refund of {amount} started on {date}. It reaches your account in {days}.':
    'முந்தைய இறுதி பில்லுக்கு இதுவரை {done} திருப்பித் தரப்பட்டது. மேலும் {amount} திருப்பித் தருதல் {date} அன்று தொடங்கியது. {days}-ல் உங்கள் கணக்குக்கு வரும்.',
  'Refunded {done} so far. A further refund of {amount} started on {date}. It reaches your account in {days}.':
    'இதுவரை {done} திருப்பித் தரப்பட்டது. மேலும் {amount} திருப்பித் தருதல் {date} அன்று தொடங்கியது. {days}-ல் உங்கள் கணக்குக்கு வரும்.',
  'Refund of {amount} for the earlier final bill started on {date}. It reaches your account in {days}.':
    'முந்தைய இறுதி பில்லுக்கான {amount} திருப்பித் தருதல் {date} அன்று தொடங்கியது. {days}-ல் உங்கள் கணக்குக்கு வரும்.',
  'Refund of {amount} started on {date}. It reaches your account in {days}.':
    '{amount} திருப்பித் தருதல் {date} அன்று தொடங்கியது. {days}-ல் உங்கள் கணக்குக்கு வரும்.',
  'Refunded {amount} for the earlier final bill on {date}.':
    'முந்தைய இறுதி பில்லுக்கான {amount} {date} அன்று திருப்பித் தரப்பட்டது.',
  'Refunded {amount} for the earlier final bill.':
    'முந்தைய இறுதி பில்லுக்கான {amount} திருப்பித் தரப்பட்டது.',
  'Refunded {amount} on {date}.':
    '{amount} {date} அன்று திருப்பித் தரப்பட்டது.',
  'Refunded {amount}.': '{amount} திருப்பித் தரப்பட்டது.',
  'Refunded {done} of {amount} for the earlier final bill on {date}.':
    'முந்தைய இறுதி பில்லுக்கான {amount}-ல் {done} {date} அன்று திருப்பித் தரப்பட்டது.',
  'Refunded {done} of {amount} for the earlier final bill.':
    'முந்தைய இறுதி பில்லுக்கான {amount}-ல் {done} திருப்பித் தரப்பட்டது.',
  'Refunded {done} of {amount} on {date}.':
    '{amount}-ல் {done} {date} அன்று திருப்பித் தரப்பட்டது.',
  'Refunded {done} of {amount}.': '{amount}-ல் {done} திருப்பித் தரப்பட்டது.',
  'your {amount} payment for the earlier final bill':
    'முந்தைய இறுதி பில்லுக்கு நீங்கள் செலுத்திய {amount}',
  'the {amount} you paid online': 'நீங்கள் ஆன்லைனில் செலுத்திய {amount}',
  'your payment': 'நீங்கள் செலுத்திய பணம்',
  'Our team will refund {yours} to your original payment method within {days}.':
    '{yours}-ஐ {days}-க்குள் நீங்கள் பணம் செலுத்திய அதே முறைக்கு எங்கள் குழு திருப்பித் தரும்.',
  'At your door': 'உங்கள் வீட்டுக்கே',
  '{count} garage can come to your door · from {price}':
    '{count} கேரேஜ் உங்கள் வீட்டுக்கே வரும் · {price} முதல்',
  '{count} garages can come to your door · from {price}':
    '{count} கேரேஜ்கள் உங்கள் வீட்டுக்கே வரும் · {price} முதல்',
  '{count} garage can come to your door':
    '{count} கேரேஜ் உங்கள் வீட்டுக்கே வரும்',
  '{count} garages can come to your door':
    '{count} கேரேஜ்கள் உங்கள் வீட்டுக்கே வரும்',
  'We collect your car': 'உங்கள் காரை நாங்கள் எடுத்துச் செல்வோம்',
  '{count} garage picks up and drops back':
    '{count} கேரேஜ் எடுத்துச் சென்று திருப்பித் தரும்',
  '{count} garages pick up and drop back':
    '{count} கேரேஜ்கள் எடுத்துச் சென்று திருப்பித் தரும்',
  // A small city's Skip the drive rows: the same, with no numbers (0070).
  'Comes to your door · from {price}': 'உங்கள் வீட்டுக்கே வரும் · {price} முதல்',
  'Comes to your door': 'உங்கள் வீட்டுக்கே வரும்',
  'Picks up your car and drops it back': 'உங்கள் காரை எடுத்துச் சென்று திருப்பித் தரும்',
  'No garage to drive to near you yet':
    'உங்கள் அருகில் சென்று சேரக்கூடிய கேரேஜ் இன்னும் இல்லை',
  'The nearest garage is {km} km away':
    'அருகிலுள்ள கேரேஜ் {km} km தொலைவில் உள்ளது',
  '{km} km outside its area': 'அதன் பகுதிக்கு {km} km வெளியே',
  'covers {cover} km · {km} km outside':
    '{cover} km வரை செல்லும் · {km} km வெளியே',
  '₹{price} inspection': '₹{price} பரிசோதனை',
  'Price on request': 'கேட்டால் விலை சொல்லப்படும்',
  'from ₹{price}': '₹{price} முதல்',
  'This payment could not be turned into a booking. A refund is being processed.':
    'இந்தப் பணத்தை புக்கிங்காக மாற்ற முடியவில்லை. பணம் திருப்பித் தரப்படுகிறது.',
  'The garage changed this bill while you were paying, so this payment will be refunded. Please check the new bill.':
    'நீங்கள் பணம் செலுத்தும்போது கேரேஜ் இந்த பில்லை மாற்றியது, அதனால் இந்தப் பணம் திருப்பித் தரப்படும். புதிய பில்லைப் பாருங்கள்.',
  'This booking was cancelled while you were paying, so this payment will be refunded.':
    'நீங்கள் பணம் செலுத்தும்போது இந்த புக்கிங் ரத்து செய்யப்பட்டது, அதனால் இந்தப் பணம் திருப்பித் தரப்படும்.',
  'This extra work was withdrawn or declined while you were paying, so this payment will be refunded.':
    'நீங்கள் பணம் செலுத்தும்போது இந்தக் கூடுதல் வேலை திரும்பப் பெறப்பட்டது அல்லது மறுக்கப்பட்டது, அதனால் இந்தப் பணம் திருப்பித் தரப்படும்.',
  'This booking was cancelled while you were paying for the extra work, so this payment will be refunded.':
    'கூடுதல் வேலைக்கு நீங்கள் பணம் செலுத்தும்போது இந்த புக்கிங் ரத்து செய்யப்பட்டது, அதனால் இந்தப் பணம் திருப்பித் தரப்படும்.',
  'Not accepted in time — cancelled and refunded':
    'நேரத்தில் ஏற்கவில்லை — ரத்து செய்து பணம் திருப்பித் தரப்பட்டது',
  'Accept as soon as you can — it was due by {time}':
    'முடிந்தவரை சீக்கிரம் ஏற்கவும் — {time}-க்குள் ஏற்றிருக்க வேண்டும்',
  'Accept by {time}': '{time}-க்குள் ஏற்கவும்',
  'Accept within {count} min': '{count} நிமிடத்துக்குள் ஏற்கவும்',
  'Waiting for {garage} to accept — by {time}':
    '{garage} ஏற்கக் காத்திருக்கிறது — {time}-க்குள்',
  "The garage didn't accept in time, so this booking is being cancelled and your payment refunded in full.":
    'கேரேஜ் நேரத்தில் ஏற்கவில்லை, அதனால் இந்த புக்கிங் ரத்து செய்யப்பட்டு உங்கள் முழுப் பணமும் திருப்பித் தரப்படுகிறது.',
  "If they don't, this booking is cancelled and your payment refunded in full.":
    'அவர்கள் ஏற்காவிட்டால், இந்த புக்கிங் ரத்து செய்யப்பட்டு உங்கள் முழுப் பணமும் திருப்பித் தரப்படும்.',
  "{garage} didn't accept in time": '{garage} நேரத்தில் ஏற்கவில்லை',
  'Your full refund is on its way ({days}).':
    'உங்கள் முழுப் பணமும் திரும்ப வந்துகொண்டிருக்கிறது ({days}).',
  'Accepted {time}': '{time} ஏற்கப்பட்டது',
  'Picked up {time}': '{time} எடுத்துச் செல்லப்பட்டது',
  'At garage {time}': '{time} கேரேஜில்',
  'Started {time}': '{time} தொடங்கியது',
  'Out for delivery {time}': '{time} திருப்பிக் கொண்டு வரப்படுகிறது',
  'Delivered {time}': '{time} ஒப்படைக்கப்பட்டது',
  'Completed {time}': '{time} முடிந்தது',
  'Nothing due': 'செலுத்த எதுவும் இல்லை',
  Replaced: 'மாற்றப்பட்டது',
  "That code doesn't look right. Check each character and try again.":
    'அந்தக் கோட் சரியாகத் தெரியவில்லை. ஒவ்வொரு எழுத்தையும் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  'A coupon code has 10 letters and numbers after DTL, like DTL-7K4QM-92MXA.':
    'கூப்பன் கோட் DTL-க்குப் பிறகு 10 எழுத்துகளும் எண்களும் கொண்டது, எ.கா. DTL-7K4QM-92MXA.',
  '{percent}% off, up to {amount}': '{percent}% தள்ளுபடி, {amount} வரை',
  'A free car wash, up to {amount}': 'ஒரு இலவச கார் வாஷ், {amount} வரை',
  '1 bonus Shine stamp': '1 போனஸ் Shine ஸ்டாம்ப்',
  '{count} bonus Shine stamps': '{count} போனஸ் Shine ஸ்டாம்ப்கள்',
  'Added to your Shine Card in Detlio Rewards.':
    'Detlio Rewards-ல் உங்கள் Shine Card-ல் சேர்க்கப்படும்.',
  'For new Detlio customers.': 'Detlio-வின் புதிய வாடிக்கையாளர்களுக்கு.',
  'On {category} services.': '{category} சர்வீஸ்களுக்கு.',
  'On bookings of {amount} or more.':
    '{amount} அல்லது அதற்கு மேல் உள்ள புக்கிங்குகளுக்கு.',
  'At {garage} only.': '{garage}-ல் மட்டும்.',
  'At any garage on Detlio.': 'Detlio-வில் உள்ள எந்த கேரேஜிலும்.',
  'For your first booking on Detlio.':
    'Detlio-வில் உங்கள் முதல் புக்கிங்குக்கு.',
  'One use. Paid online at checkout.':
    'ஒருமுறை மட்டும். செக்அவுட்டில் ஆன்லைனில் பணம் செலுத்த வேண்டும்.',
  'Scan with your phone camera or enter the code in the Detlio app':
    'உங்கள் போன் கேமராவில் ஸ்கேன் செய்யுங்கள் அல்லது Detlio ஆப்பில் கோட் உள்ளிடுங்கள்',
  'Payment cancelled': 'பணம் செலுத்துதல் ரத்து செய்யப்பட்டது',
  'Payment failed': 'பணம் செலுத்துதல் தோல்வியடைந்தது',
  'Any time': 'எந்த நேரமும்',
  Morning: 'காலை',
  Afternoon: 'மதியம்',
  Evening: 'மாலை',
  'Delete your account?': 'உங்கள் கணக்கை நீக்கவா?',
  'Your account can be deleted once these are done:':
    'இவை முடிந்ததும் உங்கள் கணக்கை நீக்கலாம்:',
  'Deleted now': 'இப்போதே நீக்கப்படும்',
  'Your name, phone number, email and profile photo':
    'உங்கள் பெயர், போன் நம்பர், ஈமெயில், சுயவிவரப் படம்',
  'Your saved cars’ number plates and colours, and your saved addresses':
    'நீங்கள் சேமித்த கார்களின் நம்பர் பிளேட்டுகள், நிறங்கள், சேமித்த முகவரிகள்',
  'The addresses on your past bookings':
    'உங்கள் பழைய புக்கிங்குகளில் உள்ள முகவரிகள்',
  'Saved garages, slot alerts, area lists, requests to garages and notifications on your devices':
    'சேமித்த கேரேஜ்கள், ஸ்லாட் அலர்ட்டுகள், பகுதிப் பட்டியல்கள், கேரேஜ்களுக்கான கோரிக்கைகள், உங்கள் சாதனங்களில் உள்ள அறிவிப்புகள்',
  'Every sign-in, on every device':
    'எல்லா சாதனங்களிலும் உள்ள எல்லா உள்நுழைவுகளும்',
  Kept: 'வைத்திருக்கப்படும்',
  'Your bookings, receipts, payments and refunds, without your name or number: the law says we keep money records':
    'உங்கள் புக்கிங்குகள், ரசீதுகள், பணம் செலுத்தல்கள், திருப்பித் தருதல்கள் — உங்கள் பெயரோ நம்பரோ இல்லாமல்: பணப் பதிவுகளை வைத்திருக்கச் சட்டம் சொல்கிறது',
  'Your reviews, shown as “Former customer”':
    'உங்கள் மதிப்பாய்வுகள், “முன்னாள் வாடிக்கையாளர்” என்று காட்டப்படும்',
  'Complaints you made, with the name and number you gave then, as our record of how we answered them':
    'நீங்கள் செய்த புகார்கள், அப்போது கொடுத்த பெயர், நம்பருடன் — நாங்கள் எப்படிப் பதிலளித்தோம் என்பதற்கான பதிவாக',
  'This can’t be undone. You can sign up again later with the same number, as a new account.':
    'இதைத் திரும்பப் பெற முடியாது. பின்னர் அதே நம்பருடன் புதிய கணக்காக மீண்டும் பதிவு செய்யலாம்.',
  'Your account is deleted': 'உங்கள் கணக்கு நீக்கப்பட்டது',
  'You’re signed out on every device. Thanks for using Detlio.':
    'எல்லா சாதனங்களிலும் வெளியேறிவிட்டீர்கள். Detlio-வைப் பயன்படுத்தியதற்கு நன்றி.',
  'Booked for {day}': '{day} அன்று புக் செய்யப்பட்டது',
  '{count} day overdue': '{count} நாள் தாமதம்',
  '{count} days overdue': '{count} நாட்கள் தாமதம்',
  'Due tomorrow': 'நாளை செய்ய வேண்டும்',
  'Due {day}': '{day} அன்று செய்ய வேண்டும்',
  'Add-ons go with a service. Add a service first.':
    'ஆட்-ஆன்கள் ஒரு சர்வீஸுடன் மட்டுமே. முதலில் ஒரு சர்வீஸைச் சேர்க்கவும்.',
  'A booking can include at most {count} services':
    'ஒரு புக்கிங்கில் அதிகபட்சம் {count} சர்வீஸ்கள் இருக்கலாம்',
  'A booking can include at most {count} add-ons':
    'ஒரு புக்கிங்கில் அதிகபட்சம் {count} ஆட்-ஆன்கள் இருக்கலாம்',
  'No extra time': 'கூடுதல் நேரம் இல்லை',
  '1 add-on': '1 ஆட்-ஆன்',
  '{count} add-ons': '{count} ஆட்-ஆன்கள்',
  'Good morning': 'காலை வணக்கம்',
  'Good afternoon': 'மதிய வணக்கம்',
  'Good evening': 'மாலை வணக்கம்',
  'No reviews yet': 'இன்னும் மதிப்பாய்வுகள் இல்லை',
  '1 review': '1 மதிப்பாய்வு',
  '{count} reviews': '{count} மதிப்பாய்வுகள்',
  'First Shine': 'முதல் பளபளப்பு',
  '5 Washes Club': '5 வாஷ் கிளப்',
  '25 Washes Club': '25 வாஷ் கிளப்',
  '50 Washes Club': '50 வாஷ் கிளப்',
  '100 Washes Club': '100 வாஷ் கிளப்',
  '3-Month Streak': '3 மாத ஸ்ட்ரீக்',
  '6-Month Streak': '6 மாத ஸ்ட்ரீக்',
  '12-Month Streak': '12 மாத ஸ்ட்ரீக்',
  'Monsoon Shine': 'மழைக்காலப் பளபளப்பு',
  'Early Bird': 'அதிகாலைப் பறவை',
  'Night Owl': 'இரவு ஆந்தை',
  Explorer: 'தேடல் பிரியர்',
  'Loyal Regular': 'நிரந்தர வாடிக்கையாளர்',
  'Pickup Pro': 'பிக்கப் புரோ',
  'Doorstep Devotee': 'வீட்டு சர்வீஸ் பிரியர்',
  Reviewer: 'மதிப்பாய்வாளர்',
  Ambassador: 'தூதர்',
  'Detailing Devotee': 'டீடெய்லிங் பிரியர்',
  'Coating Club': 'கோட்டிங் கிளப்',
  'Garage Legend': 'Garage லெஜண்ட்',
  'Complete your first booking through Detlio.':
    'Detlio மூலம் உங்கள் முதல் புக்கிங்கை முடியுங்கள்.',
  'Complete 5 bookings through Detlio.':
    'Detlio மூலம் 5 புக்கிங்குகளை முடியுங்கள்.',
  'Complete 25 bookings through Detlio.':
    'Detlio மூலம் 25 புக்கிங்குகளை முடியுங்கள்.',
  'Complete 50 bookings through Detlio.':
    'Detlio மூலம் 50 புக்கிங்குகளை முடியுங்கள்.',
  'Complete 100 bookings through Detlio.':
    'Detlio மூலம் 100 புக்கிங்குகளை முடியுங்கள்.',
  'Book in 3 calendar months in a row.':
    'தொடர்ந்து 3 மாதங்கள் புக் செய்யுங்கள்.',
  'Book in 6 calendar months in a row.':
    'தொடர்ந்து 6 மாதங்கள் புக் செய்யுங்கள்.',
  'Book in 12 calendar months in a row.':
    'தொடர்ந்து 12 மாதங்கள் புக் செய்யுங்கள்.',
  'Book 2 washes between 1 June and 30 September.':
    '1 June முதல் 30 September வரை 2 வாஷ் புக் செய்யுங்கள்.',
  'Book 5 washes that start before 8 am.':
    'காலை 8 மணிக்கு முன் தொடங்கும் 5 வாஷ் புக் செய்யுங்கள்.',
  'Book 5 washes that start at 7 pm or later.':
    'மாலை 7 மணி அல்லது அதற்குப் பிறகு தொடங்கும் 5 வாஷ் புக் செய்யுங்கள்.',
  'Book at 3 different garages.': '3 வெவ்வேறு கேரேஜ்களில் புக் செய்யுங்கள்.',
  'Book 10 times at the same garage.': 'ஒரே கேரேஜில் 10 முறை புக் செய்யுங்கள்.',
  'Complete 3 pickup & drop bookings.':
    '3 பிக்கப் & டிராப் புக்கிங்குகளை முடியுங்கள்.',
  'Complete 5 doorstep bookings.':
    '5 வீட்டுக்கே வந்து செய்யும் புக்கிங்குகளை முடியுங்கள்.',
  'Review 5 of your bookings.':
    'உங்கள் 5 புக்கிங்குகளுக்கு மதிப்பாய்வு எழுதுங்கள்.',
  'Invite 3 friends who book through Detlio.':
    'Detlio மூலம் புக் செய்யும் 3 நண்பர்களை அழையுங்கள்.',
  'Complete 3 detailing jobs.': '3 டீடெய்லிங் வேலைகளை முடியுங்கள்.',
  'Complete a coating job.': 'ஒரு கோட்டிங் வேலையை முடியுங்கள்.',
  'Collect every car in a Detlio Garage series.':
    'Detlio Garage தொடரில் உள்ள எல்லா கார்களையும் சேகரியுங்கள்.',
  '{count} bonus stamps': '{count} போனஸ் ஸ்டாம்ப்கள்',
  '{done} of {count}': '{count}-ல் {done}',
  'Booking completed': 'புக்கிங் முடிந்தது',
  'Scratch card': 'ஸ்கிராட்ச் கார்டு',
  'Challenge prize': 'சவால் பரிசு',
  'Badge bonus': 'பேட்ஜ் போனஸ்',
  'From Detlio': 'Detlio-விடமிருந்து',
  'Cars shown for illustration only. Not affiliated with any car maker.':
    'கார்கள் விளக்கத்துக்காக மட்டுமே காட்டப்படுகின்றன. எந்தக் கார் நிறுவனத்துடனும் தொடர்பு இல்லை.',
  'Your next duplicate makes a bonus stamp':
    'உங்கள் அடுத்த இரட்டை கார்டு ஒரு போனஸ் ஸ்டாம்ப் ஆகும்',
  '{count} more duplicates make a bonus stamp':
    'இன்னும் {count} இரட்டை கார்டுகள் ஒரு போனஸ் ஸ்டாம்ப் ஆகும்',
  'Mystery visit': 'ரகசிய வருகை',
  Inspection: 'ஆய்வு',
  'Passed Detlio’s quality check on {date}':
    '{date} அன்று Detlio தரச் சோதனையில் தேர்ச்சி',
  'Passed Detlio’s quality check': 'Detlio தரச் சோதனையில் தேர்ச்சி',
  'Detlio’s last quality check did not pass. We’ll tell you what to put right.':
    'Detlio-வின் கடைசி தரச் சோதனையில் தேர்ச்சி இல்லை. எதைச் சரிசெய்ய வேண்டும் என்று சொல்வோம்.',
  'Detlio’s quality check is due again (it counts for 6 months).':
    'Detlio தரச் சோதனை மீண்டும் வர வேண்டும் (அது 6 மாதங்களுக்குச் செல்லும்).',
  'Detlio visits in person once you meet the standards below.':
    'கீழே உள்ள தரநிலைகளைப் பூர்த்தி செய்ததும் Detlio நேரில் வரும்.',
  'Detlio garage agreement': 'Detlio கேரேஜ் ஒப்பந்தம்',
  'I agree to the terms': 'விதிமுறைகளை ஏற்கிறேன்',
  'Detlio has updated the garage agreement (v{version}). Accept it by {date} to keep your tier.':
    'Detlio கேரேஜ் ஒப்பந்தத்தைப் புதுப்பித்துள்ளது (v{version}). உங்கள் tier-ஐத் தக்கவைக்க {date}-க்குள் ஏற்கவும்.',
  'Accept the {agreement} to earn Bronze and show customers you are with Detlio.':
    'பிரான்ஸ் பெறவும், நீங்கள் Detlio-வுடன் இருப்பதை வாடிக்கையாளர்களுக்குக் காட்டவும் {agreement}-ஐ ஏற்கவும்.',
  "{name}'s {year} with Detlio": 'Detlio-வுடன் {name}-ன் {year}',
  'My {year} with Detlio': 'Detlio-வுடன் என் {year}',
  'One booking, done right.': 'ஒரு புக்கிங், சரியாக முடிந்தது.',
  'Booked, done and shining.': 'புக் செய்தோம், முடித்தோம், பளபளக்கிறது.',
  'Saved with Detlio Rewards': 'Detlio Rewards மூலம் சேமித்தது',
  'Stamps, scratch cards and rewards, spent well.':
    'ஸ்டாம்ப்கள், ஸ்கிராட்ச் கார்டுகள், ரிவார்டுகள் — நன்றாகப் பயன்பட்டன.',
  'Favourite garage': 'பிடித்த கேரேஜ்',
  '{count} visit this year.': 'இந்த ஆண்டு {count} முறை வருகை.',
  '{count} visits this year.': 'இந்த ஆண்டு {count} முறை வருகை.',
  'Busiest month': 'அதிக புக்கிங் மாதம்',
  '{count} wash that month, and a {streak}-month streak.':
    'அந்த மாதம் {count} வாஷ், {streak} மாத ஸ்ட்ரீக்கும் கூட.',
  '{count} washes that month, and a {streak}-month streak.':
    'அந்த மாதம் {count} வாஷ்கள், {streak} மாத ஸ்ட்ரீக்கும் கூட.',
  '{count} wash that month.': 'அந்த மாதம் {count} வாஷ்.',
  '{count} washes that month.': 'அந்த மாதம் {count} வாஷ்கள்.',
  'Level reached': 'அடைந்த நிலை',
  'Badges are next.': 'அடுத்தது பேட்ஜ்கள்.',
  '{count} badge earned.': '{count} பேட்ஜ் பெற்றீர்கள்.',
  '{count} badges earned.': '{count} பேட்ஜ்கள் பெற்றீர்கள்.',
  'Days your car shone': 'உங்கள் கார் பளபளத்த நாட்கள்',
  'Counting the week after every wash.':
    'ஒவ்வொரு வாஷுக்குப் பின் ஒரு வாரம் கணக்கிட்டு.',
  'That was {year}': 'அதுதான் {year}',
  'Keep shining': 'தொடர்ந்து பளபளக்கட்டும்',
  'Book your next wash on detlio.com':
    'அடுத்த வாஷை detlio.com-ல் புக் செய்யுங்கள்',
  'Book on detlio.com': 'detlio.com-ல் புக் செய்யுங்கள்',
  'Current location': 'தற்போதைய இடம்',
  // ─── The garage's travel choice (0069) and company switcher ───
  'Up to {km} km': '{km} km வரை',
  'All over {city}': '{city} முழுவதும்',
  'the city': 'நகரம்',
  "Any address in {city}, measured from the city's centre.":
    '{city}-ல் எந்த முகவரியும், நகர மையத்திலிருந்து அளக்கப்படும்.',
  'Pin the garage inside a city first to offer this.':
    'இதைத் தர, முதலில் கேரேஜை ஒரு நகரத்துக்குள் பின் செய்யவும்.',
  'Your garages': 'உங்கள் கேரேஜ்கள்',
  // ─── Garage Book: core's helpers (garage-book.ts) ───
  'Write the message first.': 'முதலில் மெசேஜை எழுதவும்.',
  'Keep the message under {max} letters.': 'மெசேஜ் {max} எழுத்துகளுக்குள் இருக்க வேண்டும்.',
  'The message can’t have a link. Write your phone number instead.':
    'மெசேஜில் லிங்க் இருக்கக் கூடாது. அதற்குப் பதிலாக உங்கள் போன் நம்பரை எழுதவும்.',
  'In {days} days · {date}': '{days} நாட்களில் · {date}',
  'Pay later': 'பிறகு தருவார்',
  CASH: 'ரொக்கம்',
  booked: 'புக் ஆனது',
  'in progress': 'நடக்கிறது',
  cancelled: 'ரத்தானது',
  pending: 'நிலுவையில்',
  confirmed: 'உறுதியானது',
  completed: 'முடிந்தது',
  'Done · {amount} owed': 'முடிந்தது · {amount} பாக்கி',
  'Done · Pay later': 'முடிந்தது · பிறகு தருவார்',
  'Done · {pay}': 'முடிந்தது · {pay}',
  'In progress · {nth} visit': 'நடக்கிறது · {nth} வருகை',
  'In progress · {pay}': 'நடக்கிறது · {pay}',
  'Pay later · adds to money owed': 'பிறகு தருவார் · பாக்கியில் சேரும்',
  'Done · {amount} paid online': 'முடிந்தது · {amount} ஆன்லைனில் செலுத்தப்பட்டது',
  'Done · {amount} cash': 'முடிந்தது · {amount} ரொக்கம்',
  'Wash · sent {time}': 'வாஷ் · {time}-க்கு அனுப்பப்பட்டது',
  'Wash · Detlio sends it': 'வாஷ் · Detlio அனுப்பும்',
  'Wash · {days} days · Detlio sends it': 'வாஷ் · {days} நாட்கள் · Detlio அனுப்பும்',
  'Wash since {date}': 'வாஷ் · {date} முதல்',
  'Wash · {days} days since {date}': 'வாஷ் · {date} முதல் {days} நாட்கள்',
  'Wash · {days} days': 'வாஷ் · {days} நாட்கள்',
  '{amount} owed': '{amount} பாக்கி',
  'Via Detlio': 'Detlio வழியாக',
  'Due soon': 'விரைவில் செய்ய வேண்டும்',
  'Last {date}': 'கடைசி: {date}',
  'No visit yet.': 'இன்னும் வரவில்லை.',
  'Due in {days} days.': '{days} நாட்களில் செய்ய வேண்டும்.',
  'Due tomorrow.': 'நாளை செய்ய வேண்டும்.',
  'Due today.': 'இன்று செய்ய வேண்டும்.',
  '{days} days late.': '{days} நாட்கள் தாமதம்.',
  '{count} customer': '{count} வாடிக்கையாளர்',
  '{count} customers': '{count} வாடிக்கையாளர்கள்',
  '{people} · oldest from {date}': '{people} · பழையது {date} முதல்',
}
