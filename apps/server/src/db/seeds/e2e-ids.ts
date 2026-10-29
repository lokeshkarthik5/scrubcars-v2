/**
 * Frozen identifiers for the E2E fixture data.
 *
 * Every id the suite touches is pinned here rather than discovered at runtime,
 * so a spec can navigate straight to /garage/<id> without first querying for
 * it. That removes a whole class of ordering assumption: no test depends on
 * "the first vendor in the list" being the one it meant.
 *
 * This module is imported by both the seed (apps/server) and the test helpers
 * (apps/e2e/support/seed-ids.ts). It deliberately has no imports of its own so
 * either side can load it without dragging in a database client.
 */

/** Builds a valid v4-shaped UUID with a readable numeric tail. */
const id = (n: number): string =>
  `e2e00000-0000-4000-8000-${String(n).padStart(12, '0')}`

/**
 * A UUID whose first eight characters are chosen. A booking's reference — the
 * "#3F2A9C1B" customers read out to ops — is the first eight characters of
 * its id, and every `id()` above starts "e2e00000", so every fixture booking
 * shares one reference. The admin search spec finds a booking by reference,
 * so its bookings need references of their own. `prefix` must be 8 hex digits.
 */
const refId = (prefix: string): string => `${prefix}-0000-4000-8000-000000000000`

/**
 * CUSTOMERS.vehicles' car that a fixture booking names. Declared ahead of
 * CUSTOMERS because that customer's `vehicleId` is this one — the booking is
 * the whole point of the fixture.
 */
const VEHICLE_BOOKED = id(704)

/**
 * Customers, one per concern.
 *
 * Specs run in parallel against a single database that is seeded once per run,
 * so two specs mutating the same customer would flake. Giving each concern its
 * own customer is what makes `fullyParallel` safe without truncating between
 * tests.
 */
/**
 * `vehicleId` is the customer's single car. bookings.vehicle_id is NOT NULL, so
 * every fixture booking needs one, and pinning it here lets a spec assert the
 * car on a booking without a lookup. CUSTOMERS.book is the exception: it owns
 * all three vehicle types (see VEHICLES) because the pricing specs switch
 * between them.
 */
