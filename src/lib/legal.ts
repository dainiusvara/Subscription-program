/**
 * Who runs Drip, for the privacy policy and terms. The name and email come from
 * the host's env settings rather than the code, so personal details stay out of
 * the (public) repository. The pages are built on the server, so these are read
 * at build time: redeploy after changing them.
 */
export const LEGAL = {
  owner: process.env.LEGAL_OWNER_NAME?.trim() ?? "",
  email: process.env.LEGAL_CONTACT_EMAIL?.trim() ?? "",
  /** Change this whenever the privacy policy or terms change. */
  updated: "25 September 2026",
};
