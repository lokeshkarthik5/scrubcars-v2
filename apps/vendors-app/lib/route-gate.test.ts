/// <reference types="bun" />
import { expect, test } from 'bun:test';

import { gateRedirect, onboardingHold } from './route-gate';

const owner = { signedIn: true, hasGarage: true, isAdmin: true };
const operator = { signedIn: true, hasGarage: true, isAdmin: false };
const newNumber = { signedIn: true, hasGarage: false, isAdmin: true };
const out = { signedIn: false, hasGarage: false, isAdmin: true };

test('signed out reaches only the sign-in screens', () => {
  expect(gateRedirect('/', out)).toBe('/login');
  expect(gateRedirect('/login', out)).toBeNull();
  expect(gateRedirect('/verify-otp', out)).toBeNull();
  expect(gateRedirect('/home', out)).toBe('/login');
  expect(gateRedirect('/bookings/abc', out)).toBe('/login');
});

test('signed in leaves the sign-in screens for Home, or for setting up a garage', () => {
  expect(gateRedirect('/login', owner)).toBe('/home');
  expect(gateRedirect('/', owner)).toBe('/home');
  expect(gateRedirect('/verify-otp', newNumber)).toBe('/onboarding/step-1');
  expect(gateRedirect('/home', newNumber)).toBe('/onboarding/step-1');
});

test('onboarding: only the steps before a garage exists send its owner home', () => {
  expect(gateRedirect('/onboarding/step-1', owner)).toBe('/home');
  expect(gateRedirect('/onboarding/step-2', owner)).toBe('/home');
  expect(gateRedirect('/onboarding/step-3', owner)).toBeNull();
  expect(gateRedirect('/onboarding/step-1', newNumber)).toBeNull();
});

test('onboarding: the wizard can hold the gate while it walks from step 2 to step 3', () => {
  expect(gateRedirect('/onboarding/step-2', { ...owner, onboardingHold: true })).toBeNull();
  expect(gateRedirect('/onboarding/step-1', { ...owner, onboardingHold: true })).toBeNull();
  onboardingHold.set(true);
  expect(gateRedirect('/onboarding/step-2', owner)).toBeNull();
  onboardingHold.set(false);
  expect(gateRedirect('/onboarding/step-2', owner)).toBe('/home');
  // Holding changes nothing outside the wizard.
  onboardingHold.set(true);
  expect(gateRedirect('/login', owner)).toBe('/home');
  expect(gateRedirect('/home', newNumber)).toBe('/onboarding/step-1');
  onboardingHold.set(false);
});

test("an operator is kept off the owner's screens, not off the jobs", () => {
  for (const path of ['/earnings', '/services', '/settings', '/settings/documents', '/settings/members', '/agreement', '/guarantee', '/photos']) {
    expect(gateRedirect(path, operator)).toBe('/home');
    expect(gateRedirect(path, owner)).toBeNull();
  }
  for (const path of ['/home', '/bookings', '/bookings/abc', '/account', '/requests', '/reviews', '/settings/notifications']) {
    expect(gateRedirect(path, operator)).toBeNull();
  }
});