export const CUSTOMERS = {
  browse: { id: id(101), phone: '9000000001', name: 'Browsing Bharathi', vehicleId: id(711) },
  book: { id: id(102), phone: '9000000002', name: 'Booking Bhavana', vehicleId: id(701) },
  cancel: { id: id(103), phone: '9000000003', name: 'Cancelling Chandra', vehicleId: id(713) },
  reschedule: { id: id(104), phone: '9000000004', name: 'Moving Meera', vehicleId: id(714) },
  review: { id: id(105), phone: '9000000005', name: 'Reviewing Ravi', vehicleId: id(715) },
  payLater: { id: id(106), phone: '9000000006', name: 'Unpaid Uma', vehicleId: id(716) },
  coupons: { id: id(107), phone: '9000000007', name: 'Coupon Kavya', vehicleId: id(717) },
  /** Deliberately owns no car and no address — the profile spec adds both. */
  profile: { id: id(108), phone: '9000000008', name: 'Profile Priya', vehicleId: null },
  /**
   * The cross-app journey's customer, with no seeded bookings at all.
   *
   * The journey drives the vendor app and clicks "Accept booking for <name>",
   * so any pre-existing booking for this customer would make that button
   * ambiguous and the run would accept the wrong job.
   */
  journey: { id: id(109), phone: '9000000009', name: 'Journey Jaya', vehicleId: id(718) },
  /**
   * Owns two cars, one of which a booking names. Deleting a car that history
   * points at used to raise a foreign-key error and surface as a 500; it is
   * archived now, and the two cars are what tell archive and hard-delete
   * apart in the same spec.
   */
  vehicles: { id: id(116), phone: '9000000016', name: 'Garage Gowri', vehicleId: VEHICLE_BOOKED },
  /**
   * Doorstep checkout. Owns two addresses — one pinned, one saved without
   * coordinates — because the pinless one is what makes the "pin the exact
   * spot" prompt reachable, and that prompt is the only place a customer can
   * satisfy the server's coverage check.
   */
  doorstep: { id: id(117), phone: '9000000017', name: 'Doorstep Deepa', vehicleId: id(727) },
  /** One per cross-app journey, for the same reason as `journey` above: the
   *  vendor app finds a job by its customer's name. */
  journeyCancel: { id: id(114), phone: '9000000014', name: 'Journey Cancel Chitra', vehicleId: id(723) },
  journeyMove: { id: id(115), phone: '9000000015', name: 'Journey Move Mani', vehicleId: id(724) },
  /**
   * Customers that exist only to own the vendor-side fixture bookings.
   *
   * The vendor app identifies a job by its customer's name ("Accept booking
   * for X"), so a customer who also books through the users specs would put
   * two identically named buttons on the vendor's screen and the vendor spec
   * would accept whichever it found first.
   */
  vendorJob: { id: id(110), phone: '9000000010', name: 'Vendor Job Vimal', vehicleId: id(719) },
  vendorReject: { id: id(111), phone: '9000000011', name: 'Vendor Reject Radha', vehicleId: id(720) },
  /** Owns MAIN's doorstep job — the one the vendor card shows an address and a
   *  map link for. Nothing changes its booking, so any spec can read it. */
  vendorDoorstep: { id: id(118), phone: '9000000018', name: 'Vendor Doorstep Divya', vehicleId: id(728) },
  /** Owns MAIN's job whose time passed with nobody accepting (BOOKINGS.vendorStarted). */
  vendorLate: { id: id(119), phone: '9000000019', name: 'Vendor Late Latha', vehicleId: id(729) },
  /**
   * Owns the admin booking-ops fixtures (BOOKINGS.adminOps*), which ops
   * searches for, annotates, cancels and marks as no-shows. Its session is
   * what proves the ops team's notes never reach the customer's payload.
   */
  adminOps: { id: id(120), phone: '9000000020', name: 'Admin Ops Anand', vehicleId: id(730) },
  /**
   * Owns BOOKING_INTENTS.failed, the checkout the intent-status spec reads.
   * Nobody else's intent may be readable by anyone else, so this customer's
   * one exists for other customers to be refused.
   */
  intents: { id: id(121), phone: '9000000021', name: 'Intent Indira', vehicleId: id(731) },
  /**
   * The other customer the intent-status spec signs in as, to be refused
   * CUSTOMERS.intents' checkout. Its own number, because that spec logs in
   * fresh (a saved token can expire mid-run) and a fresh login clears the
   * number's codes — which would race any other file using it.
   */
  intentsStranger: { id: id(123), phone: '9000000023', name: 'Stranger Selvi', vehicleId: id(732) },
  /**
   * A plain customer the pilot-stats spec signs in as, fresh, to prove a
   * valid customer session is refused the admin-only numbers. Its own number
   * for the same reason as `intentsStranger`.
   */
  pilotStats: { id: id(124), phone: '9000000024', name: 'Pilot Prakash', vehicleId: id(733) },
  /**
   * Owns BOOKINGS.capacityHeld, the one job that fills VENDORS.capacity's only
   * bay tomorrow at 10:00. Nothing signs in as them; the booking is the point.
   */
  capacityHolder: { id: id(125), phone: '9000000025', name: 'Bay Holder Bala', vehicleId: id(734) },
  /**
   * The customer the scheduling spec books as: a full slot, a holiday and a
   * paused garage, all of which must be refused. Nothing they try is ever
   * written, so the file can run alongside anything.
   */
  scheduling: { id: id(126), phone: '9000000026', name: 'Scheduling Sangeetha', vehicleId: id(735) },
  /**
   * The two customers who pay for the same last bay at VENDORS.lastBay, one
   * after the other: the first gets the booking, the second a refund. Their
   * own numbers, because the spec signs in fresh as both.
   */
  raceFirst: { id: id(127), phone: '9000000027', name: 'First Payer Fathima', vehicleId: id(736) },
  raceSecond: { id: id(128), phone: '9000000028', name: 'Second Payer Senthil', vehicleId: id(737) },
  /**
   * Owns BOOKINGS.payLaterFull, an unpaid booking at CAPACITY's already-full
   * 10:00, which must not be payable. Signed in fresh by the scheduling spec.
   */
  payLaterFull: { id: id(129), phone: '9000000029', name: 'Late Payer Lakshmi', vehicleId: id(738) },
  /**
   * The final-bill journey's customers, each owning one in-progress
   * inspection job at VENDORS.inspect (BOOKINGS.billDue / billNone). Their own
   * customers because the garage's job card is found by the customer's name.
   */
  billPayer: { id: id(130), phone: '9000000030', name: 'Bill Payer Bindu', vehicleId: id(739) },
  billSmall: { id: id(131), phone: '9000000031', name: 'Small Bill Sudha', vehicleId: id(740) },
  /** Owns nothing at VENDORS.inspect: must get a 404 for anyone else's bill. */
  billStranger: { id: id(132), phone: '9000000032', name: 'Stranger Sarath', vehicleId: id(741) },
  /** Owns BOOKINGS.jobRecords, which the garage accepts, starts, photographs and completes. */
  jobRecords: { id: id(133), phone: '9000000033', name: 'Job Records Janani', vehicleId: id(742) },
  /**
   * Owns BOOKINGS.billWebhook, whose bill is settled by the Razorpay webhook
   * alone — the app never confirms it — and then paid a second time.
   */
  billWebhook: { id: id(134), phone: '9000000034', name: 'Webhook Payer Vimala', vehicleId: id(743) },
  /**
   * Owns the refunds journey's bookings and its failed checkout, all at
   * VENDORS.refunds (BOOKINGS.refund*, BOOKING_INTENTS.refundOwed). Its own
   * customer so the refunds lists and the customer's pages read only rows
   * that journey controls.
   */
  refunds: { id: id(135), phone: '9000000035', name: 'Refund Revathi', vehicleId: id(744) },
  /**
   * Owns the receipt spec's two paid bookings at MAIN (BOOKINGS.receiptPaid,
   * receiptRefunded), which it only reads (the first read issues each one's
   * receipt number). Its own customer so nothing else changes what those
   * receipts say.
   */
  receipts: { id: id(136), phone: '9000000036', name: 'Receipt Rekha', vehicleId: id(745) },
  /**
   * The other customer the receipt spec signs in as, fresh: refused
   * CUSTOMERS.receipts' receipt, and the owner of BOOKINGS.receiptUnpaid,
   * which has no receipt yet. Its own number for the same reason as
   * `intentsStranger`.
   */
  receiptsStranger: { id: id(137), phone: '9000000037', name: 'Stranger Shankar', vehicleId: id(746) },
  /**
   * Owns the My bookings fixtures at MAIN (BOOKINGS.history*): three still to
   * happen, two over, and two that must be listed under neither — the old
   * half of a move and a booking retired as 'rescheduled'. Its own customer
   * so the two tabs hold exactly these, in an order the spec can assert.
   */
  myBookings: { id: id(138), phone: '9000000038', name: 'History Hema', vehicleId: id(747) },
  /**
   * Owns the Book again fixtures at MAIN (BOOKINGS.rebook*), all over, which
   * the spec only opens checkout from and never pays. A pinned address at
   * ORIGIN, so the doorstep checkout Book again opens reaches its summary.
   */
  bookAgain: { id: id(139), phone: '9000000039', name: 'Rebook Renuka', vehicleId: id(748) },
  /**
   * The Home hub's customers (specs/users/home-api.spec.ts), one per state,
   * all on VENDORS.homePromo, a garage nobody else books and far from
   * ORIGIN, so none of this shows on any other customer's Home.
   *
   * Has a completed, paid job at HOME_PROMO: sees the HUBBOOKED offer
   * (booked_this_garage) and a Book again tile. Reads only.
   */
  homeOffer: { id: id(140), phone: '9000000040', name: 'Hub Offer Oviya', vehicleId: id(749) },
  /** A finished inspection job with a final bill still to pay: the must-act card. */
  homeBill: { id: id(141), phone: '9000000041', name: 'Hub Bill Bharath', vehicleId: id(750) },
  /**
   * Two cars, both on an explicit 10-day interval (so the October–December
   * default never matters): one washed 8 days ago (due in 2 days), the other
   * 13 days ago (overdue by 3). VEHICLES.homeWashSecond is the second.
   */
  homeWash: { id: id(142), phone: '9000000042', name: 'Hub Wash Wahida', vehicleId: id(751) },
  /** No car and no bookings: "Add your car", and no garage offers. */
  homeNew: { id: id(143), phone: '9000000043', name: 'Hub New Nila', vehicleId: null },
  /**
   * A job finished 10 hours ago, with Updates last opened before it: unread
   * rows, then read; and the "Rate your wash" card, then closed. The initial
   * in the name is what Home's "Hey Uday" skips.
   */
  homeUpdates: { id: id(144), phone: '9000000044', name: 'R. Uday', vehicleId: id(753) },
  /**
   * A paid booking at HOME_PROMO in two days, which NOTICES.homeRain is about
   * (its tile line and first Updates row), and which closes both the notice
   * and the HUBBOOKED offer.
   */
  homeNotice: { id: id(145), phone: '9000000045', name: 'Hub Notice Nandini', vehicleId: id(754) },
  /** A paid booking at HOME_PROMO on its holiday: "Garage closed" must-act card. */
  homeClosed: { id: id(146), phone: '9000000046', name: 'Hub Closed Charles', vehicleId: id(755) },
  /**
   * The Home screen's own customers (specs/users/home.spec.ts and
   * updates.spec.ts), for what the screen changes: the wash interval, the
   * read marker, the ×s. Kept apart from the API spec's customers above,
   * which reset and change the same things while both files run in parallel.
   *
   * Two cars on a 10-day interval, washed 8 and 13 days ago, like homeWash.
   * VEHICLES.homeScreenWashSecond is the second.
   */
  homeScreenWash: { id: id(147), phone: '9000000047', name: 'Hub Meter Meena', vehicleId: id(756) },
  /** A job finished a day ago, with Updates last opened before it: the bell's dot. */
  homeBell: { id: id(148), phone: '9000000048', name: 'Hub Bell Bala', vehicleId: id(758) },
  /**
   * A paid booking at HOME_PROMO in four days, which NOTICES.homeTileNote is
   * about: the line on its Next booking tile, the first Updates row, and the
   * ×s on that notice and on the HUBBOOKED offer.
   */
  homeTile: { id: id(149), phone: '9000000049', name: 'Hub Tile Tara', vehicleId: id(759) },
  /**
   * Doorstep at VENDORS.unsetRadius, the garage that left its travel radius
   * empty: one saved address inside the default 10 km and one outside it
   * (ADDRESSES.reachCovered / reachOutside). The listing spec checks the
   * Doorstep list and checkout agree on both. Nothing is ever written: the
   * checkout attempts stop before any payment order.
   */
  doorstepReach: { id: id(190), phone: '9000000090', name: 'Reach Rathi', vehicleId: id(795) },
  /**
   * A customer account that is also the named owner of a garage
   * (VENDORS.ownerAccount). Deleting the account would cascade into that
   * garage through vendors.owner_id, so DELETE /users/me must refuse it. No
   * car and no bookings, so owning the garage is the only reason. Signed in
   * fresh by its spec (a saved token can expire mid-run).
   */
  garageOwner: { id: id(150), phone: '9000000050', name: 'Owner Customer Oviyan', vehicleId: null },
  /**
   * Owns the test-data reset API spec's bookings at VENDORS.reset
   * (BOOKINGS.reset*, BOOKING_INTENTS.reset*), which the spec deletes. Its
   * own customer, at a garage nobody else books, so a reset run touches
   * nothing another spec reads.
   */
  dataReset: { id: id(152), phone: '9000000052', name: 'Reset Ramesh', vehicleId: id(760) },
  /**
   * Owns the test-data reset screens' bookings (BOOKINGS.resetUi*), deleted
   * from a booking's page and from Start pilot clean.
   */
  dataResetUi: { id: id(151), phone: '9000000051', name: 'Reset Usha', vehicleId: id(761) },
  /**
   * The admin round's bookings (0064; ids 4200–4249): BOOKINGS.round*, at
   * VENDORS.roundA, for the Slot column and Delete test booking.
   */
  adminRound: { id: id(4200), phone: '9000004204', name: 'Round Ravi', vehicleId: id(4201) },
  /**
   * The garage Bin's customers (specs/admin/garage-bin.spec.ts), one per
   * garage it moves or deletes, so nothing another spec reads goes with it.
   * binPaid owns an upcoming paid booking (and an unpaid one) at
   * VENDORS.binPaid, which moving it to the Bin cancels; binHard and binTomb
   * own the bookings and checkout deleted forever with VENDORS.binHard and
   * VENDORS.binTomb; binBrowse only tries to book at VENDORS.binTeam.
   */
  binPaid: { id: id(153), phone: '9000000053', name: 'Bin Refund Bindu', vehicleId: id(762) },
  binHard: { id: id(154), phone: '9000000054', name: 'Bin Gone Gopal', vehicleId: id(763) },
  binTomb: { id: id(155), phone: '9000000055', name: 'Bin Kept Kamala', vehicleId: id(764) },
  binBrowse: { id: id(156), phone: '9000000056', name: 'Bin Browse Bala', vehicleId: id(765) },
  /**
   * Raises a complaint about BOOKINGS.complaintDone (a finished job at MAIN)
  /**
   * in the complaint journey, and is refused one about someone else's
   * booking. Its own customer, so the per-customer limits and My
   * complaints hold only this spec's complaints.
   */
  complaints: { id: id(157), phone: '9000000057', name: 'Complaint Kavitha', vehicleId: id(766) },
  /**
   * Owns every booking at VENDORS.stats (see STATS), so the Statistics spec
   * can assert exact figures for that garage. Signed in fresh by that spec
   * to be refused the admin-only figures.
   */
  stats: { id: id(158), phone: '9000000058', name: 'Stats Sathya', vehicleId: id(767) },
  /**
   * Owns every booking at VENDORS.payouts (BOOKINGS.payout*), which the
   * payouts spec pays out. Nothing signs in as them; the bookings are the point.
   */
  payouts: { id: id(159), phone: '9000000059', name: 'Payout Pavithra', vehicleId: id(768) },
  /**
   * Saves VENDORS.main with the heart and finds it under Profile → Saved
   * garages (specs/users/saved-garages.spec.ts). No car: saving a garage
   * needs none. Numbered 169 rather than 160 to stay clear of other open
   * branches adding customers after 159.
   */
  favourites: { id: id(169), phone: '9000000069', name: 'Saved Selvi', vehicleId: null },
  /**
   * Books pickup & drop at VENDORS.pickup (specs/users/booking-pickup.spec.ts).
   * One car and one pinned default address (ADDRESSES.pickupHome, at
   * PICKUP_HOME), inside that garage's 8 km pickup radius. No seeded
   * bookings, so the one the spec makes is the customer's only one.
   */
  pickup: { id: id(178), phone: '9000000078', name: 'Pickup Padma', vehicleId: id(787) },
  /**
   * Suggested times and extra work (0041), at VENDORS.proposals only
   * (specs/journeys/proposals-extra-work-journey.spec.ts). Ids 2100–2199 and
   * phones 90000021xx are this feature's own range. Each has one car and one
   * seeded booking there: a pending paid one the garage suggests two other
   * times for (picked), a pending paid one whose times the customer turns
   * down, and a job under way the garage asks extra work on.
   */
  proposalPicker: { id: id(2102), phone: '9000002102', name: 'Proposal Pooja', vehicleId: id(2103) },
  proposalDecliner: { id: id(2104), phone: '9000002104', name: 'Proposal Prem', vehicleId: id(2105) },
  extraWorkPayer: { id: id(2106), phone: '9000002106', name: 'Extra Work Ezhil', vehicleId: id(2107) },
  /**
   * Garage documents (0043; specs/vendors/documents.spec.ts): a customer who
   * must not reach VENDORS.documents' documents, and who sees its badge.
   * Ids 2300–2399 and phones 90000023xx are this feature's own range.
   */
  documents: { id: id(2303), phone: '9000002303', name: 'Documents Dhanya' },
  /**
   * Browser notifications (0044; specs/platform/push-api.spec.ts): turns them
   * on with a stand-in subscription (PUSH_FAKE records, never sends). Ids
   * 2400–2499 and phones 90000024xx are this feature's own range.
   */
  push: { id: id(2401), phone: '9000002401', name: 'Push Priya' },
  /** Must not reach Admin → Alerts (specs/admin/alerts.spec.ts); its own phone, so it never races the above. */
  pushOutsider: { id: id(2404), phone: '9000002404', name: 'Push Outsider Om' },
  /**
   * Job photo standards (0045; specs/journeys/job-photos-journey.spec.ts): adds
   * a before photo of their car to BOOKINGS.photosJob and sees the garage's
   * once the work starts. Ids 2500–2599 and phones 90000025xx are this
   * feature's own range.
   */
  photos: { id: id(2502), phone: '9000002502', name: 'Photo Padmini', vehicleId: id(2503) },
  /**
   * The garage response deadline (0042), at VENDORS.response only
   * (specs/journeys/response-deadline-journey.spec.ts). Ids 2200–2299 and
   * phones 90000022xx are this feature's own range. One car and one seeded
   * booking, paid and pending, whose garage's deadline to accept passed
   * 15 minutes ago: the cron cancels it as not accepted in time.
   */
  notAccepted: { id: id(2202), phone: '9000002202', name: 'Late Answer Lalitha', vehicleId: id(2203) },
  /**
   * Car history and service reminders (0046; specs/users/car-history.spec.ts),
   * at VENDORS.carHistory only. Ids 2600–2699 and phones 90000026xx are this
   * feature's own range. One car with a ceramic coating done ~87 days ago and
   * a wash ~40 days ago (both completed and paid), one cancelled wash, and the
   * coating's maintenance-wash reminder due in 3 days.
   */
  carHistory: { id: id(2601), phone: '9000002601', name: 'History Harini', vehicleId: id(2603) },
  /**
   * "Notify me if a slot opens" (0047; specs/platform/slot-alerts-api.spec.ts),
   * at VENDORS.slotAlerts only. Ids 2700–2799 and phones 90000027xx are this
   * feature's own range. `slotAlert` waits for the full day and is told when
   * `slotHolder` cancels the booking that fills it; `slotAlertOther` must not
   * see or cancel that alert.
   */
  slotAlert: { id: id(2701), phone: '9000002701', name: 'Slot Alert Sita' },
  slotAlertOther: { id: id(2702), phone: '9000002702', name: 'Slot Alert Other Om' },
  slotHolder: { id: id(2703), phone: '9000002703', name: 'Slot Holder Hari', vehicleId: id(2704) },
  /**
   * The Service History certificate (0053; specs/users/service-history-certificate.spec.ts),
   * at VENDORS.certificate only. Ids 3300–3399 and phones 90000033xx are this
   * feature's own range. One car (plate TN09AB3301) with two completed, paid
   * jobs and one cancelled; the spec shares it, opens /verify/<token> signed
   * out, then stops sharing.
   */
  certificate: { id: id(3301), phone: '9000003301', name: 'Certificate Chitra', vehicleId: id(3303) },
  /**
   * Contact windows (specs/users/contact-windows.spec.ts, booking-help.spec.ts,
   * garage-privacy.spec.ts), at VENDORS.contact only. Ids 3400–3499 and
   * phones 90000034xx are this feature's own range. Owns the four
   * BOOKINGS.contact* jobs: one inside the window, three outside it.
   */
  contact: { id: id(3401), phone: '9000003401', name: 'Contact Chitra', vehicleId: id(3402) },
  /**
   * The six-tap checkout (specs/users/checkout-six-taps.spec.ts): Home → Book
   * a wash → the garage → Add → Book Now → a time → Pay, with the day and the
   * car already picked. One default car, no address, no bookings. Ids
   * 4000–4099 and phones 90000040xx are the customer UX round's own range.
   */
  sixTap: { id: id(4001), phone: '9000004001', name: 'Six Tap Selvi', vehicleId: id(4002) },
  /**
   * The garage's Today view and job page (specs/vendors/today.spec.ts), at
   * VENDORS.today only. Ids 3900–3999 and phones 90000039xx (from 01) are
   * this feature's own range. Owns the five BOOKINGS.today* jobs.
   */
  today: { id: id(3901), phone: '9000003901', name: 'Today Tharun', vehicleId: id(3902) },
  /**
   * Customer reach (0062): a returning customer who books as a guest and
   * signs in at Pay with their number (specs/users/guest-checkout.spec.ts),
   * so checkout offers "Use saved" for their one car (a Tata Nexon). Ids
   * 4300–4399 and phones 90000043xx are this feature's own range. Nothing
   * else signs in as them.
   */
  guestExisting: { id: id(4301), phone: '9000004301', name: 'Returning Rekha', vehicleId: id(4302) },
  /**
   * Customer reach, part 2 (0062; ids 4400–4599, phones 90000044xx and
   * 90000045xx): requests to garages just outside their reach, around
   * REQ_HOME (specs/journeys/booking-requests-journey.spec.ts), each with a
   * sedan and a pinned home at REQ_HOME; and the free-wash sign-ups
   * (specs/users/free-wash.spec.ts). Each belongs to one test.
   */
  request: { id: id(4401), phone: '9000004401', name: 'Request Rani', vehicleId: id(4421), addressId: id(4431) },
  requestForward: { id: id(4402), phone: '9000004402', name: 'Forward Faisal', vehicleId: id(4422), addressId: id(4432) },
  requestLapse: { id: id(4403), phone: '9000004403', name: 'Lapse Lakshmi', vehicleId: id(4423), addressId: id(4433) },
  requestLimit: { id: id(4404), phone: '9000004404', name: 'Limit Leela', vehicleId: id(4424), addressId: id(4434) },
  freeWashSign: { id: id(4405), phone: '9000004405', name: 'Signup Sundar', vehicleId: id(4425) },
  freeWashLate: { id: id(4406), phone: '9000004406', name: 'Late Latha', vehicleId: id(4426) },
  freeWashLaunch: { id: id(4407), phone: '9000004407', name: 'Launch Logan', vehicleId: id(4427) },
  referral: { id: id(4408), phone: '9000004408', name: 'Referral Reena', vehicleId: id(4428) },
  /**
   * Customers whose *session* is the thing under test.
   *
   * Logging out and revoking refresh tokens are destructive to the session
   * they touch, so they must not be aimed at a customer another file is
   * reading — the storageState minted in global setup would go stale mid-run.
   */
  logout: { id: id(112), phone: '9000000012', name: 'Logout Lakshmi', vehicleId: id(721) },
  session: { id: id(113), phone: '9000000013', name: 'Session Suresh', vehicleId: id(722) },
} as const

/**
 * A phone with no user attached. The signup spec needs a number that has never
 * been seen before; anything seeded would send it down the returning-user path.
 */
export const UNREGISTERED_PHONE = '9000000099'

/** The same, for the vendor app: onboarding only runs for a brand-new owner. */
export const UNREGISTERED_VENDOR_PHONE = '9000000098'

/**
 * A customer kept out of CUSTOMERS on purpose: global setup sends every one
 * of those a login code, and the per-phone send limit spec needs a number
 * whose sends it alone controls.
 */
export const OTP_LIMITED_CUSTOMER = {
  id: id(122),
  phone: '9000000022',
  name: 'Limit Lalitha',
} as const

