/// <reference path="../pb_data/types.d.ts" />

// Members' answer page: {DIANE_PUBLIC_URL}/r/{token} serves the same static
// page whatever the token (pb_public/answer/index.html); its script reads
// the token in the URL and calls /api/diane/r/{token} (web-answers.pb.js).
// Its CSS, script and fonts are served by PocketBase's static file handler
// from pb_public/ (/answer/...). pb_public/ sits next to pb_hooks/.

routerAdd("GET", "/r/{token}", (e) => {
  return e.fileFS($os.dirFS(`${__hooks}/../pb_public/answer`), "index.html");
});

// Same page with a trailing slash, added by some SMS and e-mail apps
// (`{$}`: /r/{token}/ only, not /r/{token}/anything).
routerAdd("GET", "/r/{token}/{$}", (e) => {
  return e.fileFS($os.dirFS(`${__hooks}/../pb_public/answer`), "index.html");
});

// Security headers of the page, its files and the answer routes. The page
// loads nothing from another site (Content-Security-Policy), sends no
// Referer (the URL carries the token), cannot be framed, and answers are
// never cached (they are personal to the token's holder).
routerUse(
  new Middleware(
    (e) => {
      const path = e.request?.url?.path ?? "";
      const isApi = path.startsWith("/api/diane/r/");
      const isPage = path.startsWith("/r/") || path.startsWith("/answer/");
      if (!isApi && !isPage) return e.next();

      const headers = e.response.header();
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      if (isApi) {
        headers.set("Cache-Control", "no-store");
      } else {
        headers.set(
          "Content-Security-Policy",
          [
            "default-src 'self'",
            "base-uri 'none'",
            "object-src 'none'",
            "form-action 'none'",
            "frame-ancestors 'none'",
          ].join("; "),
        );
        headers.set("X-Frame-Options", "DENY");
        // Revalidated on every visit (Last-Modified): a new version of the
        // page reaches members at once. It holds no personal data.
        headers.set("Cache-Control", "no-cache");
      }
      return e.next();
    },
    0,
    "dianeAnswerPageHeaders",
  ),
);
