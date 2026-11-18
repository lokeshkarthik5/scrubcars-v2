/**
 * "Back up all garages" (owner-approved screens, 18 Nov 2026): every garage's
 * data as one .zip of spreadsheets, a copy the owner keeps outside Detlio.
 *
 * The API never builds the .zip: a Vercel function's answer is capped near
 * 4.5 MB and its time is short. GET /admin/backup lists the sheets below with
 * their row counts, and GET /admin/backup/:table pages through one sheet's
 * rows (keyset on the row's id, BACKUP_PAGE_SIZE at a time). The panel makes
 * the CSVs, zips them and saves the file.
 *
 * This file is the sheets' shape and the rules applied to every row before it
 * leaves the server; the SQL behind each column is the repository's
 * (modules/garage-backup), and a test holds the two to the same columns.
 *
 * Phones and bank account numbers come out masked (98•••••210) unless the
 * owner turned on "Include full phone numbers and bank account numbers" for
 * that one download. The masking happens here, on the server, never only in
 * the browser. Nothing secret is ever in a sheet: no password hashes, OTPs,
 * session or bill tokens, handover codes, Razorpay keys or webhook secrets.
 */

import { maskPhones } from './off-app-flags.js'

/** Rows in one page. A bookings page is about 0.6 MB of JSON, far under the cap. */
export const BACKUP_PAGE_SIZE = 500

/**
 * How long a backup's audit row lets its pages be read. A download of every
 * garage takes about a minute today; this leaves room for a slow connection
 * without letting an old backup's id open the data again tomorrow.
 */
export const BACKUP_WINDOW_MS = 2 * 60 * 60 * 1000

/** admin_audit_log.action for each download. */
export const BACKUP_AUDIT_ACTION = 'garage_backup_downloaded'

/** The lines of the sheet, in its order: one or more spreadsheets each. */
export const BACKUP_GROUPS = [
  { key: 'garages', label: 'Garages and their details', short: 'Garages' },
  { key: 'services', label: 'Services and prices', short: 'Services' },
  { key: 'hours', label: 'Opening hours', short: 'Opening hours' },
  { key: 'photos', label: 'Photos (links)', short: 'Photos' },
  { key: 'bank', label: 'Bank and payout details', short: 'Bank details' },
  { key: 'bookings', label: 'Bookings', short: 'Bookings' },
  { key: 'reviews', label: 'Reviews', short: 'Reviews' },
  { key: 'payouts', label: 'Payouts', short: 'Payouts' },
  { key: 'garage_book', label: 'Garage Book: customers, bills, expenses, stock', short: 'Garage Book' },
  { key: 'documents', label: 'Documents (links)', short: 'Documents' },
] as const

export type BackupGroupKey = (typeof BACKUP_GROUPS)[number]['key']

/**
 * How a column is protected when full numbers are off:
 *   phone    a phone number: 98•••••210
 *   account  a bank account number: 12•••••789
 *   upi      a UPI ID: its name part hidden, ra•••••@okaxis
 *   text     free text a person typed (notes, addresses, reasons): any
 *            mobile number or long run of digits in it is masked
 */
export type BackupMask = 'phone' | 'account' | 'upi' | 'text'

export interface BackupColumn {
  /** The SQL alias the repository selects it as. */
  key: string
  /** The CSV header. */
  header: string
  /** What it means, for the Read me. */
  about: string
  mask?: BackupMask
}

export interface BackupTable {
  key: string
  /** The file's name inside the .zip. */
  file: string
  group: BackupGroupKey
  /** One line for the Read me. */
  about: string
  columns: readonly BackupColumn[]
}

const GARAGE_ID: BackupColumn = {
  key: 'garage_id',
  header: 'Garage ID',
  about: "The garage's Detlio ID. The same in every file, so sheets can be matched up.",
}
const GARAGE_NAME: BackupColumn = {
  key: 'garage_name',
  header: 'Garage',
  about: "The garage's business name.",
}

/** Every sheet starts with the garage, so any two can be joined. */
const withGarage = (...columns: BackupColumn[]): readonly BackupColumn[] => [GARAGE_ID, GARAGE_NAME, ...columns]

const col = (key: string, header: string, about: string, mask?: BackupMask): BackupColumn =>
  mask ? { key, header, about, mask } : { key, header, about }

