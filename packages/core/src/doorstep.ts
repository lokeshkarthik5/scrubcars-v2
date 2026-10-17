/**
 * How far a garage travels for doorstep jobs when it leaves the radius empty.
 *
 * The server decides coverage with its own copy of this number
 * (apps/server/src/lib/doorstep.ts); this twin is only for saying it on the
 * radius inputs, so an owner knows what leaving the field empty means. A
 * parity test beside the server copy keeps the two equal.
 */
export const DEFAULT_DOORSTEP_RADIUS_KM = 10

/** The radius inputs' placeholder: "Default 10 km". */
export const DOORSTEP_RADIUS_PLACEHOLDER = `Default ${DEFAULT_DOORSTEP_RADIUS_KM} km`
