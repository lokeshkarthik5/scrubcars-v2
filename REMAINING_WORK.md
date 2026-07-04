# Remaining Work

## Payments

- Create Razorpay order for online bookings.
- Verify Razorpay payments after checkout.
- Add Razorpay webhook handling.
- Handle refunds for cancelled paid bookings.

## Admin

- Verify vendors by flipping `vendors.is_verified`.
- Activate or suspend vendors.
- Activate or suspend users.
- Add admin views for users, vendors, bookings, and payments.

## Frontend

- Build full vendor profile management UI.
- Build vendor services/catalog management UI.
- Build vendor photos upload, reorder, and delete UI.
- Build working hours and service areas UI.
- Add payment UI during booking.
- Add customer “my reviews” page.

## Booking Polish

- Validate doorstep bookings against vendor service areas.
- Improve cancellation and refund rules.
- Prevent duplicate concurrent bookings for the same slot more strictly.
- Show an existing review on completed booking detail.

## Storage

- Delete the GCS object when a vendor photo is deleted.
- Add upload completion confirmation before making a photo public.