export const BACKUP_TABLES = [
  {
    key: 'garages',
    file: 'garages.csv',
    group: 'garages',
    about: 'One row per garage, including garages in the Bin.',
    columns: withGarage(
      col('status', 'Status', 'pending (not live yet), active, suspended or archived.'),
      col('verified', 'Verified', 'Yes when Detlio checked the garage.'),
      col('in_bin_since', 'In the Bin since', 'When it was moved to the Bin; empty if it is not there.'),
      col('deleted_forever_at', 'Deleted forever', 'When it was deleted forever but kept for its receipts.'),
      col('bookings_paused_since', 'Bookings paused since', 'When it stopped taking new bookings; empty if it takes them.'),
      col('bookings_paused_reason', 'Pause reason', 'Why bookings are paused.', 'text'),
      col('phone', 'Phone', "The garage's phone number.", 'phone'),
      col('whatsapp', 'WhatsApp', "The garage's WhatsApp number.", 'phone'),
      col('email', 'Email', "The garage's email address."),
      col('owner_name', 'Owner', "The owner's name on their Detlio account.", 'text'),
      col('owner_phone', 'Owner phone', "The owner's phone number, which they sign in with.", 'phone'),
      col('address', 'Address', 'The street address.', 'text'),
      col('city', 'City', 'The city as typed.'),
      col('pincode', 'Pincode', 'The 6-digit pincode.'),
      col('service_city', 'Service city', 'The Detlio city it is listed in; empty for other towns.'),
      col('lat', 'Latitude', 'Where the map pin is.'),
      col('lng', 'Longitude', 'Where the map pin is.'),
      col('maps_link', 'Google Maps link', 'The Maps link the garage gave.'),
      col('years_in_operation', 'Years running', 'How long the garage has been running, as it told us.'),
      col('at_garage', 'At the garage', 'Yes when customers can bring the car in.'),
      col('doorstep', 'Doorstep', 'Yes when it comes to the customer.'),
      col('doorstep_radius_km', 'Doorstep radius (km)', 'How far it travels for doorstep work.'),
      col('doorstep_whole_city', 'Doorstep: whole city', 'Yes when it comes anywhere in its city.'),
      col('pickup', 'Pickup & drop', 'Its answer on pickup & drop (yes, no or nearby).'),
      col('pickup_radius_km', 'Pickup radius (km)', 'How far it collects cars from.'),
      col('pickup_whole_city', 'Pickup: whole city', 'Yes when it collects anywhere in its city.'),
      col('pickup_terms_accepted_at', 'Pickup terms accepted', 'When the pickup responsibility terms were accepted.'),
      col('pickup_terms_accepted_by', 'Pickup terms accepted by', 'Who accepted them.', 'text'),
      col('pickup_fee_mode', 'Pickup fee', 'free, fixed (one fee) or distance (by the km).'),
      col('pickup_fee_fixed', 'Pickup fee: fixed (₹)', 'The one fee, when the fee is fixed.'),
      col('pickup_fee_free_km', 'Pickup fee: free km', 'Kilometres free before the fee starts, by distance. Empty is Detlio’s suggestion.'),
      col('pickup_fee_per_km', 'Pickup fee: per km (₹)', 'Rupees per kilometre, by distance. Empty is Detlio’s suggestion.'),
      col('pickup_fee_min', 'Pickup fee: minimum (₹)', 'The least it charges, by distance. Empty is Detlio’s suggestion.'),
      col('pickup_fee_max', 'Pickup fee: maximum (₹)', 'The most it charges, by distance. Empty is Detlio’s suggestion.'),
      col('pickup_fee_set_by', 'Pickup fee set by', 'garage or detlio.'),
      col('pickup_fee_locked_by', 'Pickup fee locked by', 'Who on the team made Detlio set this fee; empty if the garage sets it.'),
      col('bays', 'Bays', 'How many cars it can work on at once.'),
      col('jobs_per_day', 'Jobs a day', 'How many jobs it takes a day.'),
      col('vehicle_types', 'Vehicle types', 'The kinds of car it works on.'),
      col('slot_interval_mins', 'Slot every (minutes)', 'How often a booking can start.'),
      col('repair_quotes', 'Repair quotes', 'Yes when it is asked for repair & bodywork quotes.'),
      col('onboarded_by', 'Onboarded by', 'Who on the team brought it in.'),
      col('notes', 'Team notes', "The team's notes on the garage.", 'text'),
      col('logo_link', 'Logo link', 'A link to its logo picture.'),
      col('created_at', 'Added', 'When it was added to Detlio.')
    ),
  },
  {
    key: 'services',
    file: 'services.csv',
    group: 'services',
    about: 'One row per service, add-on and package, including ones switched off or deleted.',
    columns: withGarage(
      col('service_id', 'Service ID', 'The service’s Detlio ID; bookings and bills name it.'),
      col('name', 'Name', 'The service’s name.'),
      col('kind', 'Kind', 'Service, Add-on (a small extra, never booked alone) or Package (a bundle of services).'),
      col('category', 'Category', 'car_wash, detailing, coating, scratch_removal, general_service, repairs, dent_paint, others or package.'),
      col('pricing_type', 'Pricing', 'flat (one price), per_vehicle (by car type) or on_inspection (priced after a look).'),
      col('price', 'Price (₹)', 'The price; for by car type the cheapest; for on inspection the inspection fee (0 for none).'),
      col('price_hatchback', 'Hatchback (₹)', 'The hatchback price, by car type.'),
      col('price_sedan', 'Sedan (₹)', 'The sedan price, by car type.'),
      col('price_suv', 'SUV (₹)', 'The SUV price, by car type.'),
      col('approx_price', 'Approx. price (₹)', 'The rough price shown for an on-inspection job; never charged.'),
      col('duration_mins', 'Minutes', 'How long it takes; empty when not set (the calendar then keeps 60 minutes).'),
      col('commission_rate', 'Commission (%)', 'Its own commission percent; empty means its category’s rate.'),
      col('package_contains', 'In this package', 'For a package, the services it bundles.'),
      col('active', 'On', 'Yes when customers can book it.'),
      col('deleted_at', 'Deleted', 'When it was deleted (kept because bookings name it).'),
      col('description', 'Description', 'What the garage page says about it.', 'text')
    ),
  },
  {
    key: 'opening_hours',
    file: 'opening-hours.csv',
    group: 'hours',
    about: 'One row per garage per day of the week.',
    columns: withGarage(
      col('day', 'Day', 'The day of the week.'),
      col('opens', 'Opens', 'Opening time (24-hour clock).'),
      col('closes', 'Closes', 'Closing time (24-hour clock).'),
      col('closed', 'Closed all day', 'Yes when it is shut that day.')
    ),
  },
  {
    key: 'photos',
    file: 'photos.csv',
    group: 'photos',
    about: 'One row per picture or video: links, not the files. Garage photos, logos, and each service’s photos and videos.',
    columns: withGarage(
      col('photo_id', 'Photo ID', 'The picture’s Detlio ID (a logo uses the garage’s).'),
      col('kind', 'Kind', 'Logo, Garage photo, Service photo or Service video.'),
      col('service_name', 'Service', 'The service it shows, for a service photo or video.'),
      col('link', 'Link', 'Where the picture is (a video’s link is its stream).'),
      col('poster_link', 'Video poster link', 'A still from the video.'),
      col('made_with_ai', 'Made with AI', 'Yes for a sample picture admin made with AI (never shown to customers).'),
      col('sort_order', 'Order', 'Its place in the garage’s or service’s pictures.'),
      col('added_at', 'Added', 'When it was added.')
    ),
  },
  {
    key: 'bank',
    file: 'bank-and-payout-details.csv',
    group: 'bank',
    about: 'One row per garage: where Detlio pays it, and how its own customers pay it.',
    columns: withGarage(
      col('account_name', 'Account name', 'The name on the bank account Detlio pays.', 'text'),
      col('account_number', 'Account number', 'The bank account number.', 'account'),
      col('ifsc', 'IFSC', 'The bank branch code.'),
      col('upi_id', 'UPI ID', 'The UPI ID Detlio pays, if any.', 'upi'),
      col('payout_details_updated_by', 'Payout details updated by', 'Who last changed them.'),
      col('payout_details_updated_at', 'Payout details updated', 'When they were last changed.'),
      col('customer_upi_id', 'Customers pay: UPI ID', "The garage's own UPI ID, on its Garage Book bills.", 'upi'),
      col('customer_upi_name', 'Customers pay: UPI name', 'The name on that UPI ID.', 'text'),
      col('customer_pay_phone', 'Customers pay: phone', 'The phone number its customers pay to.', 'phone'),
      col('customer_pay_apps', 'Customers pay: apps', 'The apps that phone takes (GPay, PhonePe, Paytm).')
    ),
  },
  {
    key: 'bookings',
    file: 'bookings.csv',
    group: 'bookings',
    about: 'One row per Detlio booking, including cancelled and test ones. Its services are in booking-items.csv.',
    columns: withGarage(
      col('booking_id', 'Booking ID', 'The booking’s Detlio ID.'),
      col('reference', 'Reference', 'The reference customers read out (#3F2A9C1B).'),
      col('booked_at', 'Booked', 'When the customer booked.'),
      col('scheduled_at', 'For', 'The time the job was booked for.'),
      col('status', 'Status', 'pending, confirmed, in_progress, completed, cancelled or rescheduled.'),
      col('booking_type', 'Where', 'dropin (at the garage), doorstep or pickup (pickup & drop).'),
      col('customer_name', 'Customer', 'The customer’s name; empty if they deleted their account.', 'text'),
      col('customer_phone', 'Customer phone', 'The customer’s phone number.', 'phone'),
      col('car', 'Car', 'The car’s make and model.'),
      col('car_plate', 'Number plate', 'The car’s number plate.'),
      col('address', 'Address', 'The customer’s address, for doorstep and pickup.', 'text'),
      col('duration_mins', 'Minutes', 'How long the booking holds the calendar.'),
      col('services_total', 'Subtotal (₹)', 'The services and the pickup fee, before any discount.'),
      col('discount', 'Discount (₹)', 'Money off.'),
      col('discount_code', 'Promo code', 'The code used, if any.'),
      col('discount_paid_by', 'Discount paid by', 'platform (Detlio) or vendor (the garage).'),
      col('pickup_fee', 'Pickup fee (₹)', 'The pickup & drop fee, which the garage keeps whole.'),
      col('road_km', 'Pickup distance (km)', 'The road distance the pickup fee was worked out on.'),
      col('convenience_fee', 'Convenience fee (₹)', "Detlio's convenience fee."),
      col('amount', 'Total (₹)', 'What the customer pays.'),
      col('payment_method', 'Payment', 'online or cash.'),
      col('payment_status', 'Payment status', 'pending, paid, failed, refunded or collected (cash taken); empty when no payment was started.'),
      col('paid_at', 'Paid', 'When it was paid online.'),
      col('razorpay_payment_id', 'Razorpay payment ID', 'The payment in Razorpay, for an online payment.'),
      col('completed_at', 'Completed', 'When the garage finished.'),
      col('cancelled_at', 'Cancelled', 'When it was cancelled.'),
      col('cancelled_by', 'Cancelled by', 'user (the customer), vendor (the garage) or admin (the Detlio team).'),
      col('cancellation_reason', 'Cancel reason', 'Why.', 'text'),
      col('no_show', 'No-show', 'customer or garage: who did not turn up, when the team marked one.'),
      col('rescheduled_from', 'Moved from booking', 'The booking this one replaced, after a reschedule.'),
      col('free_redo', 'Free redo', 'Yes for a Detlio Guarantee redo.'),
      col('test', 'Test', 'Yes when the team marked it a test booking.')
    ),
  },
  {
    key: 'booking_items',
    file: 'booking-items.csv',
    group: 'bookings',
    about: 'One row per service in a booking, with the name, price and category it was booked at.',
    columns: withGarage(
      col('booking_id', 'Booking ID', 'The booking, in bookings.csv.'),
      col('reference', 'Reference', 'The booking’s reference.'),
      col('service_id', 'Service ID', 'The service, in services.csv.'),
      col('name', 'Service', 'Its name when it was booked.'),
      col('category', 'Category', 'Its category when it was booked (commission is charged at this).'),
      col('amount', 'Price (₹)', 'Its price in this booking.'),
      col('duration_mins', 'Minutes', 'Its minutes in this booking.'),
      col('add_on', 'Add-on', 'Yes for an add-on.')
    ),
  },
  {
    key: 'reviews',
    file: 'reviews.csv',
    group: 'reviews',
    about: 'One row per review, including hidden ones.',
    columns: withGarage(
      col('review_id', 'Review ID', 'The review’s Detlio ID.'),
      col('booking_id', 'Booking ID', 'The booking it is about, in bookings.csv.'),
      col('reference', 'Reference', 'That booking’s reference.'),
      col('rating', 'Stars', '1 to 5.'),
      col('tags', 'Tags', 'The quick tags the customer picked.'),
      col('comment', 'Comment', 'What the customer wrote.', 'text'),
      col('customer_name', 'Customer', 'Who wrote it.', 'text'),
      col('reply', 'Garage reply', 'The garage’s answer.', 'text'),
      col('replied_at', 'Replied', 'When the garage answered.'),
      col('hidden_at', 'Hidden', 'When the team hid it from the garage page.'),
      col('hidden_reason', 'Hidden because', 'Why it was hidden.', 'text'),
      col('created_at', 'Written', 'When it was written.')
    ),
  },
  {
    key: 'payouts',
    file: 'payouts.csv',
    group: 'payouts',
    about: 'One row per payment Detlio made to a garage. Each booking it paid for is in payout-lines.csv.',
    columns: withGarage(
      col('payout_id', 'Payout ID', 'The payout’s Detlio ID.'),
      col('amount', 'Amount (₹)', 'What was paid.'),
      col('method', 'Method', 'How it was paid.'),
      col('reference', 'Bank reference', 'The bank or UPI reference of the transfer.'),
      col('paid_at', 'Paid', 'When it was paid.'),
      col('covers_from', 'Covers from', 'The first booking time it covers.'),
      col('covers_up_to', 'Covers up to', 'The last booking time it covers.'),
      col('bookings', 'Bookings', 'How many bookings it paid for.'),
      col('note', 'Note', 'The team’s note.', 'text'),
      col('recorded_by', 'Recorded by', 'Who recorded it.'),
      col('created_at', 'Recorded', 'When it was recorded.')
    ),
  },
  {
    key: 'payout_lines',
    file: 'payout-lines.csv',
    group: 'payouts',
    about: 'One row per booking inside a payout: how its amount was worked out.',
    columns: withGarage(
      col('payout_id', 'Payout ID', 'The payout, in payouts.csv.'),
      col('booking_id', 'Booking ID', 'The booking, in bookings.csv.'),
      col('reference', 'Reference', 'The booking’s reference.'),
      col('kind', 'Kind', 'job (done), customer_no_show (paid though the customer did not come) or none.'),
      col('payable_from', 'Payable from', 'When the garage could be paid for it.'),
      col('price', 'Price (₹)', 'The full price.'),
      col('detlio_promo', 'Detlio promo (₹)', 'Money off that Detlio paid for.'),
      col('garage_promo', 'Garage promo (₹)', 'Money off that the garage gave.'),
      col('refunds', 'Refunds (₹)', 'Money given back to the customer.'),
      col('commission', 'Commission (₹)', "Detlio's commission."),
      col('free_position', 'Free booking no.', 'Its place in the garage’s first 25 free bookings, if it was one.'),
      col('garage_share', 'Garage share (₹)', 'What the garage earned.'),
      col('held_by_garage', 'Held by garage (₹)', 'Cash the garage already took from the customer.'),
      col('amount', 'Paid (₹)', 'What Detlio paid for it.')
    ),
  },
  {
    key: 'garage_book_customers',
    file: 'garage-book-customers.csv',
    group: 'garage_book',
    about: "Garage Book: one row per customer a garage keeps in its own book (not Detlio's customers).",
    columns: withGarage(
      col('customer_id', 'Customer ID', 'The customer’s ID in the Garage Book.'),
      col('name', 'Name', 'The customer’s name.', 'text'),
      col('phone', 'Phone', 'The customer’s phone number.', 'phone'),
      col('cars', 'Cars', 'Their cars: number plate, make and model.'),
      col('owes', 'Owes (₹)', 'Money still owed to the garage (Pay later jobs less what was paid back).'),
      col('note', 'Note', "The garage's note on them.", 'text'),
      col('source_note', 'Came from', 'How they were added (for example, an import).', 'text'),
      col('added_at', 'Added', 'When the garage added them.'),
      col('deleted_at', 'Deleted', 'When the garage removed them.')
    ),
  },
  {
    key: 'garage_book_bills',
    file: 'garage-book-bills.csv',
    group: 'garage_book',
    about: 'Garage Book: one row per walk-in job the garage wrote down, with what it charged. Detlio bookings are in bookings.csv.',
    columns: withGarage(
      col('job_id', 'Job ID', 'The job’s ID in the Garage Book.'),
      col('bill_number', 'Bill no.', "The garage's own bill number, once a bill was made."),
      col('date', 'For', 'When the job was booked for.'),
      col('done_at', 'Done', 'When it was finished.'),
      col('status', 'Status', 'booked, in_progress, done or cancelled.'),
      col('customer_id', 'Customer ID', 'The customer, in garage-book-customers.csv.'),
      col('customer_name', 'Customer', 'The customer’s name.', 'text'),
      col('customer_phone', 'Customer phone', 'The customer’s phone number.', 'phone'),
      col('car_plate', 'Number plate', 'The car’s number plate.'),
      col('items', 'Items', 'What was done: name × how many @ price.', 'text'),
      col('total', 'Total (₹)', 'The bill’s total.'),
      col('payment_method', 'Payment', 'upi, cash or later (Pay later).'),
      col('origin', 'Came in by', 'walk_in, link (its own booking page) or import.'),
      col('created_at', 'Written down', 'When the garage added it.')
    ),
  },
  {
    key: 'garage_book_expenses',
    file: 'garage-book-expenses.csv',
    group: 'garage_book',
    about: 'Garage Book: one row per expense the garage wrote down.',
    columns: withGarage(
      col('expense_id', 'Expense ID', 'The expense’s ID in the Garage Book.'),
      col('spent_on', 'Day', 'The day the money was spent.'),
      col('category', 'Kind', 'salary, advance, rent, supplies, power_water or other.'),
      col('amount', 'Amount (₹)', 'How much.'),
      col('method', 'Paid by', 'cash, upi or bank.'),
      col('team_member', 'Team member', 'Who a salary or advance went to.', 'text'),
      col('every_month', 'Every month', 'Yes for an expense that repeats each month.'),
      col('note', 'Note', "The garage's note.", 'text'),
      col('created_at', 'Written down', 'When the garage added it.'),
      col('deleted_at', 'Deleted', 'When the garage removed it.')
    ),
  },
  {
    key: 'garage_book_stock',
    file: 'garage-book-stock.csv',
    group: 'garage_book',
    about: 'Garage Book: one row per thing the garage keeps in stock.',
    columns: withGarage(
      col('item_id', 'Item ID', 'The item’s ID in the Garage Book.'),
      col('name', 'Item', 'What it is.'),
      col('unit', 'Unit', 'ml, l, g, kg or pcs.'),
      col('level', 'In stock', 'How much is left, in its unit.'),
      col('low_at', 'Low at', 'The level that counts as running low.'),
      col('pack_size', 'Pack size', 'How much one pack holds.'),
      col('pack_price', 'Pack price (₹)', 'What one pack costs.'),
      col('supplier_name', 'Supplier', 'Who the garage buys it from.', 'text'),
      col('supplier_phone', 'Supplier phone', "The supplier's phone number.", 'phone'),
      col('added_at', 'Added', 'When the garage added it.'),
      col('deleted_at', 'Deleted', 'When the garage removed it.')
    ),
  },
  {
    key: 'documents',
    file: 'documents.csv',
    group: 'documents',
    about: 'One row per garage document (ID, bank proof and the rest). The files are private: open them from the link, signed in to Detlio admin.',
    columns: withGarage(
      col('document_id', 'Document ID', 'The document’s Detlio ID.'),
      col('type', 'Document', 'What it is.'),
      col('status', 'Status', 'pending (not checked yet), approved or rejected.'),
      col('version', 'Version', 'How many times it was sent.'),
      col('files', 'Files', 'The sides sent (front, back or single) and their file types.'),
      col('expires_on', 'Expires', 'The day it runs out, if it does.'),
      col('uploaded_by', 'Sent by', 'Who sent it.'),
      col('submitted_at', 'Sent', 'When it was sent.'),
      col('reviewed_by', 'Checked by', 'Who on the team checked it.'),
      col('reviewed_at', 'Checked', 'When it was checked.'),
      col('rejection_reason', 'Rejected because', 'Why it was rejected.', 'text'),
      col('link', 'Link', 'Where to open it in Detlio admin.')
    ),
  },
] as const satisfies readonly BackupTable[]

