# Mnemonic Lab

Static web app for generating BIP39 mnemonic phrases in the browser.

## Notes

- Uses the official BIP39 English wordlist from `bitcoin/bips`.
- Generates entropy with `crypto.getRandomValues`.
- Computes checksum with `crypto.subtle.digest("SHA-256", ...)`.
- Renders a QR code for the generated phrase entirely on the client side.
- Can derive a mnemonic from manually entered `entropy_hex` values of valid BIP39 sizes.
- Can optionally query `mempool.space` to show balances for the derived BIP84 addresses.
- Can be installed from a supported browser as a lightweight PWA when served over HTTP(S).
- Does not send the generated phrase to a backend.
- Balance lookups are not offline-safe and disclose the derived addresses to the selected explorer API.
- Public deployment is for testing and education only, not recommended for protecting real funds.
- Uses a retro monospace text UI inspired by terminal-style layouts.

## Local preview

Because the app fetches `english.txt`, serve it over HTTP instead of opening `index.html` directly.

```bash
cd /home/saton/bitcoin-seed-web
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy to Vercel

```bash
cd /home/saton/bitcoin-seed-web
vercel
vercel --prod
```
