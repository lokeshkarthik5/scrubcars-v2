/**
 * How far a garage travels for doorstep jobs when it has not said.
 *
 * The travel radius is optional (owner decision, 2026-10-16). Before this, a
 * doorstep garage with no radius and no drawn area covered 0 km: it was
 * missing from the Doorstep tab for every customer who shared a location, and
 * every doorstep booking to it was refused, while its owner believed it took
 * them. Such a garage now covers this distance from its pin instead.
 *
 * One constant for every place coverage is decided: the Doorstep list
 * (vendorsRepository.listPublicVendorPage) and the check made when a doorstep
 * booking is written (bookingsRepository.isWithinDoorstepRadius). If the two
 * disagreed, a garage could be listed for an address and then refuse to book
 * it. The garage portal and the admin form show it as the radius placeholder,
 * through the twin in packages/core/src/doorstep.ts (doorstep.parity.test.ts).
 */
export const DEFAULT_DOORSTEP_RADIUS_KM = 10