export type BackupTableKey = (typeof BACKUP_TABLES)[number]['key']

export const BACKUP_TABLE_KEYS = BACKUP_TABLES.map((table) => table.key) as BackupTableKey[]

export function backupTable(key: string): BackupTable | null {
  return BACKUP_TABLES.find((table) => table.key === key) ?? null
}

// ─── Masking ──────────────────────────────────────────────────────────────

const DOTS = '•••••'

/**
 * "98•••••210": the first two and last three digits, five dots between, for
 * a phone (+91 and spaces dropped; its last ten digits) or a bank account
 * number. The dots never say how long the number is. Anything with fewer
 * than eight digits is all dots: there is too little to keep any.
 */
export function maskDigits(value: string, kind: 'phone' | 'account' = 'account'): string {
  let digits = value.replace(/\D/g, '')
  if (kind === 'phone' && digits.length > 10) digits = digits.slice(-10)
  if (digits.length < 8) return DOTS
  return `${digits.slice(0, 2)}${DOTS}${digits.slice(-3)}`
}

/** "ra•••••@okaxis": the name part of a UPI ID hidden (it is often a phone number). */
export function maskUpi(value: string): string {
  const at = value.lastIndexOf('@')
  if (at < 0) return maskDigits(value, 'phone')
  const name = value.slice(0, at)
  return `${name.slice(0, Math.min(2, Math.max(0, name.length - 3)))}${DOTS}${value.slice(at)}`
}

