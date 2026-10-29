/**
 * The privacy notice's facts, in one place, so the /privacy page, the signup
 * dialog and the consent stamp written on each new account never disagree.
 *
 * Bump PRIVACY_NOTICE_VERSION whenever the notice text changes in substance:
 * every account records the version its owner agreed to.
 */
export const PRIVACY_NOTICE_VERSION = "2026-10-29";
export const PRIVACY_CONTACT_EMAIL = "admin@shareat.net";
export const BUSINESS_NAME = "SharEat";
/**
 * A card, its personal details and any points left on it are deleted this long
 * after its last activity (a visit, or any use of the card). See lib/retention.ts.
 */
export const RETENTION_YEARS_AFTER_LAST_VISIT = 2;
