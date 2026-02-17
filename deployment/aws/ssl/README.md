# TLS Certificates

Do not commit private keys or live certificates to git.

Expected runtime files for nginx:
- `cert.pem`
- `key.pem`

Place these on the target server (for example with `scp`) before starting nginx.

For local-only testing, you can generate a self-signed pair:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/CN=localhost"
```