export const STAFF = {
  /** Owns both MAIN and SECOND — the company switcher needs two to switch between. */
  owner: { id: id(201), phone: '9000001001', name: 'Owner Om' },
  /** vendor_operator on MAIN. Must not see earnings, services or settings. */
  operator: { id: id(202), phone: '9000001002', name: 'Operator Oviya' },
  /** Platform super_admin. Acting inside a vendor writes an internal_access_log row. */
  superAdmin: { id: id(203), phone: '9000001003', name: 'Super Sundar' },
  /** Owns NARROW only. Kept separate so tenancy specs have a clean negative case. */
  narrowOwner: { id: id(204), phone: '9000001004', name: 'Narrow Nandhini' },
  /**
   * Owns the scheduling garages (CAPACITY, HOLIDAY, PAUSED, TIME_OFF). Its own
   * account so pausing and holidays are tried on garages no other spec books,
   * and the owner's company switcher keeps its two companies.
   */
  scheduleOwner: { id: id(205), phone: '9000001006', name: 'Schedule Shalini' },
  /**
   * Owns VENDORS.inspect only, so the final-bill journey's garage session
   * has one company and nothing another spec books.
   */
  inspectOwner: { id: id(206), phone: '9000001007', name: 'Inspect Ilango' },
  /**
   * Owns VENDORS.refunds only, so the refunds journey reads that garage's
   * earnings with nothing any other spec books on it.
   */
  refundsOwner: { id: id(207), phone: '9000001008', name: 'Refunds Ramesh' },
  /**
   * Owns VENDORS.media only, so the service photo and video specs change the
   * media of a garage nobody else reads, with one company in the switcher.
   */
  mediaOwner: { id: id(208), phone: '9000001009', name: 'Media Meena' },
  /**
   * Owns VENDORS.binTeam, which the Bin spec moves to the Bin and back, and
   * VENDORS.binOwnerLive, which stays on the app: the proof that the Bin
   * locks a team out of the binned garage only, never out of a live one.
   */
  binOwner: { id: id(209), phone: '9000001010', name: 'Bin Owner Bhuvana' },
  /** vendor_operator on VENDORS.binTeam alone: no company at all while it is in the Bin. */
  binOperator: { id: id(210), phone: '9000001011', name: 'Bin Operator Oscar' },
  /**
   * Owns VENDORS.payouts only, so the payouts spec reads that garage's
   * Earnings with nothing any other spec books on it.
   */
  payoutsOwner: { id: id(211), phone: '9000001012', name: 'Payouts Prakash' },
  /** Owns VENDORS.pickup only, so a pickup job's garage session has one company. */
  pickupOwner: { id: id(228), phone: '9000001028', name: 'Pickup Owner Prabhu' },
  /** Owns VENDORS.proposals only (0041; the 2100–2199 range). */
  proposalsOwner: { id: id(2101), phone: '9000002101', name: 'Proposals Owner Parvathi' },
  /** Owns VENDORS.documents only (0043; the 2300–2399 range): uploads its documents. */
  documentsOwner: { id: id(2301), phone: '9000002301', name: 'Documents Owner Deepa' },
  /** vendor_operator on VENDORS.documents: must not list or open them. */
  documentsOperator: { id: id(2302), phone: '9000002302', name: 'Documents Operator Durai' },
  /** Owns VENDORS.push only (0044; the 2400–2499 range): turns on new-booking alerts. */
  pushOwner: { id: id(2402), phone: '9000002402', name: 'Push Owner Pavan' },
  /** vendor_operator on VENDORS.push: may turn alerts on too (the counter needs them). */
  pushOperator: { id: id(2403), phone: '9000002403', name: 'Push Operator Padma' },
  /** Owns VENDORS.photos only (0045; the 2500–2599 range): starts a job once its photos are in. */
  photosOwner: { id: id(2501), phone: '9000002501', name: 'Photos Owner Prakash' },
  /** Owns VENDORS.response and VENDORS.responseOther only (0042; the 2200–2299 range). */
  responseOwner: { id: id(2201), phone: '9000002201', name: 'Response Owner Revathi' },
  /** Owns VENDORS.carHistory only (0046; the 2600–2699 range). */
  carHistoryOwner: { id: id(2602), phone: '9000002602', name: 'History Owner Hari' },
  /** Owns VENDORS.slotAlerts only (0047; the 2700–2799 range). */
  slotAlertsOwner: { id: id(2705), phone: '9000002705', name: 'Slot Alerts Owner Selvi' },
  /** Owns VENDORS.certificate only (0053; the 3300–3399 range). */
  certificateOwner: { id: id(3302), phone: '9000003302', name: 'Certificate Owner Kannan' },
  /** Owns VENDORS.contact only (contact windows; the 3400–3499 range). */
  contactOwner: { id: id(3405), phone: '9000003405', name: 'Contact Owner Charu' },
  /** Owns VENDORS.today only (the garage's Today view; the 3900–3999 range). */
  todayOwner: { id: id(3905), phone: '9000003905', name: 'Today Owner Thenmozhi' },
  /** Owns VENDORS.marksA only (onboarding marks, 0059; the 4150–4199 range). */
  marksAOwner: { id: id(4152), phone: '9000004151', name: 'Marks Owner Anbu' },
  /** Owns VENDORS.marksB only (onboarding marks, 0059; the 4150–4199 range). */
  marksBOwner: { id: id(4156), phone: '9000004155', name: 'Marks Owner Bala' },
  /** Owns VENDORS.marksC only (the garage editor layout spec, 0059). */
  marksCOwner: { id: id(4166), phone: '9000004165', name: 'Marks Owner Chitra' },
  /** Own VENDORS.roundA and roundDoorstep (the admin round, 0064; 4200–4249). */
  roundAOwner: { id: id(4202), phone: '9000004202', name: 'Round Owner Arul' },
  roundDoorstepOwner: { id: id(4203), phone: '9000004203', name: 'Round Owner Devi' },
  /** Owns the five customer-reach garages (VENDORS.reach*, 0062; the 4300–4399 range). */
  reachOwner: { id: id(4305), phone: '9000004305', name: 'Reach Owner Ravi' },
  /** Owns the two request garages and the area-launch garage (customer reach, part 2). */
  requestOwner: { id: id(4410), phone: '9000004410', name: 'Request Owner Ramesh' },
} as const

export const VENDORS = {
  /** The canonical garage. Both booking modes, open 06:00–22:00 every day. */
  main: { id: id(301), name: 'Detlio Test Garage' },
  /** Same owner as MAIN, so switching between them exercises tenant isolation. */
  second: { id: id(302), name: 'Second Test Garage' },
  /** Open 09:00–11:00 only: two long services cannot fit in the day. */
  narrow: { id: id(303), name: 'Narrow Hours Garage' },
  /**
   * One bay, no daily cap, open 06:00–22:00, with one paid job tomorrow at
   * 10:00 (BOOKINGS.capacityHeld). So 10:00 is full, while 09:30 and 10:30 —
   * back to back with it — are not. Capacity is tried here and only here:
   * MAIN has 50 bays so the booking specs never fill a slot by accident.
   */
  capacity: { id: id(304), name: 'One Bay Garage' },
  /** Open every day, but tomorrow is a holiday (seeded in vendor_closures). */
  holiday: { id: id(305), name: 'Holiday Test Garage' },
  /** Paused, with a reason. Out of the lists; its page still loads. */
  paused: { id: id(306), name: 'Paused Test Garage' },
  /** The garage the portal spec adds holidays to and pauses. Nobody books it. */
  timeOff: { id: id(307), name: 'Time Off Test Garage' },
  /**
   * Shorter on Saturdays (09:00–13:00), which is what tells the admin edit
   * form keeping per-day hours apart from it flattening them; the admin spec
   * also pauses and resumes it. Owned by NARROW's owner, booked by nobody.
   */
  opsEdit: { id: id(308), name: 'Ops Edit Garage' },
  /**
   * One bay and nothing booked: two customers both open a checkout for the
   * same time and both pay, and only the first may get the booking. Kept off
   * CAPACITY, whose 09:30/10:00/10:30 the scheduling spec reads as fixed.
   */
  lastBay: { id: id(309), name: 'Last Bay Garage' },
  /**
   * Inspection jobs and their final bills, and job records (times, photos).
   * One on_inspection service; every booking on it is the job-records
   * journey's. Nobody books it through checkout.
   */
  inspect: { id: id(310), name: 'Inspection Test Garage' },
  /**
   * Refunds and the no-show money rules. Every booking on it is the refunds
   * journey's, so its earnings are exactly what that journey seeded: one
   * customer no-show, paid as if the job happened, and nothing else.
   */
  refunds: { id: id(311), name: 'Refunds Test Garage' },
  /**
   * The Home hub's garage. Its Show-on-Home codes (DISCOUNTS.homeBooked,
   * homeNear) only reach customers who booked it or stand near it, and it
   * sits ~130 km from ORIGIN (in Vellore), so no other customer ever sees
   * them, and it never comes between MAIN and the fillers in a distance sort.
   * Booked only by the CUSTOMERS.home* fixtures.
   */
  homePromo: { id: id(312), name: 'Hub Promo Test Garage' },
  /**
   * Doorstep only, with no travel radius and no drawn area: it covers the
   * default 10 km from its pin (lib/doorstep.ts). Pinned in Puducherry, far
   * from ORIGIN and from HOME_PROMO_PIN, and taking no drop-ins, so it is in
   * no drop-in list and no other spec's doorstep list. Carries an internal
   * admin note that its public page must never show.
   */
  unsetRadius: {
    id: id(390),
    name: 'Unset Radius Garage',
    notes: 'Internal: owner prefers calls after 6 pm',
  },
  /**
   * Owned by CUSTOMERS.garageOwner, a customer account: what makes deleting
   * that account a cascade into a garage. Pending and unpinned, so no
   * customer list ever shows it; nothing else reads it.
   */
  ownerAccount: { id: id(313), name: 'Customer Owned Test Garage' },
  /**
   * The admin services editor's garage (specs/admin/vendor-services.spec.ts):
   * a flat service inside a package, a per-vehicle one with no SUV price (the
   * row the old editor dropped on save, hiding it), and a hidden one to show
   * again. Pending and unpinned, so no customer sees it; nobody books it.
   */
  adminServices: { id: id(314), name: 'Admin Services Test Garage' },
  /**
   * The garage editor's own spec (specs/admin/garage-editor.spec.ts): how
   * customers book, the save bar, ?tab=, templates and Write with AI. At the
   * garage only, no radius; a "Foam wash" (so that template is not offered)
  /**
   * and a service with no description for the AI to fill. Pending and
   * unpinned, so no customer sees it; nobody books it.
   */
  adminEditor: { id: id(315), name: 'Admin Editor Test Garage' },
  /**
   * The garage list's checklist (specs/admin/vendors.spec.ts): open every
   * day, at the garage, pinned and confirmed, with bays and car types set,
   * but no services, so "No services" is its one blocking item and nothing
   * is to fix. Pending, so no customer sees it; nobody books it.
   */
  adminList: { id: id(316), name: 'Admin List Test Garage' },
  /**
   * The test-data reset's garage. Not verified, so it is in no customer
   * list; every booking on it belongs to the reset specs, which delete them.
   */
  reset: { id: id(317), name: 'Reset Test Garage' },
  /**
   * Service photos and videos (specs/vendors/service-media.spec.ts,
   * specs/admin/service-media.spec.ts). Verified, so its garage page shows
   * customers what was added; far south-west like the other single-purpose
   * garages, so it never comes between MAIN and the fillers in a sort.
   * Nobody books it. Each spec owns one of its services (SERVICES.media*).
   */
  media: { id: id(318), name: 'Media Test Garage' },
  /**
   * The garage Bin (specs/admin/garage-bin.spec.ts). binTeam is live (Active,
   * verified, pinned far south-west like the other single-purpose garages,
   * one service, open every day), so moving it to the Bin can be seen to
   * take it out of everything customers read, and Restore to bring it back;
   * its team is STAFF.binOwner and STAFF.binOperator. binOwnerLive is
   * binOwner's other garage, pending, which must stay reachable. Nobody books
   * either.
   */
  binTeam: { id: id(340), name: 'Bin Team Test Garage' },
  binOwnerLive: { id: id(341), name: 'Bin Owner Live Garage' },
  /** Pending; CUSTOMERS.binPaid's two upcoming bookings, cancelled by moving it to the Bin. */
  binPaid: { id: id(342), name: 'Bin Refund Test Garage' },
  /**
   * Seeded in the Bin, for Delete forever with nothing kept: a package (whose
   * member is ON DELETE RESTRICT), an abandoned checkout, a test booking and
   * a gallery photo. The garage row goes too.
   */
  binHard: { id: id(343), name: 'Bin Hard Delete Garage' },
  /** Seeded in the Bin with a live-money booking: Delete forever keeps a tombstone. */
  binTomb: { id: id(344), name: 'Bin Tombstone Garage' },
  /**
   * The Statistics garage. Not verified, so it is in no customer list; every
   * booking on it is a STATS fixture, so its figures are exact.
   */
  stats: { id: id(345), name: 'Stats Test Garage' },
  /**
   * Garage payouts (specs/admin/payouts.spec.ts): a finished wash and a
   * customer no-show to pay out (₹500 each, its first two bookings, so free
   * of commission), and one still to come, not payable yet. Pending and
   * unverified, so no customer sees it; a UPI id to pay to.
   */
  payouts: { id: id(346), name: 'Payouts Test Garage' },
  /**
   * Pickup & drop (0037): at the garage and pickup, on with the responsibility
   * terms on file, collecting within 8 km of its pin (PICKUP_PIN). Live, open
   * 06:00–22:00 every day, one service (SERVICES.pickupWash). Far south-west
   * like the other single-purpose garages, so it never comes between MAIN and
   * the fillers in a sort, and no customer at ORIGIN is within its reach.
   * Booked only by CUSTOMERS.pickup.
   */
  pickup: { id: id(358), name: 'Pickup Drop Test Garage' },
  /**
   * Suggested times and extra work (0041). Live, at the garage only, open
   * 06:00–22:00 every day, two bays, one ₹500 wash (SERVICES.proposalsWash).
   * Far from ORIGIN like the other single-purpose garages (PROPOSALS_PIN), so
   * it is in no Nearby count. Booked only by the three 0041 customers.
   */
  proposals: { id: id(2110), name: 'Proposals Test Garage' },
  /**
   * Garage documents (0043). Live, at the garage only, open 06:00–22:00
   * every day, one ₹400 wash (SERVICES.documentsWash), no documents at all
   * until the spec uploads them; then its page shows "Documents verified".
   * Far from ORIGIN like the other single-purpose garages (DOCUMENTS_PIN).
   */
  documents: { id: id(2310), name: 'Documents Test Garage' },
  /**
   * Browser notifications (0044). Pending and not verified, so no customer
   * list ever shows it and nobody books it: it only gives its owner's and
   * operator's seats a garage to turn new-booking alerts on for.
   */
  push: { id: id(2410), name: 'Push Test Garage' },
  /**
   * Car history (0046). Pending and not verified, so no customer list shows
   * it and nobody books it: it only did CUSTOMERS.carHistory's past jobs.
   */
  carHistory: { id: id(2610), name: 'History Test Garage' },
  /**
   * Job photo standards (0045). Pending and not verified, so no customer
   * list ever shows it; its one booking is seeded. The only garage the
   * standard is on for in E2E (JOB_PHOTOS_REQUIRED=off with
   * JOB_PHOTOS_REQUIRED_GARAGES naming it, .env.e2e), so no other spec's
   * Start or Complete waits for photos.
   */
  photos: { id: id(2510), name: 'Photo Standards Garage' },
  /**
   * The garage response deadline (0042). Live, at the garage only, open
   * 06:00–22:00 every day, one ₹600 wash (SERVICES.responseWash), at
   * RESPONSE_PIN, far from every other test garage. It lets
   * BOOKINGS.notAccepted run past its deadline.
   */
  response: { id: id(2210), name: 'Slow Reply Garage' },
  /**
   * Its neighbour, ~3.5 km north (RESPONSE_OTHER_PIN), live, at the garage
   * only, with a car wash of its own: the "Book another garage" suggestion
   * the customer is shown. Booked by nobody.
   */
  responseOther: { id: id(2212), name: 'Quick Reply Garage' },
  /**
   * "Notify me if a slot opens" (0047). Live, at the garage only, open
   * 06:00–22:00 every day, one bay and one job a day, one ₹500 wash
   * (SERVICES.slotAlertsWash), at SLOT_ALERTS_PIN, far from every other test
   * garage. BOOKINGS.slotAlertsHeld fills its day two days ahead.
   */
  slotAlerts: { id: id(2710), name: 'Full Day Garage' },
  /**
   * The Service History certificate (0053). Pending and not verified, so no
   * customer list shows it and nobody books it: it only did
   * CUSTOMERS.certificate's past jobs.
   */
  certificate: { id: id(3310), name: 'Record Keeping Garage' },
  /**
   * Contact windows: pending and unverified (no customer finds it), open
   * 06:00–22:00, one ₹400 wash (SERVICES.contactWash). Its phone and WhatsApp
   * are CONTACT_GARAGE's, so a spec can look for them in a payload.
   */
  contact: { id: id(3410), name: 'Window Wash Garage' },
  /**
   * The garage's Today view and job page: pending and unverified (no customer
   * finds it), open 06:00–22:00, one ₹700 wash (SERVICES.todayWash). Only
   * specs/vendors/today.spec.ts reads it.
   */
  today: { id: id(3910), name: 'Today Test Garage' },
  /**
   * Onboarding marks and collection lists (0059; ids 4150–4199 and phones
   * 90000041xx from 51 only). Both live and verified (Active, pinned far
   * south-west like the other single-purpose garages, open every day, one
   * priced wash, every required document approved), so only what each is
   * meant to miss is missing. Nobody books either; the garage's own phone is
   * its owner's, and neither has a WhatsApp number.
   *
   * marksA: doorstep on with no radius and no drawn area, bays set, no
   * photos, no logo, no payout details: `missing` is exactly photos, logo,
   * radius_default, payout. Owner phone 9000004151.
   */
  marksA: { id: id(4151), name: 'Marks Test Garage A' },
  /**
   * marksB: a logo and UPI payout details, at the garage only, no bays and
   * no photos: `missing` is exactly photos, bays. Owner phone 9000004155;
   * onboarded by "E2E Admin".
   */
  marksB: { id: id(4155), name: 'Marks Test Garage B', onboardedByName: 'E2E Admin' },
  /**
   * marksC: a copy of marksB for specs/admin/garage-editor-layout.spec.ts
   * only, which changes its Onboarded by and discards a stage change; kept
   * apart so the marks and team specs can rely on marksB never changing.
   */
  marksC: { id: id(4165), name: 'Marks Test Garage C', onboardedByName: 'E2E Admin' },
  /**
   * The admin round (0064; ids 4200–4249), only its specs touch these:
   * - roundA: live, at the garage and doorstep, far from every other pin.
   *   Its wash has no duration and its detailing its own 6% commission; it
   *   has a checklist mark (1 of 3 ticked) and an old mark whose note holds
   *   "- " lines. specs/admin/admin-round-*.spec.ts.
   * - roundDoorstep: doorstep only, pending, with no address or pincode.
   * - roundB: a second live garage for the colour tags' bulk set.
   */
  roundA: { id: id(4210), name: 'Round Test Garage A' },
  roundDoorstep: { id: id(4211), name: 'Round Doorstep Garage' },
  roundB: { id: id(4212), name: 'Round Test Garage B' },
  /**
   * Customer reach (0062; ids 4300–4399): five live garages around REACH_HERE,
   * far south-west of every other test garage, for the garage list's "never
   * empty" pieces (specs/users/customer-reach.spec.ts). See REACH_PINS for
   * where each is and why. All owned by STAFF.reachOwner, open every day.
   */
  reachFar: { id: id(4310), name: 'Reach Far Garage' },
  reachDoorstep: { id: id(4311), name: 'Reach Doorstep Garage' },
  reachPickup: { id: id(4312), name: 'Reach Pickup Garage' },
  reachOutsideDoorstep: { id: id(4313), name: 'Reach Outside Doorstep' },
  reachOutsidePickup: { id: id(4314), name: 'Reach Outside Pickup' },
  /**
   * Customer reach, part 2: two doorstep garages that cover 5 km and stop
   * short of REQ_HOME (reqFirst ~8.7 km north, reqSecond ~12.2 km south: both
   * "just outside"), so a request to the first passes to the second; and
   * areaLaunch, pinned in Ambattur and not verified until
   * specs/users/free-wash.spec.ts verifies it to launch the area.
   */
  reqFirst: { id: id(4441), name: 'Req First Garage' },
  reqSecond: { id: id(4442), name: 'Req Second Garage' },
  areaLaunch: { id: id(4443), name: 'Area Launch Garage' },
} as const

