/**
 * Tamil for the garage website (apps/vendors), keyed by the exact English it
 * shows. Glossary: ../GLOSSARY.md.
 */
export const garageWeb: Readonly<Record<string, string>> = {
  // ─── Sign-in, crash pages and the shell ───
  'Page not found': 'பக்கம் கிடைக்கவில்லை',
  "This page doesn't exist or has moved.":
    'இந்தப் பக்கம் இல்லை, அல்லது வேறு இடத்துக்கு மாறிவிட்டது.',
  'Go to your dashboard': 'உங்கள் டாஷ்போர்டுக்குச் செல்லவும்',
  'This page hit a problem on our side. Try again, or start over from home.':
    'எங்கள் பக்கத்தில் ஒரு சிக்கல் வந்துவிட்டது. மீண்டும் முயற்சிக்கவும், அல்லது முகப்பிலிருந்து தொடங்கவும்.',
  'Detlio for Partners': 'Detlio பார்ட்னர்களுக்கு',
  'Log in with the number registered for your garage.':
    'உங்கள் கேரேஜுக்குப் பதிவு செய்த நம்பரில் உள்நுழையவும்.',
  'New to Detlio? You can set up your garage once your number is verified.':
    'Detlio-க்குப் புதியவரா? நம்பர் சரிபார்க்கப்பட்டதும் உங்கள் கேரேஜை அமைக்கலாம்.',
  'Accept the Detlio garage agreement': 'Detlio கேரேஜ் ஒப்பந்தத்தை ஏற்கவும்',
  'Free redo claims': 'இலவச ரீடூ கோரிக்கைகள்',
  '{count} to answer within {hours} hours of opening — no answer approves the redo.':
    '{count} கோரிக்கைகளுக்குத் திறந்த நேரத்தில் {hours} மணி நேரத்துக்குள் பதில் சொல்லவும் — பதில் இல்லையென்றால் ரீடூ ஏற்கப்படும்.',
  'Before and after photos on every job are your defence if a customer claims.':
    'வாடிக்கையாளர் கோரிக்கை வைத்தால், ஒவ்வொரு வேலையின் முன்பு, பின்பு போட்டோக்களே உங்கள் ஆதாரம்.',
  'Step {step} of {total}': 'படி {step} / {total}',
  // ─── Job words, alerts and the small job sheets ───
  '{name} is not a photo.': '{name} ஒரு போட்டோ அல்ல.',
  "{name} couldn't be read. Try another photo, or take one with the camera.":
    '{name}-ஐப் படிக்க முடியவில்லை. வேறு போட்டோவைத் தேர்ந்தெடுக்கவும், அல்லது கேமராவில் எடுக்கவும்.',
  "{name} couldn't be prepared for upload.":
    '{name}-ஐ அப்லோடுக்குத் தயார் செய்ய முடியவில்லை.',
  '{name} is too large (max 5 MB).': '{name} மிகப் பெரியது (அதிகபட்சம் 5 MB).',
  Moved: 'மாற்றப்பட்டது',
  'Marked as garage no-show': 'கேரேஜ் வரவில்லை எனக் குறிக்கப்பட்டது',
  'None of your suggested times worked for the customer':
    'நீங்கள் சொன்ன எந்த நேரமும் வாடிக்கையாளருக்குப் பொருந்தவில்லை',
  "The customer didn't pick one of your times in time":
    'வாடிக்கையாளர் நேரத்துக்குள் உங்கள் நேரங்களில் ஒன்றைத் தேர்ந்தெடுக்கவில்லை',
  'Cancelled by you after accepting · counted as a missed booking':
    'ஏற்ற பிறகு நீங்கள் ரத்து செய்தீர்கள் · தவறவிட்ட புக்கிங்காகக் கணக்கிடப்பட்டது',
  'Cancelled by you after accepting': 'ஏற்ற பிறகு நீங்கள் ரத்து செய்தீர்கள்',
  'Rejected by you': 'நீங்கள் நிராகரித்தீர்கள்',
  'Cancelled by customer': 'வாடிக்கையாளர் ரத்து செய்தார்',
  "Cancelled by Detlio at the customer's request":
    'வாடிக்கையாளர் கேட்டதால் Detlio ரத்து செய்தது',
  'Cancelled by Detlio at your request':
    'நீங்கள் கேட்டதால் Detlio ரத்து செய்தது',
  'Cancelled by Detlio': 'Detlio ரத்து செய்தது',
  'The customer': 'வாடிக்கையாளர்',
  'the customer': 'வாடிக்கையாளர்',
  'Booking rejected': 'புக்கிங் நிராகரிக்கப்பட்டது',
  'Could not reject this booking': 'இந்த புக்கிங்கை நிராகரிக்க முடியவில்லை',
  "Can't do this booking?": 'இந்த புக்கிங்கைச் செய்ய முடியாதா?',
  "{who} gets a full refund, and we tell them you can't take it.":
    '{who}-க்கு முழுப் பணமும் திருப்பித் தரப்படும், நீங்கள் எடுக்க முடியாது என்று நாங்கள் சொல்லிவிடுவோம்.',
  "We tell {who} you can't take it.":
    'நீங்கள் எடுக்க முடியாது என்று {who}-இடம் நாங்கள் சொல்லிவிடுவோம்.',
  'Reason for rejecting (optional)': 'நிராகரிக்கும் காரணம் (விருப்பம்)',
  'Reject booking': 'புக்கிங்கை நிராகரிக்கவும்',
  Keep: 'வைத்திருக்கவும்',
  Open: 'திறந்துள்ளது',
  'Alerts: Off': 'அலர்ட்: ஆஃப்',
  'left to answer': 'பதில் சொல்ல மீதம்',
  'New-booking alerts': 'புதிய புக்கிங் அலர்ட்',
  '{off} on this phone': 'இந்த போனில் {off}',
  'Booking alerts are off': 'புக்கிங் அலர்ட் ஆஃப்-இல் உள்ளது',
  'Turn on': 'ஆன் செய்யவும்',
  How: 'எப்படி',
  Why: 'ஏன்',
  'Say why you are cancelling, so Detlio can help the customer.':
    'ஏன் ரத்து செய்கிறீர்கள் என்று சொல்லுங்கள், அப்போதுதான் Detlio வாடிக்கையாளருக்கு உதவ முடியும்.',
  'Booking cancelled': 'புக்கிங் ரத்து செய்யப்பட்டது',
  'Could not cancel this booking': 'இந்த புக்கிங்கை ரத்து செய்ய முடியவில்லை',
  'Cancel booking for {name}': '{name}-இன் புக்கிங்கை ரத்து செய்யவும்',
  'Cancel booking': 'புக்கிங்கை ரத்து செய்யவும்',
  'Cancel this booking?': 'இந்த புக்கிங்கை ரத்து செய்யவா?',
  '{who} gets a full refund, and we tell them you had to cancel.':
    '{who}-க்கு முழுப் பணமும் திருப்பித் தரப்படும், நீங்கள் ரத்து செய்ய வேண்டியதாயிற்று என்று நாங்கள் சொல்லிவிடுவோம்.',
  'We tell {who} you had to cancel.':
    'நீங்கள் ரத்து செய்ய வேண்டியதாயிற்று என்று {who}-இடம் நாங்கள் சொல்லிவிடுவோம்.',
  'This is within {hours} hours of the booking, so it counts as a missed booking for your medal.':
    'இது புக்கிங்குக்கு {hours} மணி நேரத்துக்குள், அதனால் உங்கள் மெடலுக்கு இது தவறவிட்ட புக்கிங்காகக் கணக்கிடப்படும்.',
  "More than {hours} hours before the booking, it counts like a booking you couldn't take.":
    'புக்கிங்குக்கு {hours} மணி நேரத்துக்கு மேல் முன்பு என்றால், நீங்கள் எடுக்க முடியாத புக்கிங் போலக் கணக்கிடப்படும்.',
  'Why are you cancelling?': 'ஏன் ரத்து செய்கிறீர்கள்?',
  'Keep booking': 'புக்கிங்கை வைத்திருக்கவும்',
  // ─── Job rows, steps and the tier card ───
  "Customer's number shows from {time}":
    'வாடிக்கையாளரின் நம்பர் {time} முதல் தெரியும்',
  "Customer's number shows from {time} tomorrow":
    'வாடிக்கையாளரின் நம்பர் நாளை {time} முதல் தெரியும்',
  "Customer's number shows from {time} on {day}":
    'வாடிக்கையாளரின் நம்பர் {day} அன்று {time} முதல் தெரியும்',
  'Waiting for {name} to answer the extra work':
    'கூடுதல் வேலைக்கு {name} பதில் சொல்லக் காத்திருக்கிறது',
  'Before photos {have}/{need}': 'முன்பு போட்டோக்கள் {have}/{need}',
  'After photos {have}/{need}': 'பின்பு போட்டோக்கள் {have}/{need}',
  'Start job': 'வேலையைத் தொடங்கவும்',
  'Complete job': 'வேலையை முடிக்கவும்',
  'Next: {step}': 'அடுத்து: {step}',
  '{name} to answer the extra work':
    'கூடுதல் வேலைக்கு {name} பதில் சொல்ல வேண்டும்',
  Working: 'நடக்கிறது',
  'Booking accepted': 'புக்கிங் ஏற்கப்பட்டது',
  'Job started': 'வேலை தொடங்கியது',
  'Job completed': 'வேலை முடிந்தது',
  'Accepting the booking…': 'புக்கிங்கை ஏற்கிறது…',
  'Starting the job…': 'வேலையைத் தொடங்குகிறது…',
  'Completing the job…': 'வேலையை முடிக்கிறது…',
  'Marking picked up…': 'எடுத்துச் சென்றதாகக் குறிக்கிறது…',
  'Marking at garage…': 'கேரேஜில் இருப்பதாகக் குறிக்கிறது…',
  'Marking out for delivery…': 'டெலிவரிக்குப் புறப்பட்டதாகக் குறிக்கிறது…',
  'Could not update this job': 'இந்த வேலையை அப்டேட் செய்ய முடியவில்லை',
  'Already saved: it can no longer be undone.':
    'ஏற்கனவே சேமிக்கப்பட்டது: இனி திரும்ப மாற்ற முடியாது.',
  'To do': 'செய்ய வேண்டியது',
  'Needs: {target}': 'தேவை: {target}',
  'Your tier': 'உங்கள் டியர்',
  "You're {tier}": 'நீங்கள் {tier}',
  'No tier yet': 'இன்னும் டியர் இல்லை',
  'Next: {tier}, {done} of {total} done':
    'அடுத்து: {tier}, {total}-இல் {done} முடிந்தது',
  'That’s the top tier. Keep meeting the standards to keep it.':
    'இதுதான் உயர்ந்த டியர். இதைத் தக்கவைக்கத் தரங்களைத் தொடர்ந்து பின்பற்றவும்.',
  'Progress to {tier}': '{tier} நோக்கிய முன்னேற்றம்',
  'You don’t meet every {tier} standard right now. Put it right by {date} to keep {tier}.':
    'இப்போது {tier}-இன் எல்லாத் தரங்களையும் நீங்கள் பூர்த்தி செய்யவில்லை. {tier}-ஐத் தக்கவைக்க {date}-க்குள் சரிசெய்யவும்.',
  'To keep {tier}': '{tier}-ஐத் தக்கவைக்க',
  'Steps to {tier}': '{tier}-க்கான படிகள்',
  'When every step is done, Detlio visits in person and awards Gold.':
    'எல்லாப் படிகளும் முடிந்ததும், Detlio நேரில் வந்து பார்த்து கோல்டு வழங்கும்.',
  'Collect from and return to': 'எடுக்கும், திருப்பித் தரும் இடம்',
  'No map pin on this address. Call to confirm the spot.':
    'இந்த முகவரிக்கு மேப் பின் இல்லை. சரியான இடத்தை போன் செய்து உறுதிசெய்யவும்.',
  'Open in Maps for {who}': '{who}-இன் இடத்தை மேப்ஸில் திறக்கவும்',
  'Open in Maps': 'மேப்ஸில் திறக்கவும்',
  'Need to reach the customer? {link}':
    'வாடிக்கையாளரைத் தொடர்புகொள்ள வேண்டுமா? {link}',
  'Contact Detlio support': 'Detlio சப்போர்ட்டைத் தொடர்புகொள்ளவும்',
  'Job for {who}': '{who}-இன் வேலை',
  '{action} for {who}': '{who}: {action}',
  "Ask the customer for the 4-digit pickup code in their Detlio app. From now until the car is back, it's in your care.":
    'வாடிக்கையாளரின் Detlio ஆப்பில் உள்ள 4 இலக்கப் பிக்கப் கோடைக் கேட்கவும். இப்போதிலிருந்து கார் திரும்பும் வரை அது உங்கள் பொறுப்பு.',
  'Press when the car arrives at your garage.':
    'கார் உங்கள் கேரேஜுக்கு வந்ததும் அழுத்தவும்.',
  'Start the work on the car.': 'காரில் வேலையைத் தொடங்கவும்.',
  'Press when the work is done and the car leaves to go back to the customer.':
    'வேலை முடிந்து, கார் வாடிக்கையாளரிடம் திரும்பப் புறப்படும்போது அழுத்தவும்.',
  'Ask the customer for the 4-digit delivery code in their Detlio app. This finishes the job.':
    'வாடிக்கையாளரின் Detlio ஆப்பில் உள்ள 4 இலக்க டெலிவரி கோடைக் கேட்கவும். இதோடு வேலை முடியும்.',
  'this customer': 'இந்த வாடிக்கையாளர்',
  '{step} marked': '{step} எனக் குறிக்கப்பட்டது',
  'Could not update this booking': 'இந்த புக்கிங்கை அப்டேட் செய்ய முடியவில்லை',
  "Customer's pickup code": 'வாடிக்கையாளரின் பிக்கப் கோட்',
  "Customer's delivery code": 'வாடிக்கையாளரின் டெலிவரி கோட்',
  '4 digits': '4 இலக்கங்கள்',
  'Too many wrong codes. Call Detlio support on {phone}: we can confirm the handover once we have spoken to the customer.':
    'தவறான கோட் பல முறை போடப்பட்டது. Detlio சப்போர்ட்டை {phone}-இல் அழைக்கவும்: வாடிக்கையாளரிடம் பேசிய பிறகு நாங்கள் ஒப்படைப்பை உறுதிசெய்வோம்.',
  'Start job for {who}': '{who}-இன் வேலையைத் தொடங்கவும்',
  'Mark {step} for {who}': '{who}: {step} எனக் குறிக்கவும்',
  '{count} try left.': 'இன்னும் {count} முறை முயற்சிக்கலாம்.',
  '{count} tries left.': 'இன்னும் {count} முறை முயற்சிக்கலாம்.',
  // ─── A new booking's card ───
  'New booking from {who}': '{who}-இடமிருந்து புதிய புக்கிங்',
  'Details of the booking for {who}': '{who}-இன் புக்கிங் விவரங்கள்',
  'Free redo · nothing to collect': 'இலவச ரீடூ · வசூலிக்க எதுவும் இல்லை',
  'The customer moved this booking to a new time. Accept it if you can do it.':
    'வாடிக்கையாளர் இந்த புக்கிங்கை வேறு நேரத்துக்கு மாற்றியுள்ளார். உங்களால் முடிந்தால் ஏற்கவும்.',
  "This slot's time has passed without being accepted. Reject it so the customer can be refunded.":
    'ஏற்கப்படாமலேயே இந்த ஸ்லாட்டின் நேரம் கடந்துவிட்டது. வாடிக்கையாளருக்குப் பணம் திருப்பித் தரப்பட நிராகரிக்கவும்.',
  "Can't do: reject booking for {who}":
    'முடியாது: {who}-இன் புக்கிங்கை நிராகரிக்கவும்',
  "Can't do": 'முடியாது',
  'Accept booking for {who}': '{who}-இன் புக்கிங்கை ஏற்கவும்',
  // ─── Suggesting other times ───
  'Suggested times withdrawn. Accept or reject the booking as usual.':
    'சொன்ன நேரங்கள் திரும்பப் பெறப்பட்டன. வழக்கம்போல் புக்கிங்கை ஏற்கவும் அல்லது நிராகரிக்கவும்.',
  'Could not withdraw the times': 'நேரங்களைத் திரும்பப் பெற முடியவில்லை',
  'Waiting for {who} to pick a time':
    '{who} நேரத்தைத் தேர்ந்தெடுக்கக் காத்திருக்கிறது',
  "If {who} doesn't pick one by {time}, the booking is cancelled and refunded in full.":
    '{time}-க்குள் {who} ஒன்றைத் தேர்ந்தெடுக்கவில்லை என்றால், புக்கிங் ரத்தாகி முழுப் பணமும் திருப்பித் தரப்படும்.',
  'Withdraw suggested times for {who}':
    '{who}-க்குச் சொன்ன நேரங்களைத் திரும்பப் பெறவும்',
  'Withdrawing…': 'திரும்பப் பெறுகிறது…',
  'Withdraw times': 'நேரங்களைத் திரும்பப் பெறவும்',
  "{who} didn't pick one of your times in time, so this booking is being cancelled and refunded.":
    '{who} நேரத்துக்குள் உங்கள் நேரங்களில் ஒன்றைத் தேர்ந்தெடுக்கவில்லை, அதனால் இந்த புக்கிங் ரத்தாகி பணம் திருப்பித் தரப்படுகிறது.',
  'Other time: suggest another time for {who}':
    'வேறு நேரம்: {who}-க்கு வேறு நேரத்தைச் சொல்லவும்',
  'Other time': 'வேறு நேரம்',
  'Could not load the times': 'நேரங்களை ஏற்ற முடியவில்லை',
  "You've paused new bookings, so there are no times to offer.":
    'புதிய புக்கிங்குகளை நிறுத்தி வைத்துள்ளீர்கள், அதனால் சொல்ல நேரங்கள் இல்லை.',
  'Closed this day.': 'இந்த நாள் விடுமுறை.',
  'Every time this day is booked up.':
    'இந்த நாளின் எல்லா நேரங்களும் புக் ஆகிவிட்டன.',
  'No times left this day.': 'இந்த நாளில் நேரம் எதுவும் மீதமில்லை.',
  'Times sent. {who} picks one in the Detlio app.':
    'நேரங்கள் அனுப்பப்பட்டன. {who} Detlio ஆப்பில் ஒன்றைத் தேர்ந்தெடுப்பார்.',
  'Could not send the times': 'நேரங்களை அனுப்ப முடியவில்லை',
  'Suggest another time for {who}': '{who}-க்கு வேறு நேரத்தைச் சொல்லவும்',
  'Suggest another time': 'வேறு நேரத்தைச் சொல்லவும்',
  "Can't do {time}? Pick up to {max} times you can do. {who} picks one in the app and it's booked straight away.":
    '{time} முடியாதா? உங்களால் முடிந்த {max} நேரங்கள் வரை தேர்ந்தெடுக்கவும். {who} ஆப்பில் ஒன்றைத் தேர்ந்தெடுத்ததும் உடனே புக் ஆகிவிடும்.',
  Day: 'நாள்',
  Time: 'நேரம்',
  'Loading times': 'நேரங்களை ஏற்றுகிறது',
  'Offering {count} of {max}': '{max}-இல் {count} நேரங்கள்',
  'Note for the customer (optional)':
    'வாடிக்கையாளருக்குக் குறிப்பு (விருப்பம்)',
  "If {who} doesn't answer in time (at most 12 hours), the booking is cancelled and refunded in full.":
    '{who} நேரத்துக்குள் (அதிகபட்சம் 12 மணி நேரம்) பதில் சொல்லவில்லை என்றால், புக்கிங் ரத்தாகி முழுப் பணமும் திருப்பித் தரப்படும்.',
  'Pick at least one time': 'குறைந்தது ஒரு நேரத்தைத் தேர்ந்தெடுக்கவும்',
  'Sending…': 'அனுப்புகிறது…',
  'Send {count} times': '{count} நேரங்களை அனுப்பவும்',
  'Send time': 'நேரத்தை அனுப்பவும்',
  // ─── Close my garage, leave, delete my account ───
  'Say why you want to close the garage.':
    'கேரேஜை ஏன் மூட விரும்புகிறீர்கள் என்று சொல்லுங்கள்.',
  'Request sent. Detlio will call you.':
    'கோரிக்கை அனுப்பப்பட்டது. Detlio உங்களை அழைக்கும்.',
  'Could not send the request': 'கோரிக்கையை அனுப்ப முடியவில்லை',
  'Close my garage': 'என் கேரேஜை மூடவும்',
  'You asked to close {garage} on {date}. Detlio will call you before anything changes.':
    '{garage}-ஐ மூட {date} அன்று கேட்டீர்கள். எதுவும் மாறும் முன் Detlio உங்களை அழைக்கும்.',
  'Cancel the request': 'கோரிக்கையை ரத்து செய்யவும்',
  'Stopping for good? Ask Detlio to close {garage}. We call you first; your bookings still to come are cancelled and refunded, and the garage leaves Detlio. You can cancel the request until we act.':
    'நிரந்தரமாக நிறுத்துகிறீர்களா? {garage}-ஐ மூட Detlio-விடம் கேளுங்கள். முதலில் நாங்கள் உங்களை அழைப்போம்; வரவிருக்கும் புக்கிங்குகள் ரத்தாகி பணம் திருப்பித் தரப்படும், கேரேஜ் Detlio-விலிருந்து விலகும். நாங்கள் நடவடிக்கை எடுக்கும் வரை கோரிக்கையை ரத்து செய்யலாம்.',
  'Close {garage}?': '{garage}-ஐ மூடவா?',
  'This asks Detlio to close the garage. Nothing changes until we call you.':
    'இது கேரேஜை மூட Detlio-விடம் கேட்கும். நாங்கள் அழைக்கும் வரை எதுவும் மாறாது.',
  'Why are you closing?': 'ஏன் மூடுகிறீர்கள்?',
  'Send request': 'கோரிக்கையை அனுப்பவும்',
  'Keep the garage open': 'கேரேஜைத் திறந்தே வைக்கவும்',
  'Request cancelled. Your garage stays open.':
    'கோரிக்கை ரத்து செய்யப்பட்டது. உங்கள் கேரேஜ் திறந்தே இருக்கும்.',
  'Could not cancel the request': 'கோரிக்கையை ரத்து செய்ய முடியவில்லை',
  'Keep your garage open?': 'உங்கள் கேரேஜைத் திறந்தே வைக்கவா?',
  'This cancels your request to close the garage.':
    'இது கேரேஜை மூடும் உங்கள் கோரிக்கையை ரத்து செய்யும்.',
  'Leave this garage': 'இந்த கேரேஜிலிருந்து விலகவும்',
  'Stop working with {garage} on Detlio. You lose access to its bookings; the owner can add you again.':
    'Detlio-வில் {garage}-உடன் வேலை செய்வதை நிறுத்தவும். அதன் புக்கிங்குகளைப் பார்க்க முடியாது; உரிமையாளர் உங்களை மீண்டும் சேர்க்கலாம்.',
  'Leave {garage}': '{garage}-இலிருந்து விலகவும்',
  'You left {garage}': 'நீங்கள் {garage}-இலிருந்து விலகிவிட்டீர்கள்',
  'Could not leave the garage': 'கேரேஜிலிருந்து விலக முடியவில்லை',
  'Leave {garage}?': '{garage}-இலிருந்து விலகவா?',
  "You'll no longer see its bookings or act for it.":
    'இனி அதன் புக்கிங்குகளைப் பார்க்கவோ அதற்காகச் செயல்படவோ முடியாது.',
  'Leave garage': 'கேரேஜிலிருந்து விலகவும்',
  Stay: 'தொடர்ந்து இருக்கவும்',
  'Could not check your account':
    'உங்கள் கணக்கைச் சரிபார்க்க முடியவில்லை',
  'Could not delete your account': 'உங்கள் கணக்கை நீக்க முடியவில்லை',
  'Delete my account': 'என் கணக்கை நீக்கவும்',
  "Deletes your login on Detlio: your name, number and every garage you can open here. Jobs you did stay on the garages' records, without your name.":
    'Detlio-வில் உங்கள் லாகினை நீக்கும்: உங்கள் பெயர், நம்பர், இங்கே நீங்கள் திறக்கும் எல்லா கேரேஜ்களும். நீங்கள் செய்த வேலைகள் உங்கள் பெயர் இல்லாமல் கேரேஜ்களின் பதிவில் இருக்கும்.',
  'Checking your account…': 'உங்கள் கணக்கைச் சரிபார்க்கிறது…',
  'Before you can delete': 'நீக்கும் முன்',
  "You leave every garage, and you're signed out on every device. This can't be undone.":
    'எல்லா கேரேஜ்களிலிருந்தும் விலகுவீர்கள், எல்லா டிவைஸ்களிலும் வெளியேற்றப்படுவீர்கள். இதைத் திரும்ப மாற்ற முடியாது.',
  'Deleting…': 'நீக்குகிறது…',
  'Keep my account': 'என் கணக்கை வைத்திருக்கவும்',
  // ─── Extra work ───
  'Waiting for customer': 'வாடிக்கையாளர் பதிலுக்காக',
  'Approved & paid — go ahead': 'ஏற்கப்பட்டு பணம் செலுத்தப்பட்டது — தொடங்கலாம்',
  'Declined by customer': 'வாடிக்கையாளர் மறுத்தார்',
  Withdrawn: 'திரும்பப் பெறப்பட்டது',
  'Closed with the booking': 'புக்கிங்குடன் மூடப்பட்டது',
  'Say what the extra work is.': 'கூடுதல் வேலை என்ன என்று சொல்லுங்கள்.',
  'Give a price of at least ₹1.': 'குறைந்தது ₹1 விலை கொடுக்கவும்.',
  'Use at most two decimals.': 'அதிகபட்சம் இரண்டு தசம இலக்கங்கள் மட்டும்.',
  'Extra work withdrawn.': 'கூடுதல் வேலை திரும்பப் பெறப்பட்டது.',
  'Could not withdraw it': 'திரும்பப் பெற முடியவில்லை',
  'This job is priced on inspection: add any extra work to its final bill.':
    'இந்த வேலையின் விலை பரிசோதனைக்குப் பிறகு: கூடுதல் வேலையை அதன் இறுதி பில்லில் சேர்க்கவும்.',
  '{who} has 3 requests to answer. Wait for an answer, or withdraw one, to ask for more.':
    '{who} பதில் சொல்ல 3 கோரிக்கைகள் உள்ளன. மேலும் கேட்க, பதிலுக்குக் காத்திருக்கவும் அல்லது ஒன்றைத் திரும்பப் பெறவும்.',
  'Extra work': 'கூடுதல் வேலை',
  'Found more to do? Ask the customer':
    'இன்னும் செய்ய வேண்டியது இருக்கிறதா? வாடிக்கையாளரிடம் கேட்கவும்',
  'Extra work for {who}': '{who}-க்கான கூடுதல் வேலை',
  'Ask {who} for extra work': 'கூடுதல் வேலைக்கு {who}-இடம் கேட்கவும்',
  '{count} photo': '{count} போட்டோ',
  '{count} photos': '{count} போட்டோக்கள்',
  'Withdraw extra work {work} for {who}':
    '{who}-க்கான கூடுதல் வேலை {work}-ஐத் திரும்பப் பெறவும்',
  Withdraw: 'திரும்பப் பெறவும்',
  'Ask for extra work': 'கூடுதல் வேலைக்குக் கேட்கவும்',
  'That photo could not be used': 'அந்த போட்டோவைப் பயன்படுத்த முடியவில்லை',
  'Sent. {who} can approve and pay {amount} in the Detlio app.':
    'அனுப்பப்பட்டது. {who} Detlio ஆப்பில் ஏற்று {amount} செலுத்தலாம்.',
  'Could not send it': 'அனுப்ப முடியவில்லை',
  "{who} approves it by paying in the Detlio app. Don't start it until it says Approved & paid.":
    '{who} Detlio ஆப்பில் பணம் செலுத்தி ஏற்பார். "ஏற்கப்பட்டு பணம் செலுத்தப்பட்டது" என்று காட்டும் வரை தொடங்க வேண்டாம்.',
  'What needs doing': 'என்ன செய்ய வேண்டும்',
  'e.g. Replace front brake pads': 'எ.கா. முன் பிரேக் பேட்களை மாற்றுதல்',
  'Price (₹)': 'விலை (₹)',
  'Price in rupees': 'ரூபாயில் விலை',
  Photos: 'போட்டோக்கள்',
  'Optional. Show the customer what you found.':
    'விருப்பம். நீங்கள் கண்டதை வாடிக்கையாளருக்குக் காட்டவும்.',
  'Remove photo {n}': 'போட்டோ {n}-ஐ நீக்கவும்',
  'Add photos of the extra work': 'கூடுதல் வேலையின் போட்டோக்களைச் சேர்க்கவும்',
  'Send to customer': 'வாடிக்கையாளருக்கு அனுப்பவும்',
  // ─── The final bill ───
  'Describe every line.': 'ஒவ்வொரு வரியையும் விவரிக்கவும்.',
  'Keep each line under {max} characters.':
    'ஒவ்வொரு வரியும் {max} எழுத்துகளுக்குள் இருக்கட்டும்.',
  'Give every line an amount in rupees.':
    'ஒவ்வொரு வரிக்கும் ரூபாயில் தொகை கொடுக்கவும்.',
  'The bill must come to at least ₹1.': 'பில் குறைந்தது ₹1 ஆக இருக்க வேண்டும்.',
  'Final bill saved. {who} can pay {amount} from their booking in the Detlio app.':
    'இறுதி பில் சேமிக்கப்பட்டது. {who} Detlio ஆப்பில் தங்கள் புக்கிங்கிலிருந்து {amount} செலுத்தலாம்.',
  'Final bill saved. Nothing more to pay.':
    'இறுதி பில் சேமிக்கப்பட்டது. மேலும் செலுத்த எதுவும் இல்லை.',
  'Could not send the bill': 'பில்லை அனுப்ப முடியவில்லை',
  'Final bill': 'இறுதி பில்',
  'Paid in app': 'ஆப்பில் செலுத்தப்பட்டது',
  'Customer pays': 'வாடிக்கையாளர் செலுத்துவது',
  'Replace final bill for {who}': '{who}-இன் இறுதி பில்லை மாற்றவும்',
  'Raise final bill': 'இறுதி பில் போடவும்',
  'Not sent yet · the job is priced on inspection':
    'இன்னும் அனுப்பவில்லை · இந்த வேலையின் விலை பரிசோதனைக்குப் பிறகு',
  'Raise final bill for {who}': '{who}-க்கு இறுதி பில் போடவும்',
  'Final bill for {who}': '{who}-இன் இறுதி பில்',
  'The bill is for the whole job: the services booked, plus the work and parts.':
    'பில் முழு வேலைக்கும்: புக் செய்த சர்வீஸ்கள், கூடவே வேலையும் பார்ட்ஸும்.',
  '{who} paid {amount} at booking and pays anything above that in the Detlio app.':
    '{who} புக்கிங்கின்போது {amount} செலுத்தினார், அதற்கு மேல் உள்ளதை Detlio ஆப்பில் செலுத்துவார்.',
  '{who} pays it in the Detlio app.': '{who} இதை Detlio ஆப்பில் செலுத்துவார்.',
  'Paid at booking for:': 'புக்கிங்கின்போது செலுத்தியது:',
  'Line {n}': 'வரி {n}',
  'e.g. Rear bumper dent repair': 'எ.கா. பின் பம்பர் டென்ட் சரிசெய்தல்',
  'Amount (₹)': 'தொகை (₹)',
  'Line {n} amount in rupees': 'வரி {n}-இன் தொகை ரூபாயில்',
  'Remove line {n}': 'வரி {n}-ஐ நீக்கவும்',
  'Add line': 'வரியைச் சேர்க்கவும்',
  'Paid at booking': 'புக்கிங்கின்போது செலுத்தியது',
  'Customer pays in the app': 'வாடிக்கையாளர் ஆப்பில் செலுத்துவது',
  'Nothing more to pay': 'மேலும் செலுத்த எதுவும் இல்லை',
  'Send new bill': 'புதிய பில்லை அனுப்பவும்',
  'Send final bill': 'இறுதி பில்லை அனுப்பவும்',
  // ─── Job photos ───
  'Walk round the car before you start: at least {count} photos, any marks up close.':
    'தொடங்கும் முன் காரைச் சுற்றி வந்து போட்டோ எடுக்கவும்: குறைந்தது {count} போட்டோக்கள், ஏதாவது கீறல் இருந்தால் அருகில்.',
  'The finished work, before the car goes back: at least {count} photos.':
    'முடிந்த வேலை, கார் திரும்பும் முன்: குறைந்தது {count} போட்டோக்கள்.',
  'Optional. The car as it came in, if anything is already marked.':
    'விருப்பம். ஏற்கனவே ஏதாவது கீறல் இருந்தால், கார் வந்த நிலையில்.',
  'Optional. The finished work, before the car goes back.':
    'விருப்பம். கார் திரும்பும் முன், முடிந்த வேலை.',
  'Recommended: the car as you collect it, every side and any marks. They are your record of how it was handed over.':
    'பரிந்துரை: நீங்கள் எடுக்கும்போது கார் இருக்கும் நிலை, எல்லாப் பக்கமும், ஏதாவது கீறல்களும். கார் எப்படி ஒப்படைக்கப்பட்டது என்பதற்கு இவையே உங்கள் பதிவு.',
  Left: 'இடது',
  Right: 'வலது',
  Inside: 'உள்ளே',
  '{angle} before photo for {who}': '{who}-இன் {angle} முன்பு போட்டோ',
  '{angle} after photo for {who}': '{who}-இன் {angle} பின்பு போட்டோ',
  'Upload failed': 'அப்லோட் தோல்வியடைந்தது',
  'Could not remove this photo': 'இந்த போட்டோவை நீக்க முடியவில்லை',
  'Add {angle} before photo for {who}':
    '{who}-இன் {angle} முன்பு போட்டோவைச் சேர்க்கவும்',
  'Add {angle} after photo for {who}':
    '{who}-இன் {angle} பின்பு போட்டோவைச் சேர்க்கவும்',
  'Add before photos for {who}': '{who}-இன் முன்பு போட்டோக்களைச் சேர்க்கவும்',
  'Add after photos for {who}': '{who}-இன் பின்பு போட்டோக்களைச் சேர்க்கவும்',
  'Before photos': 'முன்பு போட்டோக்கள்',
  'After photos': 'பின்பு போட்டோக்கள்',
  'Photos protect you if a customer complains, and count toward Gold.':
    'வாடிக்கையாளர் புகார் செய்தால் போட்டோக்கள் உங்களைக் காக்கும், கோல்டுக்கும் கணக்கில் வரும்.',
  'Closed once the job was completed.': 'வேலை முடிந்ததும் மூடப்பட்டது.',
  'Closed an hour after the job was completed.':
    'வேலை முடிந்து ஒரு மணி நேரம் கழித்து மூடப்பட்டது.',
  'extra before photo {n} for {who}': '{who}-இன் கூடுதல் முன்பு போட்டோ {n}',
  'extra after photo {n} for {who}': '{who}-இன் கூடுதல் பின்பு போட்டோ {n}',
  More: 'மேலும்',
  'From {who}': '{who} அனுப்பியவை',
  "customer's before photo {n}": 'வாடிக்கையாளரின் முன்பு போட்டோ {n}',
  "customer's after photo {n}": 'வாடிக்கையாளரின் பின்பு போட்டோ {n}',
  'Job photo': 'வேலை போட்டோ',
  'Remove this before photo? It is your record of the job if the customer questions the work later.':
    'இந்த முன்பு போட்டோவை நீக்கவா? வாடிக்கையாளர் பிறகு வேலையைப் பற்றிக் கேள்வி கேட்டால், இதுவே உங்கள் பதிவு.',
  'Remove this after photo? It is your record of the job if the customer questions the work later.':
    'இந்த பின்பு போட்டோவை நீக்கவா? வாடிக்கையாளர் பிறகு வேலையைப் பற்றிக் கேள்வி கேட்டால், இதுவே உங்கள் பதிவு.',
  'Remove {photo}': '{photo}-ஐ நீக்கவும்',
  'Removing…': 'நீக்குகிறது…',
  'Remove photo': 'போட்டோவை நீக்கவும்',
  // ─── Home ───
  'Set your garage location': 'உங்கள் கேரேஜ் லொக்கேஷனை அமைக்கவும்',
  "Customers can't find you until your garage is on the map, and we can't show you to customers without it. Tap to pin it.":
    'உங்கள் கேரேஜ் மேப்பில் வரும் வரை வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிக்க முடியாது, அது இல்லாமல் நாங்களும் உங்களைக் காட்ட முடியாது. பின் செய்யத் தட்டவும்.',
  'Not shown to customers yet':
    'இன்னும் வாடிக்கையாளர்களுக்குக் காட்டப்படவில்லை',
  "Detlio is checking your garage. You'll be told once customers can find you.":
    'Detlio உங்கள் கேரேஜைச் சரிபார்க்கிறது. வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிக்க முடிந்ததும் உங்களுக்குத் தெரிவிக்கப்படும்.',
  'New bookings are paused': 'புதிய புக்கிங்குகள் நிறுத்தி வைக்கப்பட்டுள்ளன',
  "Customers can't find or book you. Bookings you already have stay as they are. Tap to resume in Settings.":
    'வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிக்கவோ புக் செய்யவோ முடியாது. ஏற்கனவே உள்ள புக்கிங்குகள் அப்படியே இருக்கும். அமைப்புகளில் மீண்டும் தொடங்கத் தட்டவும்.',
  "Customers can't find or book this garage. Bookings already made stay as they are.":
    'வாடிக்கையாளர்கள் இந்த கேரேஜைக் கண்டுபிடிக்கவோ புக் செய்யவோ முடியாது. ஏற்கனவே செய்த புக்கிங்குகள் அப்படியே இருக்கும்.',
  'Waiting for your answer': 'உங்கள் பதில் தேவை',
  'See all': 'எல்லாம் பார்க்கவும்',
  'your bookings': 'உங்கள் புக்கிங்குகள்',
  'No new bookings. They show here the moment a customer pays.':
    'புதிய புக்கிங் இல்லை. வாடிக்கையாளர் பணம் செலுத்தியவுடன் இங்கே தெரியும்.',
  'See all {count} new bookings': '{count} புதிய புக்கிங்குகளையும் பார்க்கவும்',
  "Today's jobs: unknown. Open Today":
    'இன்றைய வேலைகள்: தெரியவில்லை. இன்று திறக்கவும்',
  "Today's jobs: {count}. Open Today":
    'இன்றைய வேலைகள்: {count}. இன்று திறக்கவும்',
  "Today's jobs": 'இன்றைய வேலைகள்',
  '{count} under way': '{count} நடக்கிறது',
  'This week: not loaded. Open Earnings':
    'இந்த வாரம்: ஏற்றப்படவில்லை. வருமானம் திறக்கவும்',
  'This week: {amount}. Open Earnings':
    'இந்த வாரம்: {amount}. வருமானம் திறக்கவும்',
  'Average rating: not loaded. See reviews':
    'சராசரி ரேட்டிங்: ஏற்றப்படவில்லை. மதிப்பாய்வுகளைப் பார்க்கவும்',
  'Average rating: no reviews yet. See reviews':
    'சராசரி ரேட்டிங்: இன்னும் மதிப்பாய்வு இல்லை. மதிப்பாய்வுகளைப் பார்க்கவும்',
  'Average rating: {label}, {reviews}. See reviews':
    'சராசரி ரேட்டிங்: {label}, {reviews}. மதிப்பாய்வுகளைப் பார்க்கவும்',
  'Average rating {rating} from {reviews}. See reviews':
    '{reviews}-இலிருந்து சராசரி ரேட்டிங் {rating}. மதிப்பாய்வுகளைப் பார்க்கவும்',
  'Avg rating': 'சராசரி ரேட்டிங்',
  "Couldn't load": 'ஏற்ற முடியவில்லை',
  'Your account': 'உங்கள் கணக்கு',
  Requests: 'கோரிக்கைகள்',
  '{count} request waiting · answer within {hours} h':
    '{count} கோரிக்கை காத்திருக்கிறது · {hours} h-க்குள் பதில் சொல்லவும்',
  '{count} requests waiting · answer within {hours} h':
    '{count} கோரிக்கைகள் காத்திருக்கின்றன · {hours} h-க்குள் பதில் சொல்லவும்',
  // ─── Bookings ───
  Later: 'பிறகு',
  'Nothing on today': 'இன்று எதுவும் இல்லை',
  'Jobs you accept for today show here, in time order.':
    'இன்றைக்கு நீங்கள் ஏற்கும் வேலைகள் நேர வரிசையில் இங்கே தெரியும்.',
  'No new bookings': 'புதிய புக்கிங் இல்லை',
  'New requests from customers show up here for you to accept.':
    'வாடிக்கையாளர்களின் புதிய கோரிக்கைகள் நீங்கள் ஏற்க இங்கே தெரியும்.',
  'Nothing later': 'பிறகு எதுவும் இல்லை',
  'Jobs you accept for another day wait here.':
    'வேறு நாளுக்கு நீங்கள் ஏற்கும் வேலைகள் இங்கே காத்திருக்கும்.',
  'Nothing done yet': 'இன்னும் எதுவும் முடியவில்லை',
  'Finished jobs, and bookings that were cancelled, are kept here.':
    'முடிந்த வேலைகளும் ரத்தான புக்கிங்குகளும் இங்கே இருக்கும்.',
  '{count} booking to answer': 'பதில் சொல்ல {count} புக்கிங்',
  '{count} bookings to answer': 'பதில் சொல்ல {count} புக்கிங்குகள்',
  '{time} left on one': 'ஒன்றுக்கு {time} மீதம்',
  '{time} left': '{time} மீதம்',
  Now: 'இப்போது',
  'Tomorrow · {count} job': 'நாளை · {count} வேலை',
  'Tomorrow · {count} jobs': 'நாளை · {count} வேலைகள்',
  // ─── A job's page ───
  'this job': 'இந்த வேலை',
  "This job isn't on your list": 'இந்த வேலை உங்கள் பட்டியலில் இல்லை',
  'It may belong to another garage, or the link is old.':
    'இது வேறு கேரேஜுடையதாக இருக்கலாம், அல்லது லிங்க் பழையது.',
  'Back to bookings': 'புக்கிங்குகளுக்குத் திரும்பவும்',
  "Detlio waived the photos for this job: Start and Complete don't wait for them.":
    'இந்த வேலைக்கு Detlio போட்டோக்களைத் தள்ளுபடி செய்தது: தொடங்கவும் முடிக்கவும் அவற்றுக்காகக் காத்திருக்காது.',
  done: 'முடிந்தது',
  now: 'இப்போது',
  'to come': 'வரவிருக்கிறது',
  'Job progress': 'வேலையின் முன்னேற்றம்',
  'Still to do': 'இன்னும் செய்ய வேண்டியவை',
  'Complete job for {who}': '{who}-இன் வேலையை முடிக்கவும்',
  // ─── Settings ───
  'Cars at the same time must be between 1 and {max}.':
    'ஒரே நேரத்தில் கார்கள் 1 முதல் {max} வரை இருக்க வேண்டும்.',
  'Jobs in a day must be between 1 and {max}, or left blank.':
    'ஒரு நாளின் வேலைகள் 1 முதல் {max} வரை இருக்க வேண்டும், அல்லது காலியாக விடவும்.',
  'Failed to load settings': 'அமைப்புகளை ஏற்ற முடியவில்லை',
  'Saved successfully': 'வெற்றிகரமாகச் சேமிக்கப்பட்டது',
  Location: 'லொக்கேஷன்',
  Hours: 'நேரம்',
  'Time off': 'விடுமுறை',
  Account: 'கணக்கு',
  'Shown to customers': 'வாடிக்கையாளருக்குத் தெரியும்',
  'Business name': 'தொழில் பெயர்',
  Phone: 'போன்',
  Address: 'முகவரி',
  City: 'நகரம்',
  Pincode: 'பின்கோடு',
  'Save profile': 'சுயவிவரத்தைச் சேமிக்கவும்',
  'Garage photos': 'கேரேஜ் போட்டோக்கள்',
  'Add photos customers see on your listing':
    'உங்கள் பக்கத்தில் வாடிக்கையாளர்கள் பார்க்கும் போட்டோக்களைச் சேர்க்கவும்',
  Documents: 'ஆவணங்கள்',
  'Your ID and bank proof, one of the steps to Silver':
    'உங்கள் ID, வங்கி ஆதாரம் — சில்வருக்கான படிகளில் ஒன்று',
  'Your ID, bank proof and shop photo, one of the steps to Silver':
    'உங்கள் ID, வங்கி ஆதாரம், கடை போட்டோ — சில்வருக்கான படிகளில் ஒன்று',
  'Garage agreement': 'கேரேஜ் ஒப்பந்தம்',
  'Read and accept the Detlio garage agreement, for Bronze':
    'பிரான்ஸுக்கு, Detlio கேரேஜ் ஒப்பந்தத்தைப் படித்து ஏற்கவும்',
  'Garage location': 'கேரேஜ் லொக்கேஷன்',
  'Not set': 'அமைக்கப்படவில்லை',
  "Customers can't find you until your garage is pinned on the map, and we can't verify you without it.":
    'உங்கள் கேரேஜ் மேப்பில் பின் செய்யப்படும் வரை வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிக்க முடியாது, அது இல்லாமல் நாங்களும் உங்களைச் சரிபார்க்க முடியாது.',
  'Doorstep travel radius (km)': 'வீட்டுக்கே வந்து சர்வீஸ் செய்யும் தூரம் (km)',
  'Default {km} km': 'இயல்பாக {km} km',
  "How far you'll travel for doorstep jobs. Leave empty to use {km} km.":
    'வீட்டுக்கே வந்து செய்யும் வேலைகளுக்கு நீங்கள் எவ்வளவு தூரம் வருவீர்கள். காலியாக விட்டால் {km} km.',
  "Customers can't find you for doorstep jobs until your garage is pinned.":
    'உங்கள் கேரேஜ் பின் செய்யப்படும் வரை, வீட்டுக்கே வந்து செய்யும் வேலைகளுக்கு வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிக்க முடியாது.',
  'Save location': 'லொக்கேஷனைச் சேமிக்கவும்',
  'Doorstep coverage area': 'வீட்டுக்கே வந்து சர்வீஸ் செய்யும் பகுதி',
  "Optional. Draw the exact area you'll travel to — useful when a river, highway or city boundary means a plain radius gets it wrong.":
    'விருப்பம். நீங்கள் வரும் சரியான பகுதியை வரையவும் — ஆறு, நெடுஞ்சாலை அல்லது நகர எல்லையால் வெறும் தூரக் கணக்கு தவறாகும்போது உதவும்.',
  'Working hours': 'வேலை நேரம்',
  '{day} opening time': '{day} திறக்கும் நேரம்',
  '{day} closing time': '{day} மூடும் நேரம்',
  '{day} closed all day': '{day} நாள் முழுவதும் விடுமுறை',
  'Save working hours': 'வேலை நேரத்தைச் சேமிக்கவும்',
  'Slot interval': 'ஸ்லாட் இடைவெளி',
  'How far apart the start times customers can pick are.':
    'வாடிக்கையாளர்கள் தேர்ந்தெடுக்கும் தொடக்க நேரங்களுக்கு இடையே உள்ள இடைவெளி.',
  Capacity: 'கொள்ளளவு',
  'How many cars can you work on at the same time?':
    'ஒரே நேரத்தில் எத்தனை கார்களில் வேலை செய்ய முடியும்?',
  'Most jobs in a day (optional)': 'ஒரு நாளில் அதிகபட்ச வேலைகள் (விருப்பம்)',
  'No limit': 'வரம்பு இல்லை',
  'Customers are only offered times when you have room for one more car. Leave the daily limit blank for no limit.':
    'இன்னொரு காருக்கு இடம் இருக்கும் நேரங்கள் மட்டுமே வாடிக்கையாளர்களுக்குக் காட்டப்படும். வரம்பு வேண்டாமென்றால் தினசரி வரம்பைக் காலியாக விடவும்.',
  'Save capacity': 'கொள்ளளவைச் சேமிக்கவும்',
  'Job types': 'வேலை வகைகள்',
  'Drop In': 'கேரேஜில்',
  'Customers visit your garage':
    'வாடிக்கையாளர்கள் உங்கள் கேரேஜுக்கு வருவார்கள்',
  'You travel to the customer': 'நீங்கள் வாடிக்கையாளரிடம் செல்வீர்கள்',
  'Pin it under Location': 'லொக்கேஷனில் பின் செய்யவும்',
  Notifications: 'அறிவிப்புகள்',
  'New-booking alerts on this phone or computer':
    'இந்த போன் அல்லது கம்ப்யூட்டரில் புதிய புக்கிங் அலர்ட்',
  Team: 'டீம்',
  'Add admins and operators, and set what they can do':
    'அட்மின்களையும் ஆப்பரேட்டர்களையும் சேர்த்து, அவர்கள் என்ன செய்யலாம் என்று அமைக்கவும்',
  Support: 'சப்போர்ட்',
  // ─── Settings: pickup & drop ───
  'You collect the car from the customer, do the work here and bring it back':
    'நீங்கள் வாடிக்கையாளரிடமிருந்து காரை எடுத்து வந்து, இங்கே வேலை செய்து, திருப்பிக் கொண்டு போய்க் கொடுப்பீர்கள்',
  "Your garage isn't on the map yet": 'உங்கள் கேரேஜ் இன்னும் மேப்பில் இல்லை',
  'Set its location under Location: the pickup distance is measured from it, so no customer can be matched without it.':
    'லொக்கேஷனில் அதன் இடத்தை அமைக்கவும்: பிக்கப் தூரம் அங்கிருந்துதான் கணக்கிடப்படும், அது இல்லாமல் எந்த வாடிக்கையாளரையும் பொருத்த முடியாது.',
  'How far will you collect from? (km, optional)':
    'எவ்வளவு தூரத்திலிருந்து காரை எடுப்பீர்கள்? (km, விருப்பம்)',
  "Empty means {km} km from your garage's pin. Pickups need 3 hours' notice.":
    'காலியாக இருந்தால் உங்கள் கேரேஜ் பின்னிலிருந்து {km} km. பிக்கப்புக்கு 3 மணி நேர முன்னறிவிப்பு தேவை.',
  'While the car is with you it is your responsibility: from the moment you collect it until it is back with the customer. When you collect it, ask the customer for their 4-digit pickup code; when you bring it back, their delivery code.':
    'கார் உங்களிடம் இருக்கும் வரை அது உங்கள் பொறுப்பு: எடுத்த நிமிடம் முதல் வாடிக்கையாளரிடம் திரும்பும் வரை. எடுக்கும்போது வாடிக்கையாளரிடம் 4 இலக்கப் பிக்கப் கோடைக் கேட்கவும்; திருப்பித் தரும்போது டெலிவரி கோடை.',
  'Turn on pickup & drop': 'பிக்கப் & டிராப்-ஐ ஆன் செய்யவும்',
  'Responsibility for the car accepted on {date}.':
    'காருக்கான பொறுப்பு {date} அன்று ஏற்கப்பட்டது.',
  'Customers can book pickup & drop from the Detlio app soon.':
    'விரைவில் வாடிக்கையாளர்கள் Detlio ஆப்பில் பிக்கப் & டிராப்-ஐ புக் செய்யலாம்.',
  'Save pickup distance': 'பிக்கப் தூரத்தைச் சேமிக்கவும்',
  // ─── Settings: pause and holidays ───
  'You have {count} booking that day — reschedule or cancel it with the customer.':
    'அந்த நாளில் உங்களுக்கு {count} புக்கிங் உள்ளது — வாடிக்கையாளருடன் பேசி நேரத்தை மாற்றவும் அல்லது ரத்து செய்யவும்.',
  'You have {count} bookings that day — reschedule or cancel them with the customers.':
    'அந்த நாளில் உங்களுக்கு {count} புக்கிங்குகள் உள்ளன — வாடிக்கையாளர்களுடன் பேசி நேரத்தை மாற்றவும் அல்லது ரத்து செய்யவும்.',
  'New bookings paused': 'புதிய புக்கிங்குகள் நிறுத்தி வைக்கப்பட்டன',
  'Taking bookings again': 'மீண்டும் புக்கிங் எடுக்கிறது',
  'Pause new bookings': 'புதிய புக்கிங்குகளை நிறுத்தி வைக்கவும்',
  "Customers can't book you while this is on. Bookings you already have stay as they are.":
    'இது ஆன் ஆக இருக்கும்போது வாடிக்கையாளர்கள் உங்களை புக் செய்ய முடியாது. ஏற்கனவே உள்ள புக்கிங்குகள் அப்படியே இருக்கும்.',
  'Reason (optional, customers see this)':
    'காரணம் (விருப்பம், வாடிக்கையாளர்கள் பார்ப்பார்கள்)',
  'e.g. Closed for renovation': 'எ.கா. புதுப்பிப்பு வேலைக்காக மூடப்பட்டுள்ளது',
  'Paused since {date}.': '{date} முதல் நிறுத்தி வைக்கப்பட்டுள்ளது.',
  'Customers see: “{reason}”': 'வாடிக்கையாளர்கள் பார்ப்பது: “{reason}”',
  'Update reason': 'காரணத்தை அப்டேட் செய்யவும்',
  'Resume bookings': 'புக்கிங்கை மீண்டும் தொடங்கவும்',
  'Holiday added': 'விடுமுறை சேர்க்கப்பட்டது',
  'Holiday removed': 'விடுமுறை நீக்கப்பட்டது',
  Holidays: 'விடுமுறைகள்',
  "Days you're closed on top of your weekly hours. Customers can't pick them.":
    'வாராந்திர நேரம் தவிர நீங்கள் மூடியிருக்கும் நாட்கள். வாடிக்கையாளர்கள் அவற்றைத் தேர்ந்தெடுக்க முடியாது.',
  Date: 'தேதி',
  'Reason (optional)': 'காரணம் (விருப்பம்)',
  'e.g. Diwali': 'எ.கா. தீபாவளி',
  'Add holiday': 'விடுமுறையைச் சேர்க்கவும்',
  "Couldn't load your holidays. Reload the page to see them.":
    'உங்கள் விடுமுறைகளை ஏற்ற முடியவில்லை. பார்க்க பக்கத்தை ரீலோட் செய்யவும்.',
  '{count} booking still on this day':
    'இந்த நாளில் இன்னும் {count} புக்கிங் உள்ளது',
  '{count} bookings still on this day':
    'இந்த நாளில் இன்னும் {count} புக்கிங்குகள் உள்ளன',
  'Remove holiday on {date}': '{date} விடுமுறையை நீக்கவும்',
  // ─── Settings: notifications ───
  'A new booking, with how long you have to accept it':
    'புதிய புக்கிங், ஏற்க எவ்வளவு நேரம் உள்ளது என்பதுடன்',
  'A reminder 10 minutes before the time to accept runs out':
    'ஏற்கும் நேரம் முடிய 10 நிமிடம் முன் ஒரு நினைவூட்டல்',
  'The customer picked one of your times, or none of them':
    'வாடிக்கையாளர் உங்கள் நேரங்களில் ஒன்றைத் தேர்ந்தெடுத்தார், அல்லது எதையும் தேர்ந்தெடுக்கவில்லை',
  'Extra work paid for or declined':
    'கூடுதல் வேலைக்குப் பணம் செலுத்தப்பட்டது அல்லது மறுக்கப்பட்டது',
  'A booking cancelled or moved by the customer':
    'வாடிக்கையாளர் ரத்து செய்த அல்லது நேரம் மாற்றிய புக்கிங்',
  "Notifications aren't available yet": 'அறிவிப்புகள் இன்னும் கிடைக்கவில்லை',
  'New bookings show on Home and Bookings.':
    'புதிய புக்கிங்குகள் முகப்பிலும் புக்கிங்குகளிலும் தெரியும்.',
  'Open Bookings': 'புக்கிங்குகளைத் திறக்கவும்',
  'New-booking alerts on this phone:': 'இந்த போனில் புதிய புக்கிங் அலர்ட்:',
  On: 'ஆன்',
  Off: 'ஆஃப்',
  'New bookings for {garage}, even with the portal closed':
    'போர்ட்டல் மூடியிருந்தாலும் {garage}-க்கான புதிய புக்கிங்குகள்',
  'New bookings, even with the portal closed':
    'போர்ட்டல் மூடியிருந்தாலும் புதிய புக்கிங்குகள்',
  "What you'll get": 'உங்களுக்கு வருபவை',
  "Turn it on for each phone or computer at the garage. A notification never shows the customer's number or address: open the job for those.":
    'கேரேஜில் உள்ள ஒவ்வொரு போன் அல்லது கம்ப்யூட்டரிலும் ஆன் செய்யவும். அறிவிப்பில் வாடிக்கையாளரின் நம்பரோ முகவரியோ ஒருபோதும் தெரியாது: அவற்றுக்கு வேலையைத் திறக்கவும்.',
  // ─── Settings: team ───
  'Operator — jobs only': 'ஆப்பரேட்டர் — வேலைகள் மட்டும்',
  'Admin — full access': 'அட்மின் — முழு அணுகல்',
  'Failed to load members': 'உறுப்பினர்களை ஏற்ற முடியவில்லை',
  'Enter a 10-digit phone number': '10 இலக்க போன் நம்பரை உள்ளிடவும்',
  'Member added': 'உறுப்பினர் சேர்க்கப்பட்டார்',
  'Failed to add member': 'உறுப்பினரைச் சேர்க்க முடியவில்லை',
  'Add a team member': 'டீம் உறுப்பினரைச் சேர்க்கவும்',
  'Name (optional)': 'பெயர் (விருப்பம்)',
  Role: 'பங்கு',
  'They get access the next time they log in with this number. Operators can work on jobs but cannot see earnings or change settings.':
    'இந்த நம்பரில் அடுத்த முறை உள்நுழையும்போது அவர்களுக்கு அணுகல் கிடைக்கும். ஆப்பரேட்டர்கள் வேலைகளில் வேலை செய்யலாம், ஆனால் வருமானத்தைப் பார்க்கவோ அமைப்புகளை மாற்றவோ முடியாது.',
  'Adding...': 'சேர்க்கிறது...',
  'Add member': 'உறுப்பினரைச் சேர்க்கவும்',
  Members: 'உறுப்பினர்கள்',
  'The owner cannot be changed or removed. Transfer ownership first.':
    'உரிமையாளரை மாற்றவோ நீக்கவோ முடியாது. முதலில் உரிமையை மாற்றவும்.',
  'Role for {name}': '{name}-இன் பங்கு',
  'Role updated': 'பங்கு அப்டேட் செய்யப்பட்டது',
  'Member suspended': 'உறுப்பினர் இடைநிறுத்தப்பட்டார்',
  'Member restored': 'உறுப்பினர் மீண்டும் சேர்க்கப்பட்டார்',
  Suspend: 'இடைநிறுத்தவும்',
  Restore: 'மீட்டெடுக்கவும்',
  'Member removed': 'உறுப்பினர் நீக்கப்பட்டார்',
  'Make {name} the owner? You stay an admin, but you cannot undo this yourself.':
    '{name}-ஐ உரிமையாளர் ஆக்கவா? நீங்கள் அட்மினாகத் தொடர்வீர்கள், ஆனால் இதை நீங்களே திரும்ப மாற்ற முடியாது.',
  'Ownership transferred': 'உரிமை மாற்றப்பட்டது',
  'Make owner': 'உரிமையாளர் ஆக்கவும்',
  // ─── Settings: documents ───
  'Couldn’t load your documents.': 'உங்கள் ஆவணங்களை ஏற்ற முடியவில்லை.',
  'Documents aren’t open yet': 'ஆவணங்கள் இன்னும் திறக்கப்படவில்லை',
  'Detlio will tell you when you can upload them here.':
    'இங்கே எப்போது அப்லோட் செய்யலாம் என்று Detlio உங்களுக்குச் சொல்லும்.',
  'Your documents': 'உங்கள் ஆவணங்கள்',
  'Detlio checks these. When the required ones are approved, your documents count as checked, one of the steps to Silver. Only you and the Detlio team can open them.':
    'Detlio இவற்றைச் சரிபார்க்கும். தேவையானவை ஏற்கப்பட்டதும், உங்கள் ஆவணங்கள் சரிபார்க்கப்பட்டதாகக் கணக்கிடப்படும் — சில்வருக்கான படிகளில் ஒன்று. நீங்களும் Detlio டீமும் மட்டுமே இவற்றைத் திறக்க முடியும்.',
  'Documents checked': 'ஆவணங்கள் சரிபார்க்கப்பட்டன',
  'That step to Silver is done.': 'சில்வருக்கான அந்தப் படி முடிந்தது.',
  '{document} sent for review': '{document} சரிபார்ப்புக்கு அனுப்பப்பட்டது',
  'Upload failed. Please try again.':
    'அப்லோட் தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.',
  '{document} removed': '{document} நீக்கப்பட்டது',
  'Couldn’t remove it. Please try again.':
    'நீக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Couldn’t open the file': 'ஃபைலைத் திறக்க முடியவில்லை',
  Required: 'கட்டாயம்',
  Optional: 'விருப்பம்',
  'What to fix': 'சரிசெய்ய வேண்டியது',
  File: 'ஃபைல்',
  'View {document}, front': '{document} முன்பக்கத்தைப் பார்க்கவும்',
  'View {document}, back': '{document} பின்பக்கத்தைப் பார்க்கவும்',
  View: 'பார்க்கவும்',
  'Expires {date}': '{date} அன்று காலாவதியாகும்',
  'Uploaded by Detlio': 'Detlio அப்லோட் செய்தது',
  'Choose files for {document}': '{document}-க்கு ஃபைல்களைத் தேர்ந்தெடுக்கவும்',
  'Remove {document}?': '{document}-ஐ நீக்கவா?',
  'Remove {document}? It goes back to Not uploaded and its files are deleted.':
    '{document}-ஐ நீக்கவா? இது மீண்டும் "அப்லோட் செய்யப்படவில்லை" ஆகும், அதன் ஃபைல்கள் நீக்கப்படும்.',
  'Upload {document}': '{document} அப்லோட் செய்யவும்',
  'Replace {document}': '{document} மாற்றவும்',
  'A photo or PDF, up to 10 MB.': 'ஒரு போட்டோ அல்லது PDF, 10 MB வரை.',
  'Two files if it has a front and a back.':
    'முன்பக்கமும் பின்பக்கமும் இருந்தால் இரண்டு ஃபைல்கள்.',
  'Replacing it sends it back for review.':
    'மாற்றினால் மீண்டும் சரிபார்ப்புக்குச் செல்லும்.',
  'Expiry date (optional)': 'காலாவதி தேதி (விருப்பம்)',
  'Send for review': 'சரிபார்ப்புக்கு அனுப்பவும்',
  // ─── Services ───
  'Failed to load services': 'சர்வீஸ்களை ஏற்ற முடியவில்லை',
  'Edit service': 'சர்வீஸைத் திருத்தவும்',
  'Add a service': 'ஒரு சர்வீஸைச் சேர்க்கவும்',
  'Cancel edit': 'திருத்தத்தை ரத்து செய்யவும்',
  'Add add-on': 'ஆட்-ஆன் சேர்க்கவும்',
  'Service name': 'சர்வீஸ் பெயர்',
  'Description (optional)': 'விவரம் (விருப்பம்)',
  Category: 'வகை',
  Pricing: 'விலை முறை',
  Flat: 'ஒரே விலை',
  'Per vehicle': 'வாகனத்துக்கு ஏற்ப',
  'On inspection': 'பரிசோதனைக்குப் பிறகு',
  'One fixed price': 'ஒரு நிலையான விலை',
  'Price per vehicle type': 'வாகன வகைக்கு ஏற்ற விலை',
  'Priced after seeing the car; inspection fee optional':
    'காரைப் பார்த்த பிறகு விலை; பரிசோதனைக் கட்டணம் விருப்பம்',
  'Inspection fee (₹)': 'பரிசோதனைக் கட்டணம் (₹)',
  // On inspection with no fee, and the approx price (0073). The garage app
  // reads these too (one merged lookup).
  'Inspection fee (optional)': 'பரிசோதனைக் கட்டணம் (விருப்பம்)',
  'Approx price (optional)': 'தோராய விலை (விருப்பம்)',
  'Enter an approx price above ₹0, or leave it empty.':
    '₹0-க்கு மேல் தோராய விலையை உள்ளிடவும், அல்லது காலியாக விடவும்.',
  'Leave the fee empty for a free inspection. The approx price is only a guide; you send the final bill after seeing the car.':
    'இலவச பரிசோதனைக்கு கட்டணத்தை காலியாக விடவும். தோராய விலை ஒரு வழிகாட்டி மட்டுமே; காரைப் பார்த்த பிறகு இறுதி பில்லை நீங்கள் அனுப்புவீர்கள்.',
  'Hatchback (₹)': 'ஹேட்ச்பேக் (₹)',
  'Sedan (₹)': 'செடான் (₹)',
  'SUV (₹)': 'SUV (₹)',
  'Duration (mins)': 'நேரம் (நிமிடங்கள்)',
  'Update service': 'சர்வீஸை அப்டேட் செய்யவும்',
  'Add service': 'சர்வீஸைச் சேர்க்கவும்',
  'Your services': 'உங்கள் சர்வீஸ்கள்',
  'No services yet': 'இன்னும் சர்வீஸ் இல்லை',
  'Add what you offer above. Customers can book a service once it is active.':
    'நீங்கள் வழங்குவதை மேலே சேர்க்கவும். சர்வீஸ் ஆக்டிவ் ஆனதும் வாடிக்கையாளர்கள் புக் செய்யலாம்.',
  Inactive: 'ஆக்டிவ் இல்லை',
  Disable: 'நிறுத்தவும்',
  Enable: 'இயக்கவும்',
  'Delete {name}?': '{name}-ஐ நீக்கவா?',
  'Delete this service?': 'இந்த சர்வீஸை நீக்கவா?',
  "Customers can't book it any more, and it can't be undone. To stop it for a while, Disable it instead.":
    'வாடிக்கையாளர்கள் இனி இதை புக் செய்ய முடியாது, இதைத் திரும்ப மாற்றவும் முடியாது. சிறிது காலம் நிறுத்த, அதற்குப் பதில் "நிறுத்தவும்" அழுத்தவும்.',
  'Delete service': 'சர்வீஸை நீக்கவும்',
  // ─── Services: packages ───
  'Failed to load packages': 'பேக்கேஜ்களை ஏற்ற முடியவில்லை',
  'Packages need two services': 'பேக்கேஜுக்கு இரண்டு சர்வீஸ்கள் தேவை',
  'Add at least 2 active services before building a package.':
    'பேக்கேஜ் உருவாக்கும் முன் குறைந்தது 2 ஆக்டிவ் சர்வீஸ்களைச் சேர்க்கவும்.',
  'Edit package': 'பேக்கேஜைத் திருத்தவும்',
  'Build a package': 'ஒரு பேக்கேஜ் உருவாக்கவும்',
  'Package name': 'பேக்கேஜ் பெயர்',
  'Services included ({count} selected · minimum {min})':
    'சேர்க்கப்பட்ட சர்வீஸ்கள் ({count} தேர்வு · குறைந்தது {min})',
  'Package price (₹)': 'பேக்கேஜ் விலை (₹)',
  'Services add up to {mins} min — use that':
    'சர்வீஸ்கள் மொத்தம் {mins} min — அதையே பயன்படுத்தவும்',
  'Bought separately: {amount}': 'தனித்தனியாக வாங்கினால்: {amount}',
  'Customers save {amount}': 'வாடிக்கையாளர்களுக்கு {amount} மிச்சம்',
  'Price the package below {amount} to show a savings badge.':
    'மிச்சம் பேட்ஜ் காட்ட, பேக்கேஜ் விலையை {amount}-க்குக் கீழ் வைக்கவும்.',
  'Update package': 'பேக்கேஜை அப்டேட் செய்யவும்',
  'Create package': 'பேக்கேஜ் உருவாக்கவும்',
  'Your packages': 'உங்கள் பேக்கேஜ்கள்',
  'No packages yet': 'இன்னும் பேக்கேஜ் இல்லை',
  'Bundle 2 or more services to create one.':
    'உருவாக்க 2 அல்லது அதற்கு மேற்பட்ட சர்வீஸ்களைச் சேர்க்கவும்.',
  'Saves {amount} vs {total} separately':
    'தனித்தனியாக {total}, இதில் {amount} மிச்சம்',
  'Contains a disabled service — customers still see it listed.':
    'நிறுத்தப்பட்ட சர்வீஸ் ஒன்று இதில் உள்ளது — வாடிக்கையாளர்களுக்கு இன்னும் பட்டியலில் தெரியும்.',
  'Delete this package?': 'இந்த பேக்கேஜை நீக்கவா?',
  'Delete package': 'பேக்கேஜை நீக்கவும்',
  // ─── Services: add-ons ───
  'Edit add-on': 'ஆட்-ஆனைத் திருத்தவும்',
  'Add an add-on': 'ஒரு ஆட்-ஆனைச் சேர்க்கவும்',
  'Add-on name': 'ஆட்-ஆன் பெயர்',
  'Extra minutes (optional)': 'கூடுதல் நிமிடங்கள் (விருப்பம்)',
  "Added to the job's time. Leave empty if it adds none.":
    'வேலை நேரத்தோடு சேர்க்கப்படும். நேரம் கூடவில்லை என்றால் காலியாக விடவும்.',
  'Offered to customers': 'வாடிக்கையாளர்களுக்கு வழங்கப்படுகிறது',
  'Works with any of your services.': 'உங்கள் எந்த சர்வீஸுடனும் சேர்க்கலாம்.',
  'Update add-on': 'ஆட்-ஆனை அப்டேட் செய்யவும்',
  'Failed to load add-ons': 'ஆட்-ஆன்களை ஏற்ற முடியவில்லை',
  'Add-ons': 'ஆட்-ஆன்கள்',
  "Small extras that go with any of your services. Customers can't book them alone.":
    'உங்கள் எந்த சர்வீஸுடனும் சேர்க்கும் சிறிய கூடுதல்கள். வாடிக்கையாளர்கள் இவற்றை மட்டும் தனியாக புக் செய்ய முடியாது.',
  'Delete this add-on?': 'இந்த ஆட்-ஆனை நீக்கவா?',
  "Customers can't add it any more, and it can't be undone. Past bookings keep it. To stop it for a while, Disable it instead.":
    'வாடிக்கையாளர்கள் இனி இதைச் சேர்க்க முடியாது, இதைத் திரும்ப மாற்றவும் முடியாது. பழைய புக்கிங்குகளில் இது இருக்கும். சிறிது காலம் நிறுத்த, அதற்குப் பதில் "நிறுத்தவும்" அழுத்தவும்.',
  'Delete add-on': 'ஆட்-ஆனை நீக்கவும்',
  // ─── Earnings ───
  '30 days': '30 நாட்கள்',
  'This month': 'இந்த மாதம்',
  'Last month': 'கடந்த மாதம்',
  Dates: 'தேதிகள்',
  'Booking #{reference}': 'புக்கிங் #{reference}',
  'Travel fee (yours, no commission)':
    'பயணக் கட்டணம் (உங்களுடையது, கமிஷன் இல்லை)',
  'Detlio promo (paid by Detlio)': 'Detlio புரோமோ (Detlio செலுத்துகிறது)',
  'Your promo': 'உங்கள் புரோமோ',
  'Detlio commission': 'Detlio கமிஷன்',
  'Your share': 'உங்கள் பங்கு',
  'Cash you collected': 'நீங்கள் வசூலித்த பணம்',
  'Taken back {amount} on {date}, ref {reference}':
    '{date} அன்று {amount} திரும்பப் பெறப்பட்டது, ref {reference}',
  'Paid {amount} on {date}, ref {reference}':
    '{date} அன்று {amount} செலுத்தப்பட்டது, ref {reference}',
  '{amount} more to come': 'இன்னும் {amount} வரவிருக்கிறது',
  '{amount} comes off your next payout':
    'அடுத்த பேஅவுட்டில் {amount} கழிக்கப்படும்',
  "Couldn't load your earnings.": 'உங்கள் வருமானத்தை ஏற்ற முடியவில்லை.',
  'Your balance': 'உங்கள் பேலன்ஸ்',
  'You owe Detlio': 'நீங்கள் Detlio-க்குத் தர வேண்டியது',
  'Due now': 'இப்போது வர வேண்டியது',
  'Comes off your next payout': 'அடுத்த பேஅவுட்டில் கழிக்கப்படும்',
  'Oldest from {date}': 'பழையது {date} முதல்',
  'Paid within {hours} hours': '{hours} மணி நேரத்துக்குள் செலுத்தப்படும்',
  'Paid this month': 'இந்த மாதம் செலுத்தியது',
  'Detlio pays your share within {hours} hours of each job, by bank transfer or UPI. Commission is 8% on washes, packages and others, 5% on detailing, coating, scratch removal, general service, repairs and dent & paint.':
    'ஒவ்வொரு வேலைக்கும் {hours} மணி நேரத்துக்குள் Detlio உங்கள் பங்கை வங்கிப் பரிமாற்றம் அல்லது UPI மூலம் செலுத்தும். கமிஷன்: வாஷ், பேக்கேஜ் மற்றும் மற்றவற்றுக்கு 8%, டீடெய்லிங், கோட்டிங், ஸ்கிராட்ச் நீக்கம், ஜெனரல் சர்வீஸ், ரிப்பேர், டென்ட் & பெயிண்ட்டுக்கு 5%.',
  'Your first {count} bookings are free: {used} used so far.':
    'உங்கள் முதல் {count} புக்கிங்குகள் இலவசம்: இதுவரை {used} பயன்படுத்தப்பட்டன.',
  Period: 'காலம்',
  From: 'முதல்',
  To: 'வரை',
  "Couldn't load those dates. Showing {from} to {to}.":
    'அந்தத் தேதிகளை ஏற்ற முடியவில்லை. {from} முதல் {to} வரை காட்டுகிறது.',
  'Nothing in these dates': 'இந்தத் தேதிகளில் எதுவும் இல்லை',
  "Each job you complete shows up here with Detlio's commission, your share and its payout.":
    'நீங்கள் முடிக்கும் ஒவ்வொரு வேலையும் Detlio கமிஷன், உங்கள் பங்கு, அதன் பேஅவுட்டுடன் இங்கே தெரியும்.',
  Payouts: 'பேஅவுட்கள்',
  'Ref {reference}': 'Ref {reference}',
  // ─── Requests ───
  SUV: 'SUV',
  'Passed on': 'அடுத்தவருக்கு அனுப்பப்பட்டது',
  Declined: 'மறுக்கப்பட்டது',
  Expired: 'காலாவதியானது',
  'Customers just outside your area ask you to come. Nothing is paid until you say yes. Answer within {hours} hours, or we ask the next garage.':
    'உங்கள் பகுதிக்குச் சற்று வெளியே உள்ள வாடிக்கையாளர்கள் உங்களை வரச் சொல்லிக் கேட்கிறார்கள். நீங்கள் சரி சொல்லும் வரை எதுவும் செலுத்தப்படாது. {hours} மணி நேரத்துக்குள் பதில் சொல்லவும், இல்லையென்றால் அடுத்த கேரேஜிடம் கேட்போம்.',
  'Which requests': 'எந்தக் கோரிக்கைகள்',
  'your requests': 'உங்கள் கோரிக்கைகள்',
  'No requests right now': 'இப்போது கோரிக்கை எதுவும் இல்லை',
  'Customers just outside your area can ask you to come. Their requests show here.':
    'உங்கள் பகுதிக்குச் சற்று வெளியே உள்ள வாடிக்கையாளர்கள் உங்களை வரச் சொல்லிக் கேட்கலாம். அவர்களின் கோரிக்கைகள் இங்கே தெரியும்.',
  'Saying yes often earns you more requests from this area.':
    'அடிக்கடி சரி சொன்னால் இந்தப் பகுதியிலிருந்து அதிகக் கோரிக்கைகள் வரும்.',
  'Accepted. The customer has until {time} to confirm.':
    'ஏற்கப்பட்டது. வாடிக்கையாளர் உறுதிசெய்ய {time} வரை நேரம் உள்ளது.',
  'Accepted.': 'ஏற்கப்பட்டது.',
  'Could not accept. Please try again.':
    'ஏற்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Passed to the next garage': 'அடுத்த கேரேஜுக்கு அனுப்பப்பட்டது',
  'Request closed': 'கோரிக்கை மூடப்பட்டது',
  'Could not answer. Please try again.':
    'பதில் அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Passed on to you': 'உங்களுக்கு அனுப்பப்பட்டது',
  'New request · outside your area': 'புதிய கோரிக்கை · உங்கள் பகுதிக்கு வெளியே',
  'Time left to answer: {time}': 'பதில் சொல்ல மீதமுள்ள நேரம்: {time}',
  '{km} km from you': 'உங்களிடமிருந்து {km} km',
  'You earn {amount} + any travel fee':
    'உங்களுக்கு {amount} + பயணக் கட்டணம் ஏதாவது இருந்தால்',
  'Travel fee (the customer sees it before paying)':
    'பயணக் கட்டணம் (பணம் செலுத்தும் முன் வாடிக்கையாளர் பார்ப்பார்)',
  'Travel fee': 'பயணக் கட்டணம்',
  'Start time, inside {window}': 'தொடக்க நேரம், {window}-க்குள்',
  'Finding your free times…': 'உங்கள் காலி நேரங்களைத் தேடுகிறது…',
  'No free start time left in this window':
    'இந்த நேரப் பகுதியில் காலியான தொடக்க நேரம் இல்லை',
  'Start time': 'தொடக்க நேரம்',
  "Can't": 'முடியாது',
  'Pick a start time to accept.':
    'ஏற்க ஒரு தொடக்க நேரத்தைத் தேர்ந்தெடுக்கவும்.',
  'Accepted · starts {start} · travel fee {fee} · customer confirms by {time}':
    'ஏற்கப்பட்டது · தொடக்கம் {start} · பயணக் கட்டணம் {fee} · வாடிக்கையாளர் {time}-க்குள் உறுதிசெய்வார்',
  'It becomes a booking on your Bookings page once the customer pays.':
    'வாடிக்கையாளர் பணம் செலுத்தியதும் இது உங்கள் புக்கிங்குகள் பக்கத்தில் புக்கிங்காக வரும்.',
  'Withdraw your yes to {request}':
    '{request}-க்கு நீங்கள் சொன்ன சரியைத் திரும்பப் பெறவும்',
  'Withdrawn. We told the customer.':
    'திரும்பப் பெறப்பட்டது. வாடிக்கையாளரிடம் சொல்லிவிட்டோம்.',
  'Withdraw your yes?': 'நீங்கள் சொன்ன சரியைத் திரும்பப் பெறவா?',
  "The customer hasn't paid yet. We tell them you can no longer come, and they can ask again.":
    'வாடிக்கையாளர் இன்னும் பணம் செலுத்தவில்லை. நீங்கள் வர முடியாது என்று சொல்லிவிடுவோம், அவர்கள் மீண்டும் கேட்கலாம்.',
  'Your reach (your area), the customer {km} km from you':
    'உங்கள் எல்லை (உங்கள் பகுதி), வாடிக்கையாளர் உங்களிடமிருந்து {km} km',
  'Your reach {cover} km, the customer {km} km from you':
    'உங்கள் எல்லை {cover} km, வாடிக்கையாளர் உங்களிடமிருந்து {km} km',
  you: 'நீங்கள்',
  area: 'பகுதி',
  customer: 'வாடிக்கையாளர்',
  // ─── Reviews and the agreement ───
  '{count} review so far. Customers see your score from {min} reviews.':
    'இதுவரை {count} மதிப்பாய்வு. {min} மதிப்பாய்வுகள் வந்ததும் வாடிக்கையாளர்களுக்கு உங்கள் ஸ்கோர் தெரியும்.',
  '{count} reviews so far. Customers see your score from {min} reviews.':
    'இதுவரை {count} மதிப்பாய்வுகள். {min} மதிப்பாய்வுகள் வந்ததும் வாடிக்கையாளர்களுக்கு உங்கள் ஸ்கோர் தெரியும்.',
  '{count} review': '{count} மதிப்பாய்வு',
  'your reviews': 'உங்கள் மதிப்பாய்வுகள்',
  'Reviews will appear after your first completed job':
    'உங்கள் முதல் வேலை முடிந்ததும் மதிப்பாய்வுகள் இங்கே வரும்',
  'Your reply': 'உங்கள் பதில்',
  'You accepted {title}.': 'நீங்கள் {title}-ஐ ஏற்றுக்கொண்டீர்கள்.',
  'Couldn’t record that. Please try again.':
    'அதைப் பதிவு செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Couldn’t load the agreement.': 'ஒப்பந்தத்தை ஏற்ற முடியவில்லை.',
  'Nothing to accept yet': 'ஏற்க இன்னும் எதுவும் இல்லை',
  'Detlio hasn’t published the garage agreement here yet. We’ll tell you when it is ready.':
    'Detlio இன்னும் கேரேஜ் ஒப்பந்தத்தை இங்கே வெளியிடவில்லை. தயாரானதும் உங்களுக்குச் சொல்வோம்.',
  'Published {date}': '{date} அன்று வெளியிடப்பட்டது',
  'Read (PDF)': 'படிக்கவும் (PDF)',
  'You accepted v{version}': 'நீங்கள் v{version}-ஐ ஏற்றுக்கொண்டீர்கள்',
  'On {date}, by {name}. You hold Bronze while this is the latest version.':
    '{date} அன்று, {name} ஏற்றார். இதுவே சமீபத்திய பதிப்பாக இருக்கும் வரை நீங்கள் பிரான்ஸ் டியரில் இருப்பீர்கள்.',
  'Detlio updated the agreement. Accept v{version} by {date} to keep your tier.':
    'Detlio ஒப்பந்தத்தை அப்டேட் செய்துள்ளது. உங்கள் டியரைத் தக்கவைக்க {date}-க்குள் v{version}-ஐ ஏற்கவும்.',
  'I have read the {title} and agree to it for my garage.':
    '{title}-ஐப் படித்தேன், என் கேரேஜுக்காக அதை ஏற்கிறேன்.',
  'Tick “{tick}” first': 'முதலில் “{tick}” என்பதை டிக் செய்யவும்',
  'Confirming…': 'உறுதிசெய்கிறது…',
  'Detlio keeps a record of who accepted which version, and when.':
    'யார், எந்தப் பதிப்பை, எப்போது ஏற்றார்கள் என்பதை Detlio பதிவு செய்து வைக்கும்.',
  // ─── Free redo claims ───
  'Only the garage owner can see and answer redo claims.':
    'கேரேஜ் உரிமையாளர் மட்டுமே ரீடூ கோரிக்கைகளைப் பார்த்துப் பதில் சொல்ல முடியும்.',
  'Free redo claims are not switched on yet.':
    'இலவச ரீடூ கோரிக்கைகள் இன்னும் ஆன் செய்யப்படவில்லை.',
  'A customer can ask for a free redo within {claimHours} hours of a wash or detailing, with photos. Answer within {answerHours} hours of your opening hours, or the redo is approved. Jobs without your before and after photos are approved at once.':
    'வாஷ் அல்லது டீடெய்லிங் முடிந்து {claimHours} மணி நேரத்துக்குள், போட்டோக்களுடன், வாடிக்கையாளர் இலவச ரீடூ கேட்கலாம். உங்கள் திறந்திருக்கும் நேரத்தில் {answerHours} மணி நேரத்துக்குள் பதில் சொல்லவும், இல்லையென்றால் ரீடூ ஏற்கப்படும். உங்கள் முன்பு, பின்பு போட்டோக்கள் இல்லாத வேலைகளுக்கு உடனே ஏற்கப்படும்.',
  'Which claims': 'எந்தக் கோரிக்கைகள்',
  'No open claims': 'திறந்த கோரிக்கை இல்லை',
  'No closed claims': 'மூடிய கோரிக்கை இல்லை',
  'Claims customers make on your jobs show here.':
    'உங்கள் வேலைகள் மீது வாடிக்கையாளர்கள் வைக்கும் கோரிக்கைகள் இங்கே தெரியும்.',
  'Accepted. The customer picks a time for the redo.':
    'ஏற்கப்பட்டது. ரீடூவுக்கான நேரத்தை வாடிக்கையாளர் தேர்ந்தெடுப்பார்.',
  'Sent to Detlio to decide.': 'முடிவெடுக்க Detlio-க்கு அனுப்பப்பட்டது.',
  'Could not send. Please try again.':
    'அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'done {time}': '{time} முடிந்தது',
  'Your before and after photos': 'உங்கள் முன்பு, பின்பு போட்டோக்கள்',
  'Approved at once: there were no before and after photos on this job.':
    'உடனே ஏற்கப்பட்டது: இந்த வேலையில் முன்பு, பின்பு போட்டோக்கள் இல்லை.',
  'Detlio is reviewing this claim. Nothing for you to do yet.':
    'Detlio இந்தக் கோரிக்கையைப் பரிசீலிக்கிறது. இப்போதைக்கு நீங்கள் செய்ய எதுவும் இல்லை.',
  'You disputed it: “{note}”': 'நீங்கள் ஆட்சேபித்தீர்கள்: “{note}”',
  'There was no answer in time, so the redo was approved.':
    'நேரத்துக்குள் பதில் வரவில்லை, அதனால் ரீடூ ஏற்கப்பட்டது.',
  'Detlio: “{reason}”': 'Detlio: “{reason}”',
  'Detlio approved a refund instead of a redo. Nothing is paid out on this job.':
    'ரீடூவுக்குப் பதில் Detlio பணத்தைத் திருப்பித் தர ஏற்றது. இந்த வேலைக்கு எதுவும் செலுத்தப்படாது.',
  'Free redo booked for {time} — it is on your Bookings page.':
    'இலவச ரீடூ {time}-க்கு புக் ஆனது — உங்கள் புக்கிங்குகள் பக்கத்தில் உள்ளது.',
  'The customer picks a free redo time by {time}.':
    'வாடிக்கையாளர் {time}-க்குள் இலவச ரீடூ நேரத்தைத் தேர்ந்தெடுப்பார்.',
  'Answer within {left} of now (by {time})':
    'இப்போதிலிருந்து {left}-க்குள் பதில் சொல்லவும் ({time}-க்குள்)',
  'Answer within {left} of now':
    'இப்போதிலிருந்து {left}-க்குள் பதில் சொல்லவும்',
  'Accept — free redo': 'ஏற்கவும் — இலவச ரீடூ',
  Dispute: 'ஆட்சேபிக்கவும்',
  'Dispute this claim': 'இந்தக் கோரிக்கையை ஆட்சேபிக்கவும்',
  "Say why the job was done properly. Detlio compares both sides' photos and decides within {hours} hours.":
    'வேலை ஏன் சரியாகச் செய்யப்பட்டது என்று சொல்லுங்கள். Detlio இரு பக்க போட்டோக்களையும் ஒப்பிட்டு {hours} மணி நேரத்துக்குள் முடிவெடுக்கும்.',
  'Send to Detlio': 'Detlio-க்கு அனுப்பவும்',
  // ─── Garage photos ───
  'Failed to load photos': 'போட்டோக்களை ஏற்ற முடியவில்லை',
  'Unsupported type (use JPEG, PNG or WebP)':
    'இந்த வகை ஏற்கப்படாது (JPEG, PNG அல்லது WebP பயன்படுத்தவும்)',
  'Logo too large (max 5 MB)': 'லோகோ மிகப் பெரியது (அதிகபட்சம் 5 MB)',
  'Logo updated': 'லோகோ அப்டேட் செய்யப்பட்டது',
  'Failed to remove logo': 'லோகோவை நீக்க முடியவில்லை',
  '{name}: unsupported type (use JPEG, PNG or WebP)':
    '{name}: இந்த வகை ஏற்கப்படாது (JPEG, PNG அல்லது WebP பயன்படுத்தவும்)',
  '{name}: too large (max 5 MB)': '{name}: மிகப் பெரியது (அதிகபட்சம் 5 MB)',
  'Failed to delete photo': 'போட்டோவை நீக்க முடியவில்லை',
  Logo: 'லோகோ',
  'Shown next to your garage in customer listings.':
    'வாடிக்கையாளர் பட்டியல்களில் உங்கள் கேரேஜ் அருகில் காட்டப்படும்.',
  'Working…': 'செய்கிறது…',
  'Change logo': 'லோகோவை மாற்றவும்',
  'Add logo': 'லோகோ சேர்க்கவும்',
  'Remove logo': 'லோகோவை நீக்கவும்',
  'JPEG, PNG or WebP · up to 5 MB each. These show on your public listing.':
    'JPEG, PNG அல்லது WebP · ஒவ்வொன்றும் 5 MB வரை. இவை உங்கள் பொதுப் பக்கத்தில் தெரியும்.',
  'Add photos': 'போட்டோக்களைச் சேர்க்கவும்',
  'No photos yet': 'இன்னும் போட்டோ இல்லை',
  'Add photos of your garage and work':
    'உங்கள் கேரேஜ் மற்றும் வேலையின் போட்டோக்களைச் சேர்க்கவும்',
  'Garage photo {n}': 'கேரேஜ் போட்டோ {n}',
  'Delete photo': 'போட்டோவை நீக்கவும்',
  // Photo order: Make cover and the arrows (@repo/core/photo-order)
  Cover: 'கவர்',
  'Make this the cover photo': 'இதைக் கவர் போட்டோவாக்கவும்',
  'Move photo left': 'போட்டோவை இடப்பக்கம் நகர்த்தவும்',
  'Move photo right': 'போட்டோவை வலப்பக்கம் நகர்த்தவும்',
  "Couldn't change the photo order. Try again.":
    'போட்டோக்களின் வரிசையை மாற்ற முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Your photos changed somewhere else. Showing them as they are now.':
    'உங்கள் போட்டோக்கள் வேறு இடத்தில் மாற்றப்பட்டன. இப்போது உள்ளபடி காட்டுகிறோம்.',
  'The first photo is your cover: customers see it first. Tap the star to make a photo the cover, or the arrows to move it.':
    'முதல் போட்டோவே உங்கள் கவர்: வாடிக்கையாளர்கள் முதலில் அதையே பார்ப்பார்கள். ஒரு போட்டோவைக் கவராக்க நட்சத்திரத்தையும், நகர்த்த அம்புகளையும் தட்டவும்.',
  // ─── Sign-up: steps 1 and 2 ───
  'Under 1 year': '1 வருடத்துக்குக் குறைவு',
  '1–3 years': '1–3 வருடங்கள்',
  '3–5 years': '3–5 வருடங்கள்',
  '5–10 years': '5–10 வருடங்கள்',
  '10+ years': '10+ வருடங்கள்',
  'Business info': 'தொழில் விவரம்',
  'The basics about your garage and who runs it.':
    'உங்கள் கேரேஜ் பற்றியும் அதை நடத்துபவர் பற்றியும் அடிப்படை விவரங்கள்.',
  'Owner name': 'உரிமையாளர் பெயர்',
  'Mobile number': 'மொபைல் நம்பர்',
  'WhatsApp number (optional)': 'WhatsApp நம்பர் (விருப்பம்)',
  '10-digit number': '10 இலக்க நம்பர்',
  'Email (optional)': 'ஈமெயில் (விருப்பம்)',
  'Years in operation (optional)': 'எத்தனை வருடங்களாக நடக்கிறது (விருப்பம்)',
  'Set your garage location on the map':
    'மேப்பில் உங்கள் கேரேஜ் லொக்கேஷனை அமைக்கவும்',
  'Enter a valid 6-digit pincode': 'சரியான 6 இலக்கப் பின்கோடை உள்ளிடவும்',
  'Failed to save. Please try again.':
    'சேமிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Your garage location': 'உங்கள் கேரேஜ் லொக்கேஷன்',
  'Pin your garage': 'உங்கள் கேரேஜைப் பின் செய்யவும்',
  'This is how customers find you and how we work out who is nearby, so place it exactly at your gate.':
    'இதை வைத்துத்தான் வாடிக்கையாளர்கள் உங்களைக் கண்டுபிடிப்பார்கள், யார் அருகில் இருக்கிறார்கள் என்று நாங்களும் கணக்கிடுவோம் — அதனால் சரியாக உங்கள் வாசலில் வைக்கவும்.',
  'Full address': 'முழு முகவரி',
  'Google Maps link (optional)': 'Google Maps லிங்க் (விருப்பம்)',
  // ─── Sign-up: step 3 ───
  "Enter how far you'll go, from {min} to {max} km, or leave it empty.":
    'எவ்வளவு தூரம் வருவீர்கள் என்று {min} முதல் {max} km வரை உள்ளிடவும், அல்லது காலியாக விடவும்.',
  'Jobs in a day must be 1 or more, or left blank.':
    'ஒரு நாளின் வேலைகள் 1 அல்லது அதற்கு மேல் இருக்க வேண்டும், அல்லது காலியாக விடவும்.',
  'Garage setup': 'கேரேஜ் அமைப்பு',
  'When you work, and how many cars you can take.':
    'நீங்கள் எப்போது வேலை செய்வீர்கள், எத்தனை கார்களை எடுக்க முடியும்.',
  'Working days': 'வேலை நாட்கள்',
  'Applied to every working day. You can set each day in Settings later.':
    'எல்லா வேலை நாட்களுக்கும் பொருந்தும். ஒவ்வொரு நாளையும் பிறகு அமைப்புகளில் மாற்றலாம்.',
  'Open time': 'திறக்கும் நேரம்',
  'Close time': 'மூடும் நேரம்',
  'How do customers get serviced?':
    'வாடிக்கையாளர்களுக்கு எப்படி சர்வீஸ் செய்வீர்கள்?',
  'They come to my garage': 'அவர்கள் என் கேரேஜுக்கு வருவார்கள்',
  'I also go to them': 'நானும் அவர்களிடம் செல்வேன்',
  'Up to how many km from your garage?': 'உங்கள் கேரேஜிலிருந்து எத்தனை km வரை?',
  "Optional. Leave it empty to use {km} km. Customers further away won't see you for doorstep jobs. You can draw an exact area later in Settings.":
    'விருப்பம். காலியாக விட்டால் {km} km. அதைவிடத் தொலைவில் உள்ள வாடிக்கையாளர்களுக்கு வீட்டுக்கே வந்து செய்யும் வேலைகளில் நீங்கள் தெரியமாட்டீர்கள். சரியான பகுதியைப் பிறகு அமைப்புகளில் வரையலாம்.',
  'Customers are only offered times when you have room for one more car.':
    'இன்னொரு காருக்கு இடம் இருக்கும் நேரங்கள் மட்டுமே வாடிக்கையாளர்களுக்குக் காட்டப்படும்.',
  // ─── Sign-up: step 4 ───
  'Exterior / foam wash': 'வெளிப்புற / ஃபோம் வாஷ்',
  'Interior cleaning & vacuum': 'உட்புற க்ளீனிங் & வேக்யூம்',
  'Full detailing': 'முழு டீடெய்லிங்',
  'Ceramic / paint protection': 'செராமிக் / பெயிண்ட் பாதுகாப்பு',
  'Polishing & buffing': 'பாலிஷிங் & பஃபிங்',
  'Denting & painting': 'டென்டிங் & பெயிண்டிங்',
  'General / periodic service': 'பொது / காலமுறை சர்வீஸ்',
  'AC service & repair': 'AC சர்வீஸ் & ரிப்பேர்',
  'Battery service': 'பேட்டரி சர்வீஸ்',
  'Windshield & glass': 'விண்ட்ஷீல்ட் & கண்ணாடி',
  'EV servicing': 'EV சர்வீஸ்',
  'Failed to add service': 'சர்வீஸைச் சேர்க்க முடியவில்லை',
  'Failed to finish onboarding': 'பதிவை முடிக்க முடியவில்லை',
  'Services & vehicles': 'சர்வீஸ்கள் & வாகனங்கள்',
  'Add what you sell. You can add more, and packages, in Services later.':
    'நீங்கள் வழங்குவதைச் சேர்க்கவும். மேலும் சர்வீஸ்களையும் பேக்கேஜ்களையும் பிறகு சர்வீஸ்களில் சேர்க்கலாம்.',
  'Quick add a common service': 'பொதுவான சர்வீஸை விரைவாகச் சேர்க்கவும்',
  'Tap a preset or type a custom name below, then set price & duration.':
    'ஒன்றைத் தட்டவும் அல்லது கீழே உங்கள் பெயரை டைப் செய்யவும், பிறகு விலையும் நேரமும் அமைக்கவும்.',
  '{label} (₹)': '{label} (₹)',
  Duration: 'நேரம்',
  '{count} service added.': '{count} சர்வீஸ் சேர்க்கப்பட்டது.',
  '{count} services added.': '{count} சர்வீஸ்கள் சேர்க்கப்பட்டன.',
  'Vehicle types handled': 'கையாளும் வாகன வகைகள்',
  'These are the vehicle types customers can book for, and the tiers you price against when a service uses per-vehicle pricing.':
    'வாடிக்கையாளர்கள் புக் செய்யக்கூடிய வாகன வகைகள் இவை; வாகனத்துக்கு ஏற்ற விலை உள்ள சர்வீஸ்களுக்கு நீங்கள் விலை வைக்கும் வகைகளும் இவையே.',
  'Opening dashboard...': 'டாஷ்போர்டைத் திறக்கிறது...',
  'Go to dashboard': 'டாஷ்போர்டுக்குச் செல்லவும்',
  // ─── Bookings › Calendar (#125): Month and Day, the switch's quiet lines ───
  Calendar: 'காலண்டர்',
  'Calendar view': 'காலண்டர் பார்வை',
  '{count} waiting': '{count} காத்திருக்கிறது',
  '{count} today': 'இன்று {count}',
  '{count} job': '{count} வேலை',
  '{count} jobs': '{count} வேலைகள்',
  '{count} done': '{count} முடிந்தது',
  'No jobs': 'வேலை இல்லை',
  'Today · {date}': 'இன்று · {date}',
  '{jobs} · open {open} – {close}': '{jobs} · திறந்திருக்கும் நேரம் {open} – {close}',
  'Nothing booked on this day.': 'இந்த நாளில் புக்கிங் எதுவும் இல்லை.',
  'Nothing booked on this day yet.': 'இந்த நாளில் இன்னும் புக்கிங் எதுவும் இல்லை.',
  'To answer': 'பதில் தேவை',
  'Answer · {mins} min': 'பதில் · {mins} min',
  '{count} bay': '{count} பே',
  '{count} bays': '{count} பேக்கள்',
  'On the road': 'வெளி வேலைகள்',
  'Closes {time}': '{time}-க்கு மூடப்படும்',
  Free: 'காலி',
  'Closed · Weekly holiday': 'மூடப்பட்டது · வார விடுமுறை',
  'Time off · {reason}': 'விடுமுறை · {reason}',
  'Customers can’t book this day. Change it in Settings → {where}.':
    'இந்த நாளில் வாடிக்கையாளர்கள் புக் செய்ய முடியாது. அமைப்புகள் → {where}-ல் மாற்றவும்.',
  today: 'இன்று',
  closed: 'மூடப்பட்டது',
  '{count} to answer': 'பதில் தர {count}',
  '{start} to {end}': '{start} முதல் {end} வரை',
  // ─── "Up to N km" or "All over <city>" (0069), in Settings and onboarding ───
  'How far you go': 'எவ்வளவு தூரம் வருவீர்கள்',
  'How far you travel for doorstep jobs':
    'வீட்டுக்கே வந்து செய்யும் வேலைகளுக்கு எவ்வளவு தூரம் வருவீர்கள்',
  'You go to any address in {city}.': '{city}-ல் எந்த முகவரிக்கும் நீங்கள் வருவீர்கள்.',
  "How far you'll travel for doorstep jobs, up to {max} km. Leave empty to use {km} km.":
    'வீட்டுக்கே வந்து செய்யும் வேலைகளுக்கு நீங்கள் எவ்வளவு தூரம் வருவீர்கள், அதிகபட்சம் {max} km. காலியாக விட்டால் {km} km.',
  'How far you collect from': 'எவ்வளவு தூரத்திலிருந்து காரை எடுப்பீர்கள்',
  'You collect from any address in {city}.':
    '{city}-ல் எந்த முகவரியிலிருந்தும் நீங்கள் காரை எடுப்பீர்கள்.',
  // ─── Garage Book (the portal only) ───
  'Garage app': 'கேரேஜ் ஆப்',
  'Today, closed': 'இன்று, கணக்கு முடிந்தது',
  'No signal. Save it when you are back online.':
    'சிக்னல் இல்லை. மீண்டும் ஆன்லைனுக்கு வந்ததும் சேமிக்கவும்.',
  'No signal: the website can’t save without the internet. The Detlio for Garages app saves it on your phone and sends it later.':
    'சிக்னல் இல்லை: இன்டர்நெட் இல்லாமல் வெப்சைட்டால் சேமிக்க முடியாது. Detlio for Garages ஆப் இதை உங்கள் போனில் சேமித்து, பிறகு அனுப்பும்.',
  "Only the garage's owner sees money.":
    'கேரேஜ் உரிமையாளர் மட்டுமே பண விவரங்களைப் பார்க்க முடியும்.',
  "Only the garage's owner sees Stats.":
    'கேரேஜ் உரிமையாளர் மட்டுமே புள்ளிவிவரத்தைப் பார்க்க முடியும்.',
  // ─── Garage Book Stages 2 and 3 (the portal only) ───
  "Couldn't share it. Try again.": 'பகிர முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'the bill': 'பில்லை',
  'Spent by kind': 'வகை வாரியாகச் செலவு',
  'For who': 'யாருக்கு',
  'Note (if you like)': 'குறிப்பு (விரும்பினால்)',
  'Up to {count} pages at a time.': 'ஒரே நேரத்தில் {count} பக்கங்கள் வரை.',
  '{name} is too big. Try a smaller photo.':
    '{name} மிகப் பெரியது. சிறிய போட்டோவை முயற்சிக்கவும்.',
  '{name} is too big. Try a smaller file.': '{name} மிகப் பெரியது. சிறிய ஃபைலை முயற்சிக்கவும்.',
  "Couldn't read that file. Try another.":
    'அந்த ஃபைலைப் படிக்க முடியவில்லை. வேறொன்றை முயற்சிக்கவும்.',
  "Couldn't read your book. Try clearer photos.":
    'உங்கள் புத்தகத்தைப் படிக்க முடியவில்லை. தெளிவான போட்டோக்களை முயற்சிக்கவும்.',
  "Couldn't add them. Try again.": 'சேர்க்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'Added to your book': 'உங்கள் புத்தகத்தில் சேர்க்கப்பட்டது',
  '{count} new customer': '{count} புதிய வாடிக்கையாளர்',
  '{count} new customers': '{count} புதிய வாடிக்கையாளர்கள்',
  '{count} matched one you had': '{count} ஏற்கனவே உள்ளவருடன் பொருந்தியது',
  '{count} matched ones you had': '{count} ஏற்கனவே உள்ளவர்களுடன் பொருந்தின',
  'Bring in more': 'மேலும் கொண்டுவரவும்',
  'Bring in from': 'எதிலிருந்து கொண்டுவர',
  'Take out page {count}': 'பக்கம் {count}-ஐ நீக்கவும்',
  'Choose photos of your book': 'உங்கள் புத்தகத்தின் போட்டோக்களைத் தேர்ந்தெடுக்கவும்',
  'Choose a file': 'ஒரு ஃபைலைத் தேர்ந்தெடுக்கவும்',
  'Excel, CSV or a Tally export': 'Excel, CSV அல்லது Tally export',
  'Choose a spreadsheet': 'Excel ஃபைலைத் தேர்ந்தெடுக்கவும்',
  'Take a clear photo of each page of your book, up to {count}. We read names, phones, number plates and what is owed. Nothing is added until you say so.':
    'உங்கள் புத்தகத்தின் ஒவ்வொரு பக்கத்தையும் தெளிவாக போட்டோ எடுக்கவும், {count} பக்கங்கள் வரை. பெயர்கள், போன்கள், நம்பர் பிளேட்கள், பாக்கி ஆகியவற்றைப் படிப்போம். நீங்கள் சொல்லும் வரை எதுவும் சேர்க்கப்படாது.',
  'An Excel or CSV file with a name, phone or number plate in each row, or a Tally export. Nothing is added until you say so.':
    'ஒவ்வொரு வரியிலும் பெயர், போன் அல்லது நம்பர் பிளேட் உள்ள Excel அல்லது CSV ஃபைல், அல்லது Tally export. நீங்கள் சொல்லும் வரை எதுவும் சேர்க்கப்படாது.',
  'Read my book': 'என் புத்தகத்தைப் படிக்கவும்',
  'Read the file': 'ஃபைலைப் படிக்கவும்',
  '{count} needs a look.': '{count} பார்க்க வேண்டும்.',
  '{count} need a look.': '{count} பார்க்க வேண்டும்.',
  'Tap Check to fix a row, or leave it out. Someone already in your book is matched, never added twice.':
    'ஒரு வரியைச் சரிசெய்ய பார்க்கவும் என்பதைத் தட்டவும், அல்லது அதை விட்டுவிடவும். ஏற்கனவே புத்தகத்தில் உள்ளவர் பொருத்தப்படுவார், இரண்டு முறை சேர்க்கப்பட மாட்டார்.',
  '{count} to check': '{count} பார்க்க வேண்டியவை',
  'Phone not clear': 'போன் தெளிவாக இல்லை',
  'Number plate not clear': 'நம்பர் பிளேட் தெளிவாக இல்லை',
  'Date not clear': 'தேதி தெளிவாக இல்லை',
  'Amount owed not clear': 'பாக்கித் தொகை தெளிவாக இல்லை',
  'Needs a look': 'பார்க்க வேண்டும்',
  'Check this row': 'இந்த வரியைச் சரிபார்க்கவும்',
  '{name} is already in your book. Adding it fills in what is new; no one is added twice.':
    '{name} ஏற்கனவே உங்கள் புத்தகத்தில் உள்ளார். சேர்த்தால் புதியவை மட்டும் நிரப்பப்படும்; யாரும் இரண்டு முறை சேர்க்கப்பட மாட்டார்கள்.',
  'Owes (₹)': 'பாக்கி (₹)',
  "Couldn't copy. Press and hold the link to copy it.":
    'காப்பி செய்ய முடியவில்லை. லிங்கை அழுத்திப் பிடித்து காப்பி செய்யவும்.',
  'Show {service} on your page': '{service}-ஐ உங்கள் பக்கத்தில் காட்டவும்',
  'Print poster': 'போஸ்டரை பிரிண்ட் செய்யவும்',
  "Couldn't load your booking link.": 'உங்கள் புக்கிங் லிங்கை ஏற்ற முடியவில்லை.',
  'Getting your poster…': 'போஸ்டர் தயாராகிறது…',
  'your payment details': 'உங்கள் பேமெண்ட் விவரங்களை',
  'Upload failed. Try again.': 'அப்லோட் ஆகவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'QR saved': 'QR சேமிக்கப்பட்டது',
  "That picture couldn't be read. Try a screenshot of your QR.":
    'அந்தப் படத்தைப் படிக்க முடியவில்லை. உங்கள் QR-இன் ஸ்கிரீன்ஷாட்டை முயற்சிக்கவும்.',
  'Add your QR so unpaid bills carry it.': 'செலுத்தாத பில்களில் வர, உங்கள் QR-ஐச் சேர்க்கவும்.',
  'Choose your UPI QR picture': 'உங்கள் UPI QR படத்தைத் தேர்ந்தெடுக்கவும்',
  'Reading…': 'படிக்கிறது…',
  'Your garage’s phone. Change it if customers pay on another.':
    'உங்கள் கேரேஜின் போன். வாடிக்கையாளர்கள் வேறு நம்பருக்குச் செலுத்தினால் மாற்றவும்.',
  'A mobile number has 10 digits.': 'மொபைல் நம்பரில் 10 இலக்கங்கள் இருக்கும்.',
  'Apps it takes': 'ஏற்கும் ஆப்கள்',
  '“{line}” in the WhatsApp': 'WhatsApp மெசேஜில் “{line}”',
  '{count} customer came back after a reminder':
    'நினைவூட்டலுக்குப் பிறகு {count} வாடிக்கையாளர் மீண்டும் வந்தார்',
  '{count} customers came back after a reminder':
    'நினைவூட்டலுக்குப் பிறகு {count} வாடிக்கையாளர்கள் மீண்டும் வந்தனர்',
  '{amount} pack': '{amount} பேக்',
  'Running low': 'தீரப்போகிறது',
  'About {count} job left': 'சுமார் {count} வேலைக்கு மீதம்',
  'About {count} jobs left': 'சுமார் {count} வேலைகளுக்கு மீதம்',
  'none used this month': 'இந்த மாதம் பயன்படுத்தவில்லை',
  'How much is on the shelf now? It replaces what the book thinks is left.':
    'இப்போது ஷெல்ஃபில் எவ்வளவு உள்ளது? புத்தகம் கணக்கிட்ட மீதத்துக்குப் பதிலாக இது வைக்கப்படும்.',
  'On the shelf ({unit})': 'ஷெல்ஃபில் ({unit})',
  '{service} uses': '{service}-க்கு ஆகும் அளவு',
  'Save what each job uses': 'ஒரு வேலைக்கு ஆகும் அளவைச் சேமிக்கவும்',
  'what to order': 'ஆர்டர் செய்ய வேண்டியவற்றை',
  "Couldn't send the order. Try again.": 'ஆர்டரை அனுப்ப முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'no WhatsApp number': 'WhatsApp நம்பர் இல்லை',
  'Add your supplier': 'உங்கள் சப்ளையரைச் சேர்க்கவும்',
  'Their name and WhatsApp number': 'அவர்களின் பெயரும் WhatsApp நம்பரும்',
  'Packs of {name}': '{name} பேக்குகள்',
  'Your suppliers': 'உங்கள் சப்ளையர்கள்',
  'New supplier': 'புதிய சப்ளையர்',
  'Sri Balaji Supplies': 'ஸ்ரீ பாலாஜி சப்ளைஸ்',
  WhatsApp: 'WhatsApp',
  'your stock': 'உங்கள் ஸ்டாக்கை',
  'Add stock': 'ஸ்டாக் சேர்க்கவும்',
  'Add someone': 'ஒருவரைச் சேர்க்கவும்',
  'jobs today': 'இன்றைய வேலைகள்',
  'jobs this month': 'இந்த மாத வேலைகள்',
  '{name} added': '{name} சேர்க்கப்பட்டார்',
  'Phone (if you like)': 'போன் (விரும்பினால்)',
  '{name} removed': '{name} நீக்கப்பட்டார்',
  'Tap again to remove {name}': '{name}-ஐ நீக்க மீண்டும் தட்டவும்',
  'Remove from team': 'டீமிலிருந்து நீக்கவும்',
  '{month} · before, {amount}': '{month} · முன்பு {amount}',
  '{name} came back after your reminder': 'உங்கள் நினைவூட்டலுக்குப் பிறகு {name} மீண்டும் வந்தார்',
  Less: 'குறைக்கவும்',
  'What it is': 'என்ன பொருள்',
  'Counted in': 'அளக்கும் அலகு',
  'How much is here': 'இப்போது எவ்வளவு உள்ளது',
  'One pack holds': 'ஒரு பேக்கில் எவ்வளவு',
  'Supplier name': 'சப்ளையர் பெயர்',
  'Remove from stock': 'ஸ்டாக்கிலிருந்து நீக்கவும்',
}
