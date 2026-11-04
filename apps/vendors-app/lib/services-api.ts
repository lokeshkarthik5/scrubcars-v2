/**
 * The garage's catalogue requests. packages/core/src/api/services.ts and packages.ts
 * import nothing that is browser-only, so they come to the phone as they are:
 *
 *   getMyServices      GET    /vendors/me/services
 *   createService      POST   /vendors/me/services
 *   updateService      PATCH  /vendors/me/services/:id
 *   toggleServiceActive PATCH /vendors/me/services/:id/active (a package's too: it is a services row)
 *   deleteService      DELETE /vendors/me/services/:id
 *   getMyPackages      GET    /vendors/me/packages
 *   createPackage      POST   /vendors/me/packages
 *   updatePackage      PATCH  /vendors/me/packages/:id
 *   deletePackage      DELETE /vendors/me/packages/:id
 *
 * The photo and video requests are in ./service-media-api.
 */
export {
  createPackage,
  deletePackage,
  getMyPackages,
  updatePackage,
} from '@repo/core/api/packages';
export {
  createService,
  deleteService,
  getMyServices,
  toggleServiceActive,
  updateService,
} from '@repo/core/api/services';
export { getMediaConfig } from './service-media-api';