/** VENDORS.contact's own numbers (contact windows), different on purpose. */
export const CONTACT_GARAGE = { phone: '9000003410', whatsapp: '9000003411' } as const

/**
 * Customer reach (0062): where a customer stands for the "never empty" list
 * pieces, ~150 km from every other test garage, so nothing else is near.
 * Exact in binary (multiples of 1/64), like the other pins.
 *
 * From REACH_HERE: the nearest at-garage garage (reachFar) is ~13.9 km away,
 * so At garage shows "Skip the drive" with 1 doorstep garage (reachDoorstep,
 * 3.5 km, covers 8 km, from ₹349) and 1 pickup garage (reachPickup, 3.5 km
 * south, collects within 8 km). Doorstep's "Just outside their area" holds
 * reachOutsideDoorstep (8.7 km, covers 5 km: "covers 5 km · 3.7 km outside");
 * Pickup & drop's holds reachFar (13.9 km, collects within 10 km: 3.9 km
 * outside) and reachOutsidePickup (13.7 km east, collects within 8 km).
 *
 * From REACH_MID (between HERE and reachFar): reachFar is ~6.9 km away, so
 * At garage shows the small "or have it done at home" line (reachDoorstep,
 * 3.5 km, covers them), and reachFar's card says "Can collect your car"
 * (its 10 km pickup reaches MID).
 */
export const REACH_HERE = { lat: 10.5, lng: 79.5 } as const
export const REACH_MID = { lat: 10.5625, lng: 79.5 } as const
export const REACH_PINS = {
  far: { lat: 10.625, lng: 79.5 },
  doorstep: { lat: 10.53125, lng: 79.5 },
  pickup: { lat: 10.46875, lng: 79.5 },
  outsideDoorstep: { lat: 10.421875, lng: 79.5 },
  outsidePickup: { lat: 10.5, lng: 79.625 },
} as const

/**
 * Numbers no account has, for a guest who signs up at checkout
 * (specs/users/guest-checkout.spec.ts picks the first unused one, so a retry
 * in the same run still starts as a new customer).
 */
export const GUEST_NEW_PHONES = Array.from({ length: 10 }, (_, i) => `900000439${i}`)

/**
 * Customer reach, part 2: where the request customers live, ~80 km from
 * every other test garage, and the two request garages' pins (see
 * VENDORS.reqFirst). Exact in binary, like the other pins.
 */
export const REQ_HOME = { lat: 11.25, lng: 78.75 } as const
export const REQ_PINS = {
  first: { lat: 11.328125, lng: 78.75 },
  second: { lat: 11.140625, lng: 78.75 },
} as const

/**
 * The free-wash areas (zones seeded by 0062, far from every listed test
 * garage): Tambaram for signing up (empty list), Chromepet with its 50 free
 * washes taken (AREA_WAITLIST), Ambattur for launch day (VENDORS.areaLaunch,
 * CUSTOMERS.freeWashLaunch first on its list).
 */
export const FREE_WASH_AREAS = {
  signUp: { slug: 'tambaram', name: 'Tambaram', lat: 12.9249, lng: 80.1 },
  full: { slug: 'chromepet', name: 'Chromepet', lat: 12.9516, lng: 80.1462 },
  launch: { slug: 'ambattur', name: 'Ambattur', lat: 13.1143, lng: 80.1548 },
} as const
/** VENDORS.areaLaunch's pin, ~0.6 km from Ambattur's centre. */
export const AREA_LAUNCH_PIN = { lat: 13.109375, lng: 80.15625 } as const
/** Fifty accounts already on Chromepet's list (positions 1–50: every free wash given). */
export const AREA_WAITLIST = Array.from({ length: 50 }, (_, i) => ({
  id: id(4500 + i),
  phone: `90000045${String(i).padStart(2, '0')}`,
  name: `Waitlist ${i + 1}`,
}))
/**
 * CUSTOMERS.referral's recommendation, linked by the team to VENDORS.reqSecond,
 * where they then completed a paid booking (REFERRAL_BOOKING): the cron gives
 * the referral credit (owed while GIFTS_ENABLED is off).
 */
export const REFERRAL_RECOMMENDATION = id(4461)
export const REFERRAL_BOOKING = id(4462)

/** Where VENDORS.documents is: south-west, clear of every other test garage. */
export const DOCUMENTS_PIN = { lat: 12.625, lng: 79.625 } as const

/** Where VENDORS.proposals is: south-west, clear of every other test garage. */
export const PROPOSALS_PIN = { lat: 12.5, lng: 79.875 } as const

/**
 * Where VENDORS.response and VENDORS.responseOther are (0042): far
 * south-west, about 100 km from every other test garage, so neither is in
 * any other spec's lists, and the only garage near the first is the second.
 */
export const RESPONSE_PIN = { lat: 11.5, lng: 79 } as const
export const RESPONSE_OTHER_PIN = { lat: 11.53125, lng: 79 } as const

/**
 * Where VENDORS.slotAlerts is (0047): far south, about 100 km from every
 * other test garage, so it is in no other spec's lists or suggestions.
 */
export const SLOT_ALERTS_PIN = { lat: 11, lng: 79.75 } as const

/**
 * Where VENDORS.pickup is, and CUSTOMERS.pickup's saved address ~1.7 km north
 * of it. Exact in binary (multiples of 1/64), like DOORSTEP_JOB_PIN, so the
 * float4 snapshot on bookings hands them back unchanged.
 */
export const PICKUP_PIN = { lat: 12.25, lng: 80.125 } as const
export const PICKUP_HOME = {
  label: 'Home',
  address: '7, Pickup Lane, Kelambakkam',
  lat: 12.265625,
  lng: 80.125,
} as const

/** Where VENDORS.homePromo is, and where "near it" is asked from. */
export const HOME_PROMO_PIN = { lat: 12.9165, lng: 79.1325 } as const

/**
 * Where VENDORS.unsetRadius is, and the two points its customer's addresses
 * sit at: ~7 km north (inside the default 10 km) and ~14 km north (outside).
 * Multiples of 1/32, so float columns hand them back exactly.
 */
export const UNSET_RADIUS_PIN = { lat: 11.9375, lng: 79.8125 } as const
export const UNSET_RADIUS_COVERED = { lat: 12, lng: 79.8125 } as const
export const UNSET_RADIUS_OUTSIDE = { lat: 12.0625, lng: 79.8125 } as const

/** Filler garages so listing, sorting and infinite scroll have real volume. */
export const FILLER_VENDOR_COUNT = 12
export const fillerVendorId = (index: number): string => id(320 + index)