/**
 * Free text with the numbers in it masked: every mobile number however it is
 * written ("98400 12345", "+91-98400-12345"), by the off-app flags' own
 * finder, which never hides a date or a price; then any unbroken run of nine
 * or more digits left, which is how an account number is written.
 */
export function maskNumbersInText(text: string): string {
  return maskPhones(text).replace(/\d{9,}/g, (run) => maskDigits(run))
}

export type BackupCell = string | number | null

/** One value as a cell: text, a number, Yes/No, or empty. */
function cellOf(value: unknown): BackupCell {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => String(item)).join('; ')
  return String(value)
}

function masked(cell: BackupCell, mask: BackupMask | undefined, full: boolean): BackupCell {
  if (full || mask === undefined || cell === null || cell === '') return cell
  const text = String(cell)
  if (mask === 'phone' || mask === 'account') return maskDigits(text, mask)
  if (mask === 'upi') return maskUpi(text)
  return maskNumbersInText(text)
}

/**
 * The repository's rows (keyed by column) as the cells the API sends, in the
 * sheet's column order, masked unless `full`. A column the row lacks is
 * empty, so nothing the sheet doesn't name can ride along.
 */
export function backupRows(
  table: Pick<BackupTable, 'columns'>,
  rows: ReadonlyArray<Record<string, unknown>>,
  full: boolean
): BackupCell[][] {
  return rows.map((row) => table.columns.map((column) => masked(cellOf(row[column.key]), column.mask, full)))
}

