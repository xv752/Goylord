# Plugin Signing

Plugins can be signed with Ed25519 keys. The server verifies signatures on upload and displays trust state in the Plugin Manager. Unsigned or untrusted plugins require explicit confirmation; invalid signatures are blocked.

## Trust Levels

| Status | Behavior |
|--------|----------|
| Signed + trusted | Loads immediately. |
| Signed + untrusted | Requires confirmation. |
| Unsigned | Requires confirmation. |
| Invalid signature | Blocked. |

## Generate A Signing Key

```bash
cd Goylord-Server
bun run scripts/plugin-keygen.ts --out my-signing-key
```

This creates:

| File | Purpose |
|------|---------|
| `my-signing-key.key` | Private key. Keep it secret. |
| `my-signing-key.pub` | Public key plus fingerprint. |

## Sign A Plugin

```bash
cd Goylord-Server
bun run scripts/plugin-sign.ts --key my-signing-key.key ../plugins/sample-go/sample.zip
```

The signer injects `signature.json` into the zip.

## Trust A Key

Via `config.json`:

```json
{
  "plugins": {
    "trustedKeys": [
      "a1b2c3d4e5f6...64-char-hex-fingerprint..."
    ]
  }
}
```

Via environment variable:

```text
TRUSTED_PLUGIN_KEYS=fingerprint1,fingerprint2
```

Via API:

```bash
curl -X POST /api/plugins/trusted-keys \
  -H "Content-Type: application/json" \
  -d '{"fingerprint": "a1b2c3..."}'

curl /api/plugins/trusted-keys

curl -X DELETE /api/plugins/trusted-keys/a1b2c3...
```

You can also add trusted keys from the Plugins page.

## Build Script Integration

Set `PLUGIN_SIGN_KEY` to sign during plugin build:

```bash
PLUGIN_SIGN_KEY=path/to/my-signing-key.key ./sample-go/build.sh
```

On Windows:

```bat
set PLUGIN_SIGN_KEY=path\to\my-signing-key.key
sample-go\build.bat
```

## How Signing Works

1. The canonical content digest hashes every zip file except `signature.json`.
2. Filenames are sorted alphabetically and combined as `filename:sha256hex`.
3. The digest is signed with Ed25519.
4. `signature.json` stores the signature, public key, and algorithm.
5. Upload verification recomputes the digest and compares the signer fingerprint against trusted keys.
