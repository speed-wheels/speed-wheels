# Speed Wheels website (speedwheels.in)

Online store built with Eleventy and hosted free on Cloudflare Pages. Cart and checkout run in the
browser; payments go through Razorpay; orders are saved in a free Cloudflare D1 database.

## Edit products, collections and shipping
- Open `https://speedwheels.in/admin/` and sign in with a GitHub access token (works on a phone).
- **Products:** pick a collection, price, photo, stock. **Collections:** add new ones any time.
- **Settings → Shipping settings:** flat rate, free-shipping amount, delivery times, state zones.
- Photos: any JPG/PNG; the build makes fast WebP versions automatically.

## Orders
- `https://speedwheels.in/admin/orders/` (password = `ADMIN_PASSWORD` secret).
- Mark packed / shipped (courier + tracking number) / delivered; the customer can be emailed.
- Customers track at `https://speedwheels.in/track/` with order ID + phone or email.

## Cloudflare Pages settings
- Build command `npm run build` · Output `_site` · Variable `NODE_VERSION` = `22`
- D1 binding: variable name `DB` → database `speed-wheels-orders` (table is created automatically)
- Secrets (Settings → Variables and Secrets, type "Secret"):
  - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (Razorpay → Account & Settings → API Keys)
  - `ADMIN_PASSWORD` (8+ characters, for the orders screen)
  - `STORE_EMAIL` = `speedwheelsstore@gmail.com`
  - Optional `RESEND_API_KEY` (customer emails; verify speedwheels.in in Resend), `EMAIL_FROM`
  - Optional `RAZORPAY_WEBHOOK_SECRET` (webhook URL `https://speedwheels.in/api/razorpay-webhook`,
    events `payment.captured`, `order.paid`)

## Run locally
    npm install
    npm run build
    npx wrangler pages dev _site --d1 DB=local-orders   # with a .dev.vars file of test secrets
