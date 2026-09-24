/**
 * Digital Asset Links for the Android app (a Trusted Web Activity made with
 * PWABuilder). Served at /.well-known/assetlinks.json via a rewrite. Returns
 * 404 until ANDROID_PACKAGE_NAME and ANDROID_CERT_FINGERPRINTS are set.
 */
export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (!packageName || fingerprints.length === 0) return new Response("Not found", { status: 404 });
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
