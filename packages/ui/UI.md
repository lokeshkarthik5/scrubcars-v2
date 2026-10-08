# Detlio — UI specification

## Brand palette

| Token | Hex | Usage |
|---|---|---|
| `brand-red` | `#E33402` | Primary actions, CTAs, active states, accent |
| `black` | `#0A0A0A` | Primary text, backgrounds |
| `white` | `#FAFAFA` | Surfaces, cards, screen backgrounds |
| `grey` | `#151515` | Secondary backgrounds, nav bars, input fields |

### Derived tokens
```
background:        #0A0A0A   (app background)
surface:           #151515   (cards, inputs, nav)
surface-elevated:  #1E1E1E   (modals, bottom sheets)
text-primary:      #FAFAFA
text-secondary:    #9A9A9A
text-muted:        #555555
border:            #2A2A2A
accent:            #E33402
accent-hover:      #C42D02
accent-muted:      rgba(227, 52, 2, 0.12)
```

> Dark-first app. All screens use `#0A0A0A` as the page canvas.

---

## Typography

- **Font**: Inter (Google Fonts)
- **Weights used**: 400 regular, 500 medium, 600 semibold
- **Scale**:

| Role | Size | Weight |
|---|---|---|
| Screen title | 18px | 600 |
| Section heading | 14px | 600 |
| Body | 13px | 400 |
| Label | 12px | 500 |
| Caption / muted | 11px | 400 |
| Micro | 10px | 500 |

---

## Component rules

### Buttons
```
Primary:   bg #E33402, text #FAFAFA, border-radius 10px, padding 12px 0, width 100%, font 14px/600
Secondary: bg transparent, border 0.5px #2A2A2A, text #FAFAFA, same radius/padding
Ghost:     bg transparent, no border, text #E33402
```

### Inputs
```
bg: #151515
border: 0.5px solid #2A2A2A
border-radius: 10px
padding: 10px 12px
font-size: 13px
color: #FAFAFA
placeholder: #555555
focus border: #E33402
```

### Cards
```
bg: #151515
border: 0.5px solid #2A2A2A
border-radius: 14px
padding: 12px 14px
```

### Badges
```
Active / success:  bg rgba(34,197,94,0.12),  text #22C55E
Pending / amber:   bg rgba(234,179,8,0.12),  text #EAB308
Inactive / muted:  bg #1E1E1E,               text #9A9A9A, border 0.5px #2A2A2A
Accent:            bg rgba(227,52,2,0.12),   text #E33402
```

### Nav bar
```
bg: #151515
border-top: 0.5px solid #2A2A2A
active icon/label: #E33402
inactive: #555555
```

### OTP input
```
6 individual boxes
each: 44px × 50px, bg #151515, border 0.5px #2A2A2A, border-radius 10px
filled: border #E33402, text #FAFAFA
active: border #E33402
```

### Progress bar (onboarding)
```
track: #151515
fill: #E33402
height: 3px
border-radius: 2px
```

### Stars (rating)
```
color: #E33402  (use brand red, not gold)
```

### Toggle (doorstep / drop-in)
```
container: bg #151515, border-radius 10px, padding 2px
active tab: bg #E33402, text #FAFAFA, border-radius 8px
inactive tab: bg transparent, text #9A9A9A
```

---

## Screen specifications

---

### CUSTOMER APP

---

#### Screen 1 — Login

**Route**: `/login`

**Layout**:
- Full screen, centered column, `bg #0A0A0A`
- Logo icon (droplet) + app name at top, centered
- Tagline below name

**Elements**:
```
Logo:        ti-droplet icon, 40px, color #E33402
App name:    "Detlio", 22px/600, #FAFAFA
Tagline:     "Car care at your doorstep", 13px/400, #9A9A9A

Label:       "Mobile number", 11px/500, #9A9A9A
Input:       +91 prefix locked, number entry, focus border #E33402
CTA:         "Send OTP" — primary button
T&C note:    "By continuing you agree to our Terms & Privacy Policy"
             11px, #555555, centered, bottom of screen
```

**Behaviour**:
- Validate 10-digit Indian mobile number before enabling CTA
- On submit → navigate to `/verify-otp`

---

#### Screen 2 — Verify OTP

**Route**: `/verify-otp`

**Layout**:
- Back arrow top left
- Centered icon + instruction text
- 6-box OTP input row
- Countdown timer
- Two actions below

**Elements**:
```
Icon:         ti-message, 32px, #E33402
Heading:      "Enter the OTP sent to", 13px/500, #FAFAFA
Phone:        "+91 98765 43210", 13px/600, #E33402
OTP boxes:    6 individual inputs (see OTP input spec above)
Timer:        "Expires in 04:32", 11px, #9A9A9A, centered
Primary CTA:  "Verify OTP"
Ghost CTA:    "Resend OTP" — disabled until timer expires
```

