const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "dev.workers.rumah_sablon11.shirogane_production_suite.twa",
      sha256_cert_fingerprints: [
        "AE:EB:CD:73:0D:18:AC:C0:3E:78:33:37:48:6E:F5:9C:AE:03:83:66:15:76:B6:DC:53:67:BB:F4:95:74:00:0F"
      ]
    }
  }
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/.well-known/assetlinks.json") {
      return new Response(JSON.stringify(ASSET_LINKS), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