export const SERVICES = {
  /** Flat price, short. The default pick for any spec that just needs "a service". */
  wash: { id: id(401), name: 'Express Wash', price: '499.00', durationMins: 30 },
  /**
   * Priced per vehicle type, and deliberately NOT priced for an SUV — this is
   * what drives the "Remove the unpriced service" disabled-CTA case.
   */
  tiered: { id: id(402), name: 'Interior Detail', durationMins: 45,
    priceHatchback: '599.00', priceSedan: '799.00', priceSuv: null },
  /** Long enough that two of them overflow a short working day. */
  detail: { id: id(403), name: 'Full Body Detail', price: '1999.00', durationMins: 90 },
  /**
   * pricingType on_inspection: an upfront inspection fee that IS charged, with
   * the repair quoted afterwards — not an unpriced service. See pricing.ts,
   * where resolveServiceAmount returns `price` for this type.
   */
  inspect: { id: id(404), name: 'Dent Assessment', price: '299.00', durationMins: 60 },
  /** A package; its children are wash + detail. Counts as ONE cart line. */
  packageDeal: { id: id(405), name: 'Weekend Package', price: '2299.00', durationMins: 120 },
  /** isActive false. Must never appear on the garage page. */
  inactive: { id: id(406), name: 'Retired Polish', price: '899.00', durationMins: 30 },
  /** On SECOND, so tenancy specs can assert a service that must NOT leak. */
  secondOnly: { id: id(407), name: 'Second Garage Only Wash', price: '399.00', durationMins: 30 },
  /** Two long services on NARROW: 90 + 90 cannot fit a 09:00–11:00 day. */
  narrowA: { id: id(408), name: 'Narrow Long Wash', price: '1200.00', durationMins: 90 },
  narrowB: { id: id(409), name: 'Narrow Long Polish', price: '1400.00', durationMins: 90 },
  /** On CAPACITY. Booked by BOOKINGS.capacityHeld, so it cannot be deleted. */
  capacityWash: { id: id(410), name: 'One Bay Wash', price: '500.00', durationMins: 30 },
  holidayWash: { id: id(411), name: 'Holiday Wash', price: '450.00', durationMins: 30 },
  pausedWash: { id: id(412), name: 'Paused Wash', price: '450.00', durationMins: 30 },
  timeOffWash: { id: id(413), name: 'Time Off Wash', price: '450.00', durationMins: 30 },
  lastBayWash: { id: id(414), name: 'Last Bay Wash', price: '450.00', durationMins: 30 },
  /**
   * On INSPECT, priced on inspection: ₹299 prepaid, the work billed after.
   * What makes its bookings eligible for a final bill.
   */
  inspectFee: { id: id(415), name: 'Dent Inspection', price: '299.00', durationMins: 60 },
  /** On REFUNDS: every refunds-journey booking is one ₹499 wash. */
  refundsWash: { id: id(416), name: 'Refunds Wash', price: '499.00', durationMins: 30 },
  /** On HOME_PROMO, a car wash: what the Home wash bar counts. */
  homePromoWash: { id: id(417), name: 'Hub Foam Wash', price: '450.00', durationMins: 30 },
  /** On HOME_PROMO, priced on inspection: CUSTOMERS.homeBill's billed job. */
  homePromoInspect: { id: id(418), name: 'Hub Dent Check', price: '299.00', durationMins: 60 },
  /** On UNSET_RADIUS, a doorstep wash on its half-hour grid. */
  unsetRadiusWash: { id: id(490), name: 'Reach Doorstep Wash', price: '550.00', durationMins: 30 },
  /** On ADMIN_SERVICES, inside adminPackage: hiding it must be refused. */
  adminFlat: { id: id(419), name: 'Admin Foam Wash', price: '450.00', durationMins: 30 },
  /** On ADMIN_SERVICES, per vehicle with no SUV price: flagged, never dropped. */
  adminTiered: { id: id(420), name: 'Admin Interior Clean', durationMins: 60,
    priceHatchback: '600.00', priceSedan: '700.00', priceSuv: null },
  /** On ADMIN_SERVICES, hidden: listed under Hidden services, to show again. */
  adminHidden: { id: id(421), name: 'Admin Ceramic Coat', durationMins: 120,
    priceHatchback: '2000.00', priceSedan: '2500.00', priceSuv: '3000.00' },
  /** On ADMIN_SERVICES, a package of adminFlat. */
  adminPackage: { id: id(422), name: 'Admin Wash Combo', price: '800.00', durationMins: 60 },
  /** On ADMIN_EDITOR, named exactly like the Foam wash template. */
  editorFoam: { id: id(423), name: 'Foam wash', durationMins: 45,
    priceHatchback: '399.00', priceSedan: '449.00', priceSuv: '549.00' },
  /** On ADMIN_EDITOR, flat, no description: what Write with AI fills. */
  editorPolish: { id: id(424), name: 'Editor Polish', price: '1499.00', durationMins: 180 },
  /** On RESET: every reset-spec booking is one ₹499 wash. */
  resetWash: { id: id(425), name: 'Reset Wash', price: '499.00', durationMins: 30 },
  /** On MEDIA: the garage adds a photo to it. */
  mediaPhoto: { id: id(426), name: 'Media Foam Wash', price: '499.00', durationMins: 30 },
  /** On MEDIA: the garage adds a video to it (Stream faked). */
  mediaVideo: { id: id(427), name: 'Media Full Wash', price: '599.00', durationMins: 45 },
  /** On MEDIA, a coating: admin makes it an AI sample picture (AI faked). */
  mediaAi: { id: id(428), name: 'Media Ceramic Coat', price: '2999.00', durationMins: 120 },
  /** On MEDIA: the refusals (no privacy tick, a clip over 60 seconds). Never gets media. */
  mediaRefused: { id: id(429), name: 'Media Polish', price: '899.00', durationMins: 60 },
  /** On MEDIA, filed under others: the bike icon tile, never a sample (no-photo look). */
  mediaBike: { id: id(430), name: 'Media Bike Wash', price: '200.00', durationMins: 45 },
  /** One ₹499 wash on each Bin garage; binHardPackage bundles binHardWash. */
  binTeamWash: { id: id(431), name: 'Bin Team Wash', price: '499.00', durationMins: 30 },
  binPaidWash: { id: id(432), name: 'Bin Refund Wash', price: '499.00', durationMins: 30 },
  binHardWash: { id: id(433), name: 'Bin Gone Wash', price: '499.00', durationMins: 30 },
  binHardPackage: { id: id(434), name: 'Bin Gone Combo', price: '899.00', durationMins: 60 },
  binTombWash: { id: id(435), name: 'Bin Kept Wash', price: '499.00', durationMins: 30 },
  /** On STATS: a car wash (8%), a detailing job (5%) and an inspection (5%). */
  statsWash: { id: id(436), name: 'Stats Wash', price: '500.00', durationMins: 30 },
  statsDetail: { id: id(437), name: 'Stats Detail', price: '2000.00', durationMins: 90 },
  statsInspect: { id: id(438), name: 'Stats Scratch Check', price: '300.00', durationMins: 60 },
  /** On PAYOUTS: every payouts-spec booking is one ₹500 wash. */
  payoutsWash: { id: id(439), name: 'Payouts Wash', price: '500.00', durationMins: 30 },
  /** On PICKUP: its one service, at a price no other garage charges. */
  pickupWash: { id: id(456), name: 'Pickup Shine Wash', price: '549.00', durationMins: 30 },
  /** On PROPOSALS: its one service (0041). */
  proposalsWash: { id: id(2111), name: 'Proposals Foam Wash', price: '500.00', durationMins: 60 },
  documentsWash: { id: id(2311), name: 'Documents Foam Wash', price: '400.00', durationMins: 45 },
  /** On PHOTOS (0045): its one service. */
  photosWash: { id: id(2511), name: 'Photo Check Wash', price: '450.00', durationMins: 45 },
  /** On RESPONSE (0042): its one service. */
  responseWash: { id: id(2211), name: 'Slow Reply Wash', price: '600.00', durationMins: 60 },
  /** On RESPONSE_OTHER: a car wash too, so it matches the booking's kind of job. */
  responseOtherWash: { id: id(2213), name: 'Quick Reply Wash', price: '650.00', durationMins: 45 },
  /** On CAR_HISTORY (0046): a wash and a coating, so the history filters by service. */
  carHistoryWash: { id: id(2611), name: 'History Foam Wash', price: '450.00', durationMins: 45 },
  carHistoryCoating: { id: id(2612), name: 'History Ceramic Coating', price: '6000.00', durationMins: 240 },
  /** On SLOT_ALERTS (0047): its one service. */
  slotAlertsWash: { id: id(2711), name: 'Full Day Wash', price: '500.00', durationMins: 60 },
  /** On VENDORS.certificate (0053): a wash and a polish. */
  certificateWash: { id: id(3311), name: 'Record Foam Wash', price: '500.00', durationMins: 45 },
  certificatePolish: { id: id(3312), name: 'Record Machine Polish', price: '2500.00', durationMins: 180 },
  /** On VENDORS.contact (contact windows): its one service. */
  contactWash: { id: id(3412), name: 'Window Foam Wash', price: '400.00', durationMins: 45 },
  /** On VENDORS.today (the garage's Today view): its one service. */
  todayWash: { id: id(3912), name: 'Today Foam Wash', price: '700.00', durationMins: 45 },
  /** VENDORS.marksA's and marksB's one wash each (0059). */
  marksAWash: { id: id(4153), name: 'Marks A Foam Wash', price: '500.00', durationMins: 30 },
  marksBWash: { id: id(4157), name: 'Marks B Foam Wash', price: '500.00', durationMins: 30 },
  marksCWash: { id: id(4167), name: 'Marks C Foam Wash', price: '500.00', durationMins: 30 },
  /** VENDORS.roundA's (0064): a wash with no duration, detailing at its own 6%. */
  roundWash: { id: id(4213), name: 'Round Foam Wash', price: '450.00', durationMins: null },
  roundDetail: { id: id(4214), name: 'Round Interior Detail', price: '1500.00', durationMins: 120 },
  /** VENDORS.roundDoorstep's and roundB's one wash each. */
  roundDoorstepWash: { id: id(4215), name: 'Round Doorstep Wash', price: '400.00', durationMins: 45 },
  roundBWash: { id: id(4216), name: 'Round B Foam Wash', price: '400.00', durationMins: 45 },
  /** The customer-reach garages' one wash each (0062). */
  reachFarWash: { id: id(4320), name: 'Reach Far Wash', price: '299.00', durationMins: 30 },
  reachDoorstepWash: { id: id(4321), name: 'Reach Doorstep Wash', price: '349.00', durationMins: 30 },
  reachPickupWash: { id: id(4322), name: 'Reach Pickup Wash', price: '499.00', durationMins: 30 },
  reachOutsideDoorstepWash: { id: id(4323), name: 'Reach Outside Doorstep Wash', price: '399.00', durationMins: 30 },
  reachOutsidePickupWash: { id: id(4324), name: 'Reach Outside Pickup Wash', price: '599.00', durationMins: 30 },
  /** Customer reach, part 2: the request garages' and the launch garage's one wash each. */
  reqFirstWash: { id: id(4451), name: 'Req First Wash', price: '1800.00', durationMins: 60 },
  reqSecondWash: { id: id(4452), name: 'Req Second Wash', price: '599.00', durationMins: 60 },
  areaLaunchWash: { id: id(4453), name: 'Area Launch Wash', price: '399.00', durationMins: 30 },
} as const

export const DISCOUNTS = {
  /** 20% off, capped at ₹200 — the cap is the point. */
  percentCapped: { id: id(501), code: 'SAVE20', percentOff: '20.00', maxDiscountAmount: '200.00' },
  /** ₹100 off but only above ₹1000, so a small cart is rejected. */
  fixedMinOrder: { id: id(502), code: 'FLAT100', amountOff: '100.00', minOrderAmount: '1000.00' },
  /** endsAt in the past. */
  expired: { id: id(503), code: 'EXPIRED10' },
  /** Scoped to SECOND, so it must be refused at MAIN. */
  otherVendor: { id: id(504), code: 'SECONDONLY' },
  /** totalUsageLimit 1, already redeemed by the seed. */
  exhaustedTotal: { id: id(505), code: 'USEDUP' },
  /** perUserLimit 1, already redeemed by CUSTOMERS.coupons. */
  exhaustedPerUser: { id: id(506), code: 'ONEPERUSER' },
  /** fundedBy vendor rather than platform — asserted on the booking row. */
  vendorFunded: { id: id(507), code: 'VENDORPAYS', percentOff: '10.00' },
  /** Deactivated by the admin spec, then asserted to fail on the customer side. */
  toDeactivate: { id: id(508), code: 'KILLME' },
  /**
   * Shown on Home, Top priority, to customers who booked HOME_PROMO
   * (targeting is on in .env.e2e). CUSTOMERS.homeNotice closes it.
   */
  homeBooked: { id: id(509), code: 'HUBBOOKED', homeTitle: '25% off a wash at Hub Promo' },
  /** Shown on Home to customers within 10 km of HOME_PROMO_PIN. */
  homeNear: { id: id(510), code: 'HUBNEAR', homeTitle: '₹75 off near Hub Promo' },
} as const