/** A page's cursor: the id after which the next page starts, or null at the end. */
export function nextCursor(rows: ReadonlyArray<{ cursor_id: string }>, limit: number): string | null {
  return rows.length > limit ? rows[limit - 1].cursor_id : null
}

// ─── The audit row ─────────────────────────────────────────────────────────

export interface BackupAudit {
  id: string
  actorSub: string
  actorName: string
  full: boolean
  createdAt: Date
}

/**
 * Whether a page may be read under this backup's audit row: the same admin
 * who started it, within BACKUP_WINDOW_MS, and full numbers only when the
 * row says they were asked for. Every download is recorded before any of
 * its rows are read; a page with no row of its own is refused.
 */
export function backupPageRefusal(
  audit: BackupAudit | null,
  input: { sub: string; full: boolean; now: Date }
): 'BACKUP_NOT_STARTED' | 'BACKUP_EXPIRED' | 'BACKUP_NOT_FULL' | null {
  if (!audit || audit.actorSub !== input.sub) return 'BACKUP_NOT_STARTED'
  if (input.now.getTime() - audit.createdAt.getTime() > BACKUP_WINDOW_MS) return 'BACKUP_EXPIRED'
  if (input.full && !audit.full) return 'BACKUP_NOT_FULL'
  return null
}
