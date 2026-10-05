// The freelancer and client devices use separate auth cookies, so the
// freelancer can open a client link in the same browser to test it without
// the two sessions overwriting each other.
export const CLIENT_AUTH_COOKIE = "sb-client-auth";