export const BOOKINGS = {
  /** confirmed, tomorrow — the happy-path cancel target. */
  cancellable: id(601),
  /** A second cancellable booking, so the optional-reason case has its own row
   *  and does not race the one above. */
  cancellableNoReason: id(612),
  /** confirmed, now + 60min — inside the 2-hour cutoff, so cancel must be refused. */
  cancelTooLate: id(602),
  /** in_progress — not a cancellable status. */
  cancelWrongStatus: id(603),
  /** confirmed + paid + discounted. Reschedule must carry payment and discount across. */
  reschedulable: id(604),
  /** rescheduleCount already 2 — the next move must be refused at the cap. */
  rescheduleExhausted: id(605),
  /** confirmed, now + 60min — inside the cutoff, so reschedule must be refused. */
  rescheduleTooLate: id(606),
  /** completed with no review attached — the review form's target. */
  reviewable: id(607),
  /** completed and already reviewed — a second review must be refused. */
  alreadyReviewed: id(608),
  /** pending with an unpaid payment row — drives the legacy createPaymentOrder path. */
  unpaid: id(609),
  /** pending at MAIN — what the vendor sees under "Incoming". */
  vendorIncoming: id(610),
  /** A second pending booking at MAIN. Reject is only offered on the Incoming
   *  tab, so the reject case needs its own pending row rather than reusing the
   *  one the accept case consumes. */
  vendorRejectable: id(613),
  /** pending doorstep job at MAIN, at a pinned address. Read-only. */
  vendorDoorstep: id(615),
  /** pending + paid, an hour out: inside the 2-hour cutoff, but the garage has
   *  not accepted, so the customer can still cancel it. */
  cancelPendingSoon: id(616),
  /** pending + paid at MAIN, started an hour ago: can only be declined now. */
  vendorStarted: id(617),
  /** pending + paid, an hour out, CUSTOMERS.reschedule: not accepted yet, so
   *  it can still be moved inside 2 hours (to a time with enough notice). */
  reschedulePendingSoon: id(618),
  /** confirmed at SECOND — must never appear while MAIN is the active tenant. */
  secondTenant: id(611),
  /** confirmed + paid at CAPACITY tomorrow 10:00: fills its only bay. */
  capacityHeld: id(619),
  /**
   * pending + unpaid at CAPACITY tomorrow 10:00, booked the old way before the
   * bay filled. An unpaid booking holds no bay, so it is paying for it that
   * must be refused — before the order, and again if money lands anyway.
   */
  payLaterFull: id(620),
  /** completed, naming VEHICLES.booked. Its only job is to make that car
   *  undeletable by the old code path — the regression this pins. */
  vehicleArchive: id(614),
  /**
   * The admin booking-ops fixtures, all CUSTOMERS.adminOps at MAIN, each with
   * its own reference (see refId).
   *
   * pending + paid, booked 45 minutes ago: the row the list search finds, and
   * long enough waiting for the amber "Waiting" badge. Read-only.
   */
  adminOpsWaiting: refId('ad5ea7c1'),
  /** confirmed + paid, tomorrow: the one ops adds a note to. */
  adminOpsNotes: refId('ad407e01'),
  /** confirmed + paid, tomorrow: cancelled by ops on the garage's behalf. */
  adminOpsCancel: refId('adca9ce1'),
  /** confirmed + paid, started two hours ago: marked as a customer no-show. */
  adminOpsNoShow: refId('ad905401'),
  /** confirmed + paid, tomorrow: too early for a no-show, so one is refused. */
  adminOpsTooEarly: refId('ad905402'),
  /**
   * The final-bill journey's jobs at INSPECT, both in progress and paid ₹299
   * for the inspection. The garage bills one above the fee (the customer
   * pays the rest in the app) and one below it (nothing more to pay).
   */
  billDue: refId('b111d0e1'),
  billNone: refId('b111d0e2'),
  /** pending + paid at INSPECT tomorrow: accepted, started (with a before
   *  photo) and completed through the portal, to record each step's time. */
  jobRecords: refId('b111d0e3'),
  /** in_progress + paid ₹299 at INSPECT: a bill paid through the webhook only. */
  billWebhook: refId('b111d0e4'),
  /**
   * The refunds journey's bookings, all CUSTOMERS.refunds at REFUNDS, each a
   * paid ₹499 wash.
   *
   * Cancelled by Detlio three days ago: owed, and late. Ops marks it
   * refunded in full; the customer's page then says so.
   */
  refundDetlio: refId('5efd0001'),
  /** Cancelled by Detlio an hour ago and left owed: the customer's page says
   *  the team will refund it within 5–7 working days. */
  refundDetlioStays: refId('5efd0002'),
  /** A customer no-show: never owed, and earns the garage its payout. */
  refundCustomerNoShow: refId('5efd0003'),
  /** A garage no-show: owed in full, and earns the garage nothing. */
  refundGarageNoShow: refId('5efd0004'),
  /**
   * Moved by the customer to refundMovedTo: cancelled with its payment still
   * 'paid', as a reschedule leaves it, but the money went with the move, so
   * it is never owed.
   */
  refundMovedFrom: refId('5efd0005'),
  refundMovedTo: refId('5efd0006'),
  /** Declined by the garage an hour ago and owed: ops presses Refund now
   *  (E2E_FAKE_PAYMENTS mints the rfnd_e2e_… refund), and it moves to Done. */
  refundSendNow: refId('5efd0007'),
  /**
   * The receipt spec's bookings at MAIN. Seeded without receipt numbers; the
   * spec's first open of each issues one, and nothing else changes them.
   *
   * completed, two services with SAVE20 (₹2,498 less ₹200), paid ₹2,298 two
   * days ago: the receipt with a discount.
   */
  receiptPaid: refId('2ec10001'),
  /** Declined by the garage and refunded in full in Razorpay: a refund line. */
  receiptRefunded: refId('2ec10002'),
  /** CUSTOMERS.receiptsStranger's, pending with nothing paid: no receipt yet. */
  receiptUnpaid: refId('2ec10003'),
  /**
   * CUSTOMERS.myBookings' list at MAIN, read-only. Upcoming, soonest first:
   * an Express Wash tomorrow at 08:00 (pending, unpaid), the Dent Assessment
   * moved to 12:00 (historyMovedTo), an Interior Detail at 15:00 (confirmed).
   */
  historyUpcomingSoon: id(621),
  historyUpcomingLater: id(622),
  /**
   * A move, as a reschedule leaves it: the 10:00 Dent Assessment cancelled by
   * the customer with its payment still paid, and the 12:00 one carrying it.
   * The old one is in neither tab.
   */
  historyMovedFrom: id(623),
  historyMovedTo: id(624),
  /** Past, most recent first: a Weekend Package the garage declined a day
   *  ago (nothing was paid), then a Full Body Detail completed three days ago. */
  historyDeclined: id(626),
  historyCompleted: id(625),
  /** Retired the old way, as status 'rescheduled' (a Retired Polish): in
   *  neither tab. */
  historyLegacyMoved: id(627),
  /**
   * CUSTOMERS.bookAgain's, all at MAIN and over. A doorstep job, completed,
   * for a Full Body Detail then an Express Wash: Book again must carry both,
   * in that order, and the mode.
   */
  rebookDoorstep: id(628),
  /** Cancelled, for an Express Wash and the since-withdrawn Retired Polish:
   *  Book again keeps the wash and says the other is no longer offered. */
  rebookPartlyRetired: id(629),
  /** Completed, for the Retired Polish alone: nothing left to book again, so
   *  it opens the garage page. */
  rebookAllRetired: id(630),
  /** The Home hub's bookings, all at HOME_PROMO; see CUSTOMERS.home*. */
  homeOfferDone: id(631),
  homeBillJob: id(632),
  homeWashFirst: id(633),
  homeWashSecond: id(634),
  homeUpdatesDone: id(635),
  homeNoticeUpcoming: id(636),
  homeClosedUpcoming: id(637),
  /** The Home screen's bookings, also at HOME_PROMO; see CUSTOMERS.homeScreenWash on. */
  homeScreenWashFirst: id(638),
  homeScreenWashSecond: id(639),
  homeBellDone: id(640),
  homeTileUpcoming: id(641),
  /**
   * The test-data reset API spec's chains, CUSTOMERS.dataReset's at RESET,
   * in two old financial years so its receipt numbers are the only ones
   * there. Deletable (Razorpay test mode):
   *
   * - resetRefunded: declined and refunded in full, receipt DTL/22-23/000001,
   *   the only receipt of 22-23 (which also has a void left by an earlier
   *   run), with its checkout, a note and a job photo. Deleting it restarts
   *   22-23.
   * - resetMovedFrom → resetMovedTo: a reschedule chain, receipt
   *   DTL/23-24/000002 on its first booking.
   *
   * Kept whatever is ticked:
   *
   * - resetLive: paid in Razorpay live mode, receipt DTL/23-24/000001. So
   *   23-24 keeps its series and 000002 becomes void.
   * - resetUnknown: paid before gateway_mode was recorded, an id Razorpay is
   *   never asked about in E2E: unknown, so kept.
   * - resetNextReceipt: paid live in 23-24 with no number yet; opened after
   *   the run, its receipt is DTL/23-24/000003.
   * - resetOpenOrder: never paid, with a live Razorpay order still open on
   *   a booking that is still on: "Payment may still arrive — kept".
   *
   * resetSingle: test mode, not marked: deleted on its own once marked.
   */
  resetRefunded: refId('da7a0001'),
  resetMovedFrom: refId('da7a0002'),
  resetMovedTo: refId('da7a0003'),
  resetLive: refId('da7a0004'),
  resetUnknown: refId('da7a0005'),
  resetNextReceipt: refId('da7a0006'),
  resetSingle: refId('da7a0007'),
  resetOpenOrder: refId('da7a000a'),
  /**
   * CUSTOMERS.dataResetUi's, test mode. resetUiSingle is marked Test and
   * deleted from its page; resetUiMarked is seeded marked and deleted from
   * Start pilot clean; resetUiKeep is seeded marked and unticked there, so
   * it must survive the run and stay unticked through "Load again".
   */
  resetUiSingle: refId('da7a0008'),
  resetUiMarked: refId('da7a0009'),
  resetUiKeep: refId('da7a000b'),
  /**
   * The admin round (0064), CUSTOMERS.adminRound's at VENDORS.roundA:
   * - roundSlot: in two days, booked yesterday: the Slot column and
   *   "Booked yesterday, …".
   * - roundDelete: marked Test, paid with E2E money, with a team note and a
   *   complaint about it: deleted from its page with both.
   * - roundLive: marked Test but paid with live money: Delete test booking
   *   says why it is kept, and deletes nothing.
   */
  roundSlot: refId('ad200003'),
  roundDelete: refId('ad200001'),
  roundLive: refId('ad200002'),
  /**
   * The garage Bin's (CUSTOMERS.bin*). binPaidUpcoming is confirmed and paid
   * (E2E money) in three days at VENDORS.binPaid, and binUnpaidUpcoming
   * pending and unpaid: moving the garage to the Bin cancels both, and only
   * the paid one is then a refund owed. binHardTest is a finished job paid in
   * E2E money at VENDORS.binHard, deleted forever with it; at VENDORS.binTomb,
   * binTombLive was paid in Razorpay live mode (kept, with the garage as a
   * tombstone) and binTombTest in E2E money (deleted).
   */
  binPaidUpcoming: refId('b1a00001'),
  binUnpaidUpcoming: refId('b1a00002'),
  binHardTest: refId('b1a00003'),
  binTombLive: refId('b1a00004'),
  binTombTest: refId('b1a00005'),
  /** CUSTOMERS.complaints', completed and paid (E2E money) at MAIN two days ago. */
  complaintDone: refId('c0a10001'),
  /**
   * CUSTOMERS.payouts' at VENDORS.payouts, each a paid ₹500 wash: finished
   * two days ago, a customer no-show yesterday (paid as if done), and one
   * confirmed for tomorrow, not payable yet.
   */
  payoutDone: refId('a7a00001'),
  payoutNoShow: refId('a7a00002'),
  payoutUpcoming: refId('a7a00003'),
  /**
   * At VENDORS.proposals (0041), each a paid ₹500 wash. Pending tomorrow at
   * 10:00 IST: the garage suggests other times and CUSTOMERS.proposalPicker
   * picks one. Pending tomorrow at 12:00: CUSTOMERS.proposalDecliner says
   * none work. In progress since an hour ago: the garage asks
   * CUSTOMERS.extraWorkPayer for extra work, which they pay.
   */
  proposalPick: id(2120),
  proposalDecline: id(2121),
  extraWorkJob: id(2122),
  /**
   * At VENDORS.response (0042): a paid ₹600 wash for tomorrow at 15:00 IST,
   * pending, paid 45 minutes ago, its garage's deadline to accept 15 minutes
   * ago. The pending-digest cron (AUTO_CANCEL_UNANSWERED on in E2E) cancels
   * it as not accepted in time, with the payment owed back in full.
   */
  notAccepted: id(2220),
  /**
   * At VENDORS.slotAlerts (0047): CUSTOMERS.slotHolder's paid ₹500 wash two
   * days ahead at 10:00 IST, pending (no deadline to accept, so the cron
   * leaves it alone). The garage takes one job a day, so the day is full
   * until the holder cancels it.
   */
  slotAlertsHeld: id(2720),
  /**
   * CUSTOMERS.carHistory's car at VENDORS.carHistory (0046): a ₹6,000
   * coating completed ~87 days ago, a ₹450 wash completed ~40 days ago, and
   * a wash cancelled by the customer (left out of the history).
   */
  carHistoryCoating: id(2620),
  carHistoryWash: id(2621),
  carHistoryCancelled: id(2622),
  /**
   * CUSTOMERS.certificate's car at VENDORS.certificate (0053): a polish
   * completed ~60 days ago, a wash completed ~12 days ago, and a wash
   * cancelled by the customer (not on the certificate).
   */
  certificatePolish: id(3320),
  certificateWash: id(3321),
  certificateCancelled: id(3322),
  /**
   * At VENDORS.photos (0045): CUSTOMERS.photos' paid ₹450 wash tomorrow at
   * 11:00 IST, accepted, not started and with no photos. The garage cannot
   * start it until it has two before photos.
   */
  photosJob: id(2520),
  /**
   * Contact windows, CUSTOMERS.contact's paid ₹400 washes at VENDORS.contact:
   * `contactSoon` confirmed, at the garage, in an hour (inside the window:
   * both numbers show); `contactLater` confirmed two days ahead (outside:
   * "shows 2 hours before"); `contactDone` completed three hours ago
   * (outside: "hidden after the job"); `contactDoorstep` pending, doorstep,
   * tomorrow (outside, with the address still on the garage's card). None
   * is moved or cancelled by any spec.
   */
  contactSoon: id(3420),
  contactLater: id(3421),
  contactDone: id(3422),
  contactDoorstep: id(3423),
  /**
   * The garage's Today view, CUSTOMERS.today's paid ₹700 washes at
   * VENDORS.today, placed so each list holds the same jobs whatever the
   * clock: `todayWorking` in progress since an hour ago (Today › Now);
   * `todayLate` accepted for an hour ago and not started (Today › Next);
   * `todayAnswer` new, two days ahead, with three hours left to answer
   * (New, and the pinned row); `todayLater` accepted four days ahead
   * (Later); `todayDone` completed yesterday (Done). The spec starts and
   * completes with Undo, so nothing is changed.
   */
  todayWorking: id(3920),
  todayLate: id(3921),
  todayAnswer: id(3922),
  todayLater: id(3923),
  todayDone: id(3924),
} as const

/** Where BOOKINGS.contactDoorstep's crew goes (contact windows). */
export const CONTACT_DOORSTEP = {
  address: '14, Window Lane, Besant Nagar',
  lat: 12.99,
  lng: 80.27,
} as const

/** The coating's maintenance-wash reminder (0046), due in 3 days. */
export const SERVICE_REMINDERS = {
  carHistoryMaintenance: id(2630),
} as const

export const VEHICLES = {
  /** Hatchback, default. Priced on the tiered service. */
  hatchback: id(701),
  /** SUV — deliberately unpriced on SERVICES.tiered. */
  suv: id(702),
  sedan: id(703),
  /** CUSTOMERS.vehicles' default car, named by BOOKINGS.vehicleArchive.
   *  Deleting it must archive the row rather than fail. */
  booked: VEHICLE_BOOKED,
  /** CUSTOMERS.vehicles' second car, on no booking at all. Deleting it must
   *  take the row with it — archiving everything would fill the table with
   *  tombstones for cars added by mistake. */
  spare: id(705),
  /** CUSTOMERS.homeWash's second car, 13 days since its wash. */
  homeWashSecond: id(752),
  /** CUSTOMERS.homeScreenWash's second car, 13 days since its wash. */
  homeScreenWashSecond: id(757),
} as const