**Behaviour**:
- Auto-advance focus box on digit entry
- Auto-submit on 6th digit
- On verified + first-time user → `/profile-setup`
- On verified + returning user → `/home`
- On resend: reset 5-min timer, issue new OTP

---

#### Screen 3 — Profile setup (first-time only)

**Route**: `/profile-setup`

**Layout**:
- No back arrow (can't go back to OTP)
- Progress bar at top (step 1 of 1 for customer)
- Form fields
- Note below CTA

**Elements**:
```
Progress bar: 100% fill (single step for customer)
Heading:      "Complete your profile", 15px/600, centered

Label:        "Full name"
Input:        text, placeholder "Your name"

Label:        "Your area"
Location row: two equal buttons side by side
  - "Detect via GPS"  — ti-current-location icon, accent color
  - "Search area"     — ti-search icon
Pincode/area display: once detected/selected
  bg #151515, border #E33402, text #E33402, check icon right

CTA:          "Get started" — primary button
Note:         "You can update this anytime from your profile"
              11px, #555555, centered
```

**Behaviour**:
- GPS detect → reverse geocode → fill area name + pincode
- Manual search → pincode input → resolve area name
- On submit → `PATCH /users/me` with name + location → navigate to `/home`

---

#### Screen 4 — Home

**Route**: `/home`

**Layout**:
- Top bar: location pill left, bell icon right
- Doorstep / Drop-in toggle
- Section: Categories (2×2 grid)
- Section: Featured garages (vertical list)
- Bottom nav

**Elements**:
```
Top bar:
  Location:  ti-map-pin #E33402, area name 13px/500
  Bell:      ti-bell, #9A9A9A

Toggle:      "Doorstep" | "Drop-in"  (see toggle spec)

Categories grid:
  Car wash       — ti-droplet
  Detailing      — ti-sparkles
  Coating        — ti-shield
  Scratch removal — ti-tool
  each: card 14px with icon left, label right

Featured garages:
  each card contains:
    - Avatar (icon in accent-muted bg), vendor name, distance + type
    - Star rating (red), review count, Open/Closed badge
    - Starting price right-aligned

Bottom nav:  Home · Search · Bookings · Profile
```

**First-time login**: show success toast — "Welcome, [name]! Find your first car wash." — bg #151515, border-left 3px #E33402, auto-dismiss 3s.

---

#### Screen 5 — Search & listings

**Route**: `/search`

**Layout**:
- Search bar at top (full width, bg #151515)
- Filter chips row (scrollable horizontal)
- Result count label
- Vendor cards list

**Elements**:
```
Search bar:   ti-search icon left, placeholder "Search garages or services"
Filters:      Distance · Rating · Price · Filter (ti-adjustments)
              active filter: bg accent-muted, text #E33402, border #E33402
              inactive: bg #151515, border #2A2A2A, text #9A9A9A

Vendor card:
  Row 1: avatar, name, area · distance, Open/Busy/Closed badge
  Row 2: stars (red), rating, review count, price right
  Row 3: service tags (small grey badges)
```

---

#### Screen 6 — Garage profile

**Route**: `/garage/:id`

**Layout**:
- Back arrow + vendor name in top bar (no favourite heart: favourites are not saved anywhere, so a heart would reset on reload)
- Photo strip (horizontal scroll, 80px height, bg #151515 placeholder)
- Tabs: Services · Photos · Reviews
- Content below tabs

**Services tab**:
```
Each service card:
  - Name (bold) + price right
  - Category badge (muted) + duration
  - "Select" tap highlights card with accent border
```

**Reviews tab**:
```
Aggregate: large rating number + stars + review count
Each review:
  - Avatar initials circle, name, date, stars (red)
  - Comment text, 13px #9A9A9A
```

**Bottom**:
```
Sticky CTA: "Book now" — primary button
```

---

#### Screen 7 — Booking flow

**Route**: `/book/:vendorId`

**Layout**: Single scroll screen, sectioned

**Sections**:
```
1. Selected service
   Card: service name, vendor name, duration, price right

2. Pick a slot
   Label: date (Today / Tomorrow / date)
   Slot chips: horizontal scroll, time chips
     selected: bg #E33402, text #FAFAFA
     available: bg #151515, border #2A2A2A, text #FAFAFA
     unavailable: bg #0A0A0A, text #555555, strike-through

3. Car details
   Saved vehicle selector (default pre-selected)
   "Add new vehicle" ghost link

4. Doorstep address (shown only if booking_type = doorstep)
   Saved address selector (default pre-selected)
   "Add new address" ghost link

5. Payment method
   Row: ti-credit-card "Online (Razorpay)"  [selected indicator]
   Row: ti-cash "Cash on service"

Sticky bottom:
   "Confirm · ₹299" — primary button
   Price updates dynamically from selected service
```

---

#### Screen 8 — Order tracking

**Route**: `/bookings/:id`

**Layout**:
- Back arrow + booking ID in top bar
- Booking summary card
- Status stepper
- Payment summary card
- Review card (shown only after status = completed)
- Bottom nav

**Status stepper**:
```
Steps: Confirmed → Technician on the way → In progress → Completed
done step:    dot bg rgba(34,197,94,0.12), icon ti-check, text #22C55E
current step: dot bg accent-muted, icon animated pulse, text #E33402
waiting step: dot bg #151515, border #2A2A2A, text #555555
```

**Review card** (post-completion):
```
Stars: 5 tappable red stars
Input: "Tell us about your experience" placeholder
CTA:   "Submit review" — primary button
Hidden until booking.status = completed
```

---

---

### VENDOR PANEL

---

#### Screen V1 — Vendor login

Same as customer login. Same OTP flow.
On first-time verified vendor → `/vendor/onboarding/step-1`
On returning vendor → `/vendor/home`

---

#### Screen V2 — Vendor onboarding: Step 1 — Business info

**Route**: `/vendor/onboarding/step-1`

**Layout**:
- No back arrow
- Progress bar: 25% fill
- Step label: "Step 1 of 4 — Business info"

**Fields**:
```
Business name     text input
Owner name        text input
Mobile number     pre-filled + locked (from OTP), bg #0A0A0A, text #555555
City              text input

CTA: "Continue"
```

---

#### Screen V3 — Vendor onboarding: Step 2 — Location

**Route**: `/vendor/onboarding/step-2`

**Layout**:
- Back arrow
- Progress bar: 50% fill
- Step label: "Step 2 of 4 — Your garage location"

**Fields**:
```
Full address      textarea, 3 rows
Location pin:
  Two buttons side by side:
    "Pin on map"     ti-map-pin
    "Detect GPS"     ti-current-location
  Confirmation display once set:
    "14, Gandhi Nagar, Adyar, Chennai – 600020"
    bg #151515, border #E33402, ti-check icon

CTA: "Continue"
```

---

#### Screen V4 — Vendor onboarding: Step 3 — Garage setup

**Route**: `/vendor/onboarding/step-3`

**Layout**:
- Back arrow
- Progress bar: 75% fill
- Step label: "Step 3 of 4 — Garage setup"

**Sections**:

```
Job types
  Row: "Accept doorstep jobs"   [toggle]
  Row: "Accept drop-in jobs"    [toggle]
  Toggle on:  bg #E33402
  Toggle off: bg #2A2A2A

Slot interval
  Chip selector: 30 min · 45 min · 60 min
  selected: bg #E33402, text #FAFAFA

Working hours
  Sub-label: "Set the same hours for all days, customise later"
  Two inputs side by side: Open time | Close time  (time pickers)
  "Set different hours per day" ghost link → expands per-day rows

Service areas
  Pincode input + "Add" button
  Added areas display as removable chips:
    "600020 — Adyar  ×"
    "600042 — Velachery  ×"

CTA: "Continue"
```

---

#### Screen V5 — Vendor onboarding: Step 4 — Add first service

**Route**: `/vendor/onboarding/step-4`

**Layout**:
- Back arrow
- Progress bar: 100% fill
- Step label: "Step 4 of 4 — Add a service"

**Form**:
```
Service name      text input
Category          chip selector:
                    Car wash · Detailing · Coating · Scratch removal
                    selected: bg accent-muted, border #E33402, text #E33402
Price (₹)         number input
Duration          chip selector: 30 · 45 · 60 · 90 · 120 · 180 min

CTA:    "Add service" — primary
Ghost:  "+ Add another service" — appears after first is added
Final:  "Go to dashboard" — once at least one service added
```

---

#### Screen V6 — Vendor home / dashboard

**Route**: `/vendor/home`

**Layout**:
- Top bar: "Good morning, [name]" left, bell right
- Status banner (if not verified)
- Quick stats row
- Incoming bookings section
- Bottom nav: Home · Bookings · Earnings · Settings

**Status banner** (shown when `is_verified = false`):
```
bg rgba(234,179,8,0.08), border-left 3px #EAB308
"Your profile is under review. You'll be notified once verified."
```

**Quick stats**:
```
2-col grid of metric cards:
  Today's jobs   | Pending requests
  This week (₹)  | Avg rating
```

**Incoming bookings** (up to 3, "See all" link):
```
Each card: customer name, service, time, type badge, Accept/Reject buttons
```

---

#### Screen V7 — Vendor bookings

**Route**: `/vendor/bookings`

**Layout**:
- Top bar: "Bookings" + new request count badge
- Tabs: Incoming · Upcoming · Completed
- List of booking cards per tab

**Incoming card**:
```
Customer name + New badge
Service · Date/time · Doorstep or Drop-in
Vehicle: make, model, plate
[Reject] [Accept] — two equal buttons
```

**Upcoming card**:
```
Customer name + Confirmed badge
Service · Date/time
[Mark in progress] — full-width accent button
```

**In progress card**:
```
Customer name + In progress badge (red)
Service · started time
[Mark completed] — full-width accent button
```

**Completed card**:
```
Customer name + Completed badge (green)
Service · date
Star rating + comment (if reviewed)
```

---

#### Screen V8 — Vendor earnings

**Route**: `/vendor/earnings`

**Layout**:
- Top bar: "Earnings" + week/month selector (right)
- 2×2 metric grid
- Divider
- Recent jobs list

**Metric cards**:
```
Total earned  — #22C55E
Jobs done     — #FAFAFA
Pending       — #EAB308
Avg rating    — #E33402 star
```

**Recent jobs list**:
```
Each row:
  Left:  service name + customer name, date + type
  Right: amount (green if settled, amber if pending)
         + Pending badge if applicable
```

---

#### Screen V9 — Vendor settings

**Route**: `/vendor/settings`

**Layout**:
- Sections: Profile · Working hours · Service areas · Services · Job types

**Working hours section**:
```
Per-day rows: Mon Tue Wed Thu Fri Sat Sun
Each row: day label | open time | close time | Closed toggle
Closed toggle on: row dims to #555555
```

**Service areas section**:
```
Pincode input + Add button
Chips: "600020 — Adyar ×"
```

**Services section**:
```
List of service cards with Edit + Active/Inactive toggle
"+ Add service" button at bottom
```

---

#### Screen V10 — Vendor reviews

**Route**: `/vendor/reviews`

**Layout**:
- Aggregate: large rating + red stars + review count
- List of review cards

**Review card**:
```
Avatar initials circle (bg accent-muted, text #E33402)
Name + date + stars (red)
Comment text, 13px #9A9A9A
Booking context: "Basic wash · 12 Jun" — muted caption
```

---

## Navigation

### Customer bottom nav
```
Home        ti-home
Search      ti-search
Bookings    ti-calendar
Profile     ti-user
```

### Vendor bottom nav
```
Home        ti-home
Bookings    ti-calendar
Earnings    ti-chart-bar
Settings    ti-settings
```

---

## Icon library
Use **Tabler icons** (outline only). `ti-` prefix.

```
ti-droplet           car wash / logo
ti-sparkles          detailing
ti-shield            coating
ti-tool              scratch removal
ti-map-pin           location
ti-current-location  GPS detect
ti-phone             mobile
ti-message           OTP
ti-car               vehicle
ti-credit-card       online payment
ti-cash              cash payment
ti-check             confirmed / verified
ti-calendar          bookings
ti-chart-bar         earnings
ti-settings          settings
ti-bell              notifications
ti-user              profile
ti-search            search
ti-adjustments       filters
ti-home              home
ti-star              rating
ti-edit              edit
ti-trash             delete
ti-plus              add
ti-x                 remove / close
ti-arrow-left        back
ti-arrow-right       forward / next
ti-building-store    vendor / garage
ti-circle-check      success state
```

---

## Spacing & layout

```
Screen padding:     16px horizontal
Card gap:           8px vertical between cards
Section gap:        20px between sections
Inner card gap:     8px between rows inside a card
Border radius:
  Cards:            14px
  Inputs/buttons:   10px
  Chips/badges:     6px
  Avatars:          50% (circle)
  Avatar squares:   10px
```

---

## Data states to handle

Every list screen must handle:

| State | Treatment |
|---|---|
| Loading | Skeleton cards (bg #151515, shimmer animation) |
| Empty | Icon + heading + sub-text + CTA if actionable |
| Error | Icon ti-alert-circle + message + Retry button |

**Empty state copy examples**:
- No bookings: "No bookings yet" / "Book your first car wash"
- No services (vendor): "Add a service to go live"
- No reviews: "Reviews will appear after your first completed job"

---

## Toast / notification style

```
Position:     top of screen, 16px margin
bg:           #151515
border-left:  3px solid [accent based on type]
  success:    #22C55E
  error:      #E33402
  warning:    #EAB308
  info:       #3B82F6
text:         #FAFAFA, 13px
auto-dismiss: 3 seconds
border-radius: 10px
```