# Mnemonic Lab

Static web app for generating BIP39 mnemonic phrases in the browser.

## Notes

- Uses the official BIP39 English wordlist from `bitcoin/bips`.
- Generates entropy with `crypto.getRandomValues`.
- Computes checksum with `crypto.subtle.digest("SHA-256", ...)`.
- Does not send the generated phrase to a backend.
- Public deployment is for testing and education only, not recommended for protecting real funds.

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