/**
 * Addresses that a spec needs to name.
 *
 * Only the doorstep fixture's two are pinned: every other seeded address is
 * incidental to its customer and nothing asserts on it by id.
 */
export const ADDRESSES = {
  /** Has coordinates, at ORIGIN — inside MAIN's 15 km doorstep radius. */
  doorstepPinned: id(901),
  /** Saved with no lat/lng. Doorstep checkout must prompt for a pin rather
   *  than letting the booking fail the server's coverage check. */
  doorstepUnpinned: id(902),
  /** CUSTOMERS.pickup's default, pinned at PICKUP_HOME: inside VENDORS.pickup's reach. */
  pickupHome: id(903),
  /** CUSTOMERS.doorstepReach's, at UNSET_RADIUS_COVERED: inside the default 10 km. */
  reachCovered: id(913),
  /** CUSTOMERS.doorstepReach's, at UNSET_RADIUS_OUTSIDE: outside it. */
  reachOutside: id(904),
} as const

export const REVIEWS = { existing: id(801) } as const

/**
 * Checkouts. `failed` is CUSTOMERS.intents' paid-but-no-booking checkout:
 * failed so its status read carries the refund message too. `refundOwed` is
 * CUSTOMERS.refunds' one at REFUNDS, which the refunds journey finds on the
 * Owed list.
 */
export const BOOKING_INTENTS = {
  failed: id(1001),
  refundOwed: id(1002),
  /** BOOKINGS.resetRefunded's own checkout, consumed: goes with it. */
  resetOwn: id(1003),
  /**
   * CUSTOMERS.dataReset's checkouts that never became a booking: one paid
   * in test mode, failed and refunded (a checkout refund record), and one
   * abandoned unpaid. Both opened in 23-24, so long expired.
   */
  resetFailed: id(1004),
  resetAbandoned: id(1005),
  /** CUSTOMERS.binHard's checkout at VENDORS.binHard, abandoned unpaid (test mode) days ago. */
  binAbandoned: id(1006),
} as const

/**
 * An earlier reset's audit row, which RESET_VOID (DTL/22-23/000002) points
 * at: the void a restart of 22-23 clears.
 */
export const DATA_RESET = { earlierAudit: id(1301) } as const

/**
 * Coverage & leads (0064; ids 5000–5019, phones 90000050xx), only
 * specs/admin/coverage-*.spec.ts touch these. The leads are in Perambur
 * (seeded by 0062): `toTarget` and `notInterested` for the call list,
 * `onboard` for Onboard → Add garage, and `knownAqua`, whose phone is
 * PLACES_FAKE's "Aqua Foam Car Wash" (lib/places/fake.ts), so the finder
 * marks that one as known. `pasted` is the number Paste a list's spec
 * writes, `added` the one Add lead's spec types. The zone specs add and
 * remove their own zone, "E2E Test Zone" (slug e2e-test-zone), far from
 * every fixture. (Customer reach part 2 holds 4400–4599 and its garages
 * 9000004441–43, so these moved here.)
 */
export const LEADS = {
  zoneSlug: 'perambur',
  zoneName: 'Perambur',
  toTarget: { id: id(5001), name: 'Leads Test Wash', phone: '9000005001' },
  notInterested: { id: id(5002), name: 'Leads Nope Detailers', phone: '9000005002', reason: 'Has their own app' },
  onboard: { id: id(5003), name: 'Leads Onboard Garage', phone: '9000005003' },
  knownAqua: { id: id(5004), name: 'Aqua Foam (known)', phone: '9790060193' },
  /** The garage Onboard creates, and its owner. */
  onboardOwner: { name: 'Leads Owner Uma', phone: '9000005005' },
  pasted: { name: 'Leads Pasted Wash', phone: '9000005006' },
  added: { phone: '9000005007' },
  testZone: { name: 'E2E Test Zone', slug: 'e2e-test-zone', lat: 12.8, lng: 80.02 },
} as const

/**
 * Coverage part 3 (0064; ids 5020–5099, phones 90000050xx): demand in
 * Perambur (specs/admin/coverage-demand.spec.ts, requests.spec.ts).
 *
 * - `waiting`: twelve customers on Perambur's free-wash list, positions
 *   1–12, so each holds a free wash (Perambur is not live).
 * - `requester` sent five requests from Perambur to two garages of their
 *   own (`garages`, pinned far outside every zone, not shown to
 *   customers): `open` waiting for its first garage (Call garage, Cancel),
 *   `accepted` (a yes with a ₹100 travel fee), `failed` (passed on from the
 *   first garage, which couldn't, to the second, which never answered) and
 *   `expired` (nobody answered). Perambur: 12 waiting + 2 failed = 14, Hot.
 * - `recommender`'s recommendations in Perambur: `make` (Make lead),
 *   `dup` and `anyway` (both share `dupLead`'s phone: Link to it, and Make
 *   lead anyway), `dismiss`, `onboard` (already made into `onboardLead`,
 *   for Onboard → its garage), and `noZone` (in no zone).
 * - `googleLead`: a lead from Google (its name and phone Google's only),
 *   for Edit lead's "Confirmed by phone".
 *
 * Names share no word with each other, LEADS or PLACES_FAKE, so the
 * duplicate rule and the finder's "known" only match what they mean to.
 */
export const DEMAND = {
  waiting: Array.from({ length: 12 }, (_, i) => ({
    id: id(5020 + i),
    phone: `90000050${String(20 + i)}`,
    name: `Waiting Perambur ${i + 1}`,
  })),
  requester: { id: id(5040), phone: '9000005040', name: 'Request Raghav' },
  recommender: { id: id(5042), phone: '9000005042', name: 'Recommend Revathi' },
  garages: {
    one: { id: id(5050), name: 'Demand Doorstep One', phone: '9000005050', ownerId: id(5051), ownerPhone: '9000005051' },
    two: { id: id(5052), name: 'Demand Doorstep Two', phone: '9000005052', ownerId: id(5053), ownerPhone: '9000005053' },
  },
  /** Where the request garages are: outside every zone, clear of every other fixture. */
  garagePin: { lat: 11.75, lng: 79.25 },
  requests: {
    open: id(5060),
    accepted: id(5061),
    failedFirst: id(5062),
    failedSecond: id(5063),
    expired: id(5064),
  },
  /** The services a request asked for (names only: a request keeps its lines). */
  service: { name: 'Demand Foam Wash', amount: '650.00' },
  recommendations: {
    make: { id: id(5070), name: 'Kolathur Velvet Motors', phone: '9000005070', why: 'Did a careful job on my old car' },
    dup: { id: id(5071), name: 'Thiruvika Polish Bay', phone: '9000005080', why: 'Quick and fair' },
    anyway: { id: id(5072), name: 'Anyway Kavya Autocare', phone: '9000005080', why: 'Near my office' },
    dismiss: { id: id(5073), name: 'Dismissable Ravi Garage', phone: '9000005073', why: null },
    onboard: { id: id(5074), name: 'Perambur Onyx Studio', phone: '9000005081', why: 'Best ceramic work nearby' },
    noZone: { id: id(5075), name: 'Nowhere Nila Works', phone: '9000005075', why: 'Opens early' },
  },
  /** The Maps link Make lead reads `make`'s pin from: in Perambur. */
  makeLink: 'https://www.google.com/maps/@13.1180,80.2340,17z',
  dupLead: { id: id(5080), name: 'Thiruvika Polish Bay', phone: '9000005080' },
  onboardLead: { id: id(5081), name: 'Perambur Onyx Studio', phone: '9000005081' },
  /** The garage Onboard creates from `onboardLead`, and its owner. */
  onboardOwner: { name: 'Demand Owner Devi', phone: '9000005082' },
  googleLead: {
    id: id(5083),
    placeId: 'e2e-demand-google-5083',
    googleName: 'Gem Jewel Autobay',
    googlePhone: '9000005083',
  },
} as const

/**
 * The admin round's other rows (0064; ids 4200–4249): the complaint about
 * BOOKINGS.roundDelete, and VENDORS.roundA's two marks.
 */
export const ROUND = {
  complaint: id(4230),
  /** "New garage call": three items, the first ticked with an answer. */
  checklistMark: id(4231),
  /** From before 0064: its note's "- " lines read as items. */
  oldNoteMark: id(4232),
} as const

/**
 * Team notices. `homeRain` is about bookings at HOME_PROMO around
 * CUSTOMERS.homeNotice's slot, and nobody else's (the admin notices spec
 * counts exactly one customer in its window): never an 'all' notice,
 * which would reach every customer's Home in every parallel spec.
 */
export const NOTICES = {
  homeRain: id(1101),
  /** About CUSTOMERS.homeTile's slot only, a day after homeRain's window. */
  homeTileNote: id(1102),
} as const

/** A final bill. `homeBill` is CUSTOMERS.homeBill's, ₹800 still to pay. */
export const CHARGES = { homeBill: id(1201) } as const

/**
 * The shared env login, matching ADMIN_USERNAME / ADMIN_PASSWORD in .env.e2e:
 * the bootstrap and break-glass door, which signs as 'admin' (the
 * 'admin-shared' state). Admin specs sign in as ADMIN_LOGINS.e2e instead.
 */
export const ADMIN = { username: 'admin', password: 'admin' } as const

/**
 * Personal admin logins (0058), ids 4100–4149 (and `collector`, 0059's,
 * 4160). `e2e` is the panel's
 * session in every admin spec (global-setup's 'admin' state), so every action
 * there is signed "E2E Admin", and it is the team's OWNER (`isOwner`): the
 * only login that adds logins, resets passwords and turns logins on or off.
 * The rest are not owners and belong to specs/admin/team-logins.spec.ts
 * alone, since it turns them off and changes their passwords: nobody else
 * signs in as them. `off` is seeded turned off; `viewer` only looks.
 */
export const ADMIN_LOGINS = {
  e2e: { id: id(4100), username: 'e2e-admin', name: 'E2E Admin', password: 'e2e-admin-password', isOwner: true },
  resetMe: { id: id(4101), username: 'e2e-raga', name: 'Raga E2E', password: 'raga-e2e-password' },
  turnMeOff: { id: id(4102), username: 'e2e-ops', name: 'Ops E2E', password: 'ops-e2e-password' },
  changer: { id: id(4103), username: 'e2e-owner', name: 'Owner E2E', password: 'owner-e2e-password' },
  off: { id: id(4104), username: 'e2e-gone', name: 'Gone E2E', password: 'gone-e2e-password' },
  viewer: { id: id(4105), username: 'e2e-viewer', name: 'Viewer E2E', password: 'viewer-e2e-password' },
  /**
   * Collection lists' teammate (0059, the 4150–4199 range): not the owner,
   * with a phone, so "Also send on WhatsApp" is offered for them. Lists sent
   * to them are theirs under scope=mine.
   */
  collector: {
    id: id(4160),
    username: 'e2e-collector',
    name: 'E2E Collector',
    password: 'collector-e2e-password',
    phone: '9000004160',
  },
} as const

/** Chennai. Vendors sit within a few km of this so distance sorting is stable. */
export const ORIGIN = { lat: 13.0827, lng: 80.2707 } as const

/**
 * Where BOOKINGS.vendorDoorstep's customer is: ~1.6 km from MAIN, so a link
 * routed to the garage's own pin by mistake cannot pass for one routed here.
 * Both values are exact in binary (multiples of 1/32), so bookings.lat/lng —
 * float4 columns — hand them back unchanged and a spec can match the link
 * character for character.
 */
export const DOORSTEP_JOB_PIN = { lat: 13.09375, lng: 80.28125 } as const

/**
 * The Statistics fixtures (specs/admin/statistics-api.spec.ts), all
 * CUSTOMERS.stats's at VENDORS.stats, made at 11:00 IST on the days named.
 *
 * Before the spec's range (it runs from a day before `received(23)` to today):
 *
 * - received(1–20): one a day, 61 to 42 days ago, ₹500 washes, completed —
 *   except 3 and 7 (declined by the garage, refunded) and 12 (cancelled by
 *   the customer, refunded), which still use up a free place.
 * - received(21), received(22): completed washes 20 and 18 days ago, in the
 *   period the range is compared with: 2 bookings, ₹1,000.
 * - testOld: a completed wash marked Test, 50 days ago: no place in the queue.
 * - unpaidOld: an old pay-later booking cancelled before it was paid, 45 days
 *   ago: the garage never received it.
 *
 * In the range, one a day from 12 days ago, each slot the next day at 10:00:
 *
 * - received(23–25): completed washes, the last of the free 25.
 * - received(26): a completed wash: ₹40 (8% of ₹500).
 * - received(27): completed detailing with STATSPROMO, ₹200 off paid by
 *   Detlio: ₹100 (5% of the full ₹2,000); ₹1,800 collected.
 * - received(28): completed detailing with STATSGARAGE, ₹400 off paid by the
 *   garage: ₹80 (5% of ₹1,600).
 * - received(29): a completed scratch check (₹300) with a ₹1,200 final bill
 *   paid: ₹75 (5% of ₹1,500). Also a stray ₹1,300 paid on the bill it
 *   replaced, refunded: in no figure, its refund included.
 * - received(30): a customer no-show on a wash: ₹40, and its ₹500 kept.
 * - received(31): declined by the garage and refunded: no commission, ₹0.
 * - received(32) → movedTo: a wash moved by the customer to a slot after
 *   the range (two days on, so never today in India): one booking, not
 *   done yet, ₹500 collected.
 * - testInRange: a completed wash marked Test: in no figure.
 * - unpaidInRange: a pay-later booking cancelled unpaid: a checkout started.
 * - abandonedCheckout, failedCheckout (paid, no booking, refunded): two more.
 *
 * So, over the range: 10 bookings, ₹7,900 collected, ₹335 commission, 13
 * checkouts started, 1 cancellation, 7 completed, 1 no-show, 1 not done yet;
 * 7 slots at 10:00 in the busy hours; rated 4.5 over 2 reviews.
 */
