# Speed Wheels website (speedwheels.in)

Static store built with Eleventy. No server, no monthly cost. Hosted on Cloudflare Pages.

## Edit products
- **Easiest:** open `https://speedwheels.in/admin/`, sign in with GitHub, edit or add products (works on a phone).
- **Or ask Claude:** each product is one file in `src/products/` (e.g. `tiered-stand-16.md`).
- Shop details (email, Instagram, shipping fee) live in `src/_data/site.json`.
- Product photos go in `src/images/products/`. Any JPG/PNG is fine; the build makes fast WebP versions automatically.

## Run locally
    npm install
    npm start        # preview at http://localhost:8080
    npm run build    # output in _site/

## Cloudflare Pages settings
- Framework preset: None · Build command: `npm run build` · Output directory: `_site`
- Environment variable: `NODE_VERSION` = `22`

## Admin sign-in
The admin uses Sveltia CMS (a faster drop-in for Decap CMS, same config). Set `repo:` in
`src/admin/config.yml` to your GitHub repo, then sign in with a GitHub personal access token
(fine-grained, access to this one repo, "Contents: read and write").

## Before going live
- Replace placeholders in `src/_data/site.json` (email, Instagram, city, business name).
- Replace the sample products and photos.
- Paste Razorpay Payment Links into each product's `razorpayLink` to show a "Pay online" button.