export const STATS = {
  /** The garage's n-th received booking, 1-based, in the order made. */
  received: (n: number): string => id(1400 + n),
  testOld: id(1450),
  unpaidOld: id(1451),
  testInRange: id(1452),
  unpaidInRange: id(1453),
  movedTo: id(1454),
  abandonedCheckout: id(1460),
  failedCheckout: id(1461),
  reviews: [id(1470), id(1471)],
  bill: id(1480),
  strayBill: id(1481),
  /** Ended codes at VENDORS.stats, so nobody can use them at checkout. */
  promo: { id: id(511), code: 'STATSPROMO' },
  garageDiscount: { id: id(512), code: 'STATSGARAGE' },
} as const

/**
 * Statistics → Behaviour (0061; specs/admin/behaviour-api.spec.ts and
 * behaviour.spec.ts), ids 4200–4299. Seeded usage events only: E2E builds
 * record none of their own (NEXT_PUBLIC_ANALYTICS is off), so these are the
 * only visits there are. Each `visits` row is that many visits doing those
 * steps in order, two days ago at 11:00 IST, a minute apart:
 *
 * - landedOnly: 5 from Instagram, on a phone: landed and left.
 * - sawGarage: 3 from Instagram, on a phone: landed, saw a garage card,
 *   opened the garage, left.
 * - gaveNumber: 1 from Google, on a desktop: on to a service, Book Now and a
 *   code sent, then left.
 * - paid: 1 direct, on a phone: all the way to paid.
 * - fromLink: 4 from Instagram, on a phone, straight to a garage's page:
 *   never landed, so in no step, but counted in visits.
 * - team: 2 by `teamCustomer`, whose number is ADMIN_LOGINS.collector's
 *   phone: landed and paid, left out as the team's.
 * - test: 1 by CUSTOMERS.stats, eight days ago around 11:00 IST, when that
 *   customer made STATS.testInRange (marked Test): landed and paid, left
 *   out as a Test booking's (only in the last 30 days).
 *
 * Nobody picks an area (the landing page's chips come later), so that step
 * reads "Not recorded yet".
 *
 * Last 7 days, every source and device: 14 visits; landed 10, saw a garage
 * 5, opened a garage 5, opened a service 2, started booking 2, gave a
 * number 2, paid 1; the biggest leak is Landed → Saw a garage (5). Last
 * step before leaving, of 9: Landing page 5, A garage's page 3, Sign-in code
 * sent 1. 2 team visits left out. Instagram: landed 8. Phone: landed 9.
 * Last 30 days: the same, and 1 visit with a Test booking left out.
 */
export const BEHAVIOUR = {
  /** The n-th seeded visit's random id, 1-based. */
  visit: (n: number): string => id(4200 + n),
  teamCustomer: { id: id(4290), name: 'Team Tester E2E', phone: '9000004160' },
  groups: {
    landedOnly: { visits: 5, daysAgo: 2, channel: 'instagram', device: 'phone',
      steps: ['app_open', 'landing_view'] },
    sawGarage: { visits: 3, daysAgo: 2, channel: 'instagram', device: 'phone',
      steps: ['app_open', 'landing_view', 'garage_card_seen', 'garage_view'] },
    gaveNumber: { visits: 1, daysAgo: 2, channel: 'google', device: 'desktop',
      steps: ['app_open', 'landing_view', 'garage_card_seen', 'garage_view', 'service_sheet_open',
        'booking_start', 'otp_sent'] },
    paid: { visits: 1, daysAgo: 2, channel: 'direct', device: 'phone',
      steps: ['app_open', 'landing_view', 'garage_card_seen', 'garage_view', 'service_sheet_open',
        'booking_start', 'otp_sent', 'checkout_start', 'pay_click', 'pay_success'] },
    fromLink: { visits: 4, daysAgo: 2, channel: 'instagram', device: 'phone',
      steps: ['app_open', 'garage_view'] },
    team: { visits: 2, daysAgo: 2, channel: 'direct', device: 'phone', user: 'team',
      steps: ['app_open', 'landing_view', 'garage_view', 'booking_start', 'pay_success'] },
    test: { visits: 1, daysAgo: 8, channel: 'direct', device: 'phone', user: 'stats',
      steps: ['app_open', 'landing_view', 'garage_view', 'booking_start', 'pay_success'] },
  },
} as const

// Trust & look: no-photo look and What's included (0063)
/**
 * specs/users/no-photo-look.spec.ts, ids 4700–4749, phones 90000049xx.
 * Two garages far south-west like VENDORS.media (past 50 km, so "Outside
 * Chennai", and at the very end of any located list), each with its own
 * owner, so nothing here moves another spec's numbers:
 *
 * - plain: no photo and no logo, At garage and Doorstep: its card and page
 *   show the designed cover ("NP", "CHENNAI • AT GARAGE • DOORSTEP") and
 *   the monogram tile. Its services:
 *   - points: seven "- " points under an intro: the sheet shows five and
 *     "+2 more"; its card "Deep vacuum · Seat shampoo · Dashboard polish +4".
 *     The last is one long unbroken word, which must wrap on a 375px phone.
 *   - bike: a plain description, no points, no media: the bike icon tile,
 *     and a sheet with no picture area, the description as written.
 *   - aiOnly: only an AI picture: customers get no media at all (the API
 *     leaves it out), so the coating icon tile and no picture area.
 *   - photo: one garage photo: its thumbnail, and the sheet's media area
 *     "From Nila Polish Works".
 * - photo: one garage photo and no logo: the photo, with the monogram ("VP").
 */
export const TRUST_LOOK = {
  plainOwner: { id: id(4700), name: 'Nila Owner E2E', phone: '9000004900' },
  photoOwner: { id: id(4701), name: 'Vel Owner E2E', phone: '9000004901' },
  plain: { id: id(4702), name: 'Nila Polish Works', phone: '9000004902', initials: 'NP' },
  photo: { id: id(4703), name: 'Vel Photo Garage', phone: '9000004903', initials: 'VP' },
  /** VENDORS.photo's one photo. */
  garagePhotoUrl: 'https://placehold.co/600x400/png?text=Vel+Photo+Garage',
  services: {
    points: {
      id: id(4710), name: 'Nila Cabin Deep Clean', price: '1999.00', durationMins: 180,
      intro: 'A deep clean of the whole cabin.',
      points: [
        'Deep vacuum', 'Seat shampoo', 'Dashboard polish', 'Door pads wiped',
        'Glass cleaned', 'Odour removal',
        // One long unbroken word (a pasted link, say): it must wrap at 375px.
        'Mats washed: MicrofibreTowelDriedPhNeutralShampooWithoutHarshChemicals',
      ],
    },
    bike: {
      id: id(4711), name: 'Nila Two-Wheeler Wash', price: '200.00', durationMins: 45,
      description: 'Body, wheels and chain area',
    },
    aiOnly: { id: id(4712), name: 'Nila Ceramic Guard', price: '4999.00', durationMins: 240 },
    photo: { id: id(4713), name: 'Nila Foam Shine', price: '599.00', durationMins: 60 },
    /** On TRUST_LOOK.photo, so it is listed like any garage with a service. */
    photoGarageWash: { id: id(4714), name: 'Vel Quick Wash', price: '399.00', durationMins: 30 },
  },
  media: {
    ai: { id: id(4720), url: 'https://placehold.co/600x400/png?text=AI+sample' },
    photo: { id: id(4721), url: 'https://placehold.co/600x400/png?text=Nila+Foam+Shine' },
  },
} as const

// Trust & look: tiers and the garage agreement (0063)
/**
 * specs/journeys/tiers-journey.spec.ts and agreement-journey.spec.ts, ids
 * 4600–4699 and phones 90000047xx only. Five live garages far north (past
 * 50 km: "Outside Chennai", at the end of any located list, and named
 * "Zeal …" so they come last in a list sorted by name), each with its own
 * owner, so nothing here moves another spec's numbers. Garage agreement v1
 * is published by the seed (`agreementV1`; its PDF is not in the bucket:
 * the agreement journey publishes a real one first).
 *
 * - gold: Gold (certified), holds Silver, accepted v1: the Gold medal, then
 *   Silver while Gold is switched off.
 * - silver: holds Silver, accepted v1: the Silver medal, hidden and shown
 *   again by its Tier tab's switch.
 * - bronze: accepted v1 only: the Bronze medal; its owner's "Your tier"
 *   (next: Silver) links to Documents.
 * - fresh: has accepted nothing: its owner gets Home's banner and accepts
 *   the agreement, becoming Bronze.
 * - award: accepted v1, its shop photo, ID and bank proof approved, 20 jobs
 *   completed in the last 60 days (photos waived by Detlio, so the photo
 *   standard has nothing to grade) and 10 five-star reviews from `reviewer`:
 *   every Gold standard met, so admin records a passing check and presses
 *   Award Gold.
 */
export const TIERS = {
  owners: {
    gold: { id: id(4600), name: 'Zeal Gold Owner', phone: '9000004700' },
    silver: { id: id(4601), name: 'Zeal Silver Owner', phone: '9000004701' },
    bronze: { id: id(4602), name: 'Zeal Bronze Owner', phone: '9000004702' },
    fresh: { id: id(4603), name: 'Zeal Fresh Owner', phone: '9000004703' },
    award: { id: id(4604), name: 'Zeal Award Owner', phone: '9000004704' },
  },
  reviewer: { id: id(4605), name: 'Zeal Reviewer Revathi', phone: '9000004705', vehicleId: id(4606) },
  agreementV1: { id: id(4610), key: `agreements/v1-${id(4610)}.pdf` },
  gold: { id: id(4620), name: 'Zeal Gold Garage', serviceId: id(4630) },
  silver: { id: id(4621), name: 'Zeal Silver Garage', serviceId: id(4631) },
  bronze: { id: id(4622), name: 'Zeal Bronze Garage', serviceId: id(4632) },
  fresh: { id: id(4623), name: 'Zeal Fresh Garage', serviceId: id(4633) },
  award: { id: id(4624), name: 'Zeal Award Garage', serviceId: id(4634) },
  /** The award garage's 20 completed jobs, and the first 10 reviewed. */
  awardJob: (n: number) => id(4640 + n),
  awardReview: (n: number) => id(4670 + n),
} as const

/**
 * Pre-iOS accounts round (0066): ids 5100–5199 and phones 90000051xx only,
 * people included (seeded with their rows, like TIERS, not in CUSTOMERS or
 * STAFF: the specs sign them in themselves). Two unverified garages pinned
 * far from every other fixture: `garage` (owner `owner`, operators `leaver`,
 * `deleter` and `answerer`) with `customer`'s jobs, `closing` (owner
 * `closer`) with an open "Close my garage" request, and `quitting` (owner
 * `quitter`). Each spec file signs in its own people, so no two files share
 * a number (concurrent sign-ins of one number race for its code). `leaving` deletes their account (a
 * completed doorstep job with a review, a booked car, a spare car, an
 * address); `blocked` has a booking to come; `editor` edits their details;
 * `withdrawer` has an open complaint and is on Medavakkam's list;
 * `noGarage` is a garage login with no garage yet.
 */
export const PREIOS = {
  pin: { lat: 11.75, lng: 79.25 },
  leaving: {
    id: id(5101), phone: '9000005101', name: 'Leaving Lakshmi',
    vehicleId: id(5102), spareVehicleId: id(5103), addressId: id(5104), plate: 'TN05DL0001',
  },
  blocked: { id: id(5105), phone: '9000005105', name: 'Blocked Bala', vehicleId: id(5106) },
  editor: { id: id(5107), phone: '9000005107', name: 'Editing Ezhil', vehicleId: id(5108), addressId: id(5109) },
  withdrawer: { id: id(5113), phone: '9000005113', name: 'Withdrawing Vani', vehicleId: id(5114) },
  customer: { id: id(5116), phone: '9000005116', name: 'Garage Side Gita', vehicleId: id(5117), addressId: id(5118) },
  owner: { id: id(5120), phone: '9000005120', name: 'Preios Owner Prakash' },
  leaver: { id: id(5121), phone: '9000005121', name: 'Leaving Operator Lokesh' },
  deleter: { id: id(5122), phone: '9000005122', name: 'Deleting Operator Divya' },
  noGarage: { id: id(5123), phone: '9000005123', name: 'No Garage Naveen' },
  closer: { id: id(5124), phone: '9000005124', name: 'Closing Owner Kumar' },
  /** An operator at `garage` who answers its requests (the withdraw test). */
  answerer: { id: id(5125), phone: '9000005125', name: 'Answering Operator Anbu' },
  /** Owns `quitting`, and asks to close it (and takes that back). */
  quitter: { id: id(5126), phone: '9000005126', name: 'Quitting Owner Queen' },
  garage: { id: id(5130), name: 'Preios Test Garage', serviceId: id(5132), serviceName: 'Preios Foam Wash' },
  closing: { id: id(5131), name: 'Closing Test Garage', serviceId: id(5133) },
  quitting: { id: id(5134), name: 'Quitting Test Garage', serviceId: id(5135) },
  closure: { id: id(5140), reason: 'Moving the business to Coimbatore' },
  /** leaving's completed doorstep job and its review; blocked's booking to come. */
  leavingDone: id(5110),
  leavingReview: id(5111),
  blockedOpen: id(5112),
  complaint: id(5115),
  /** customer's jobs at `garage`: accepted 3 days out, accepted in 6 hours, waiting to be accepted. */
  cancelEarly: id(5150),
  cancelLate: id(5151),
  accept: id(5152),
  /** Pickup & drop: not collected yet (codes below), and being worked on at the garage. */
  pickupFresh: id(5153),
  pickupOut: id(5154),
  /** Already cancelled by the garage after accepting: the customer's page says so. */
  garageCancelled: id(5155),
  pickupCode: '4821',
  deliveryCode: '7395',
  /** customer's request to `garage`, accepted and not paid for; and one the garage already took back. */
  request: id(5160),
  requestWithdrawn: id(5161),
  area: { slug: 'medavakkam', name: 'Medavakkam' },
} as const
