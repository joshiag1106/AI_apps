# Code signing and notarization

Unsigned builds are blocked by macOS Gatekeeper and warned about by Windows
SmartScreen. There is no configuration that avoids this — it is what those
systems exist to do. The only fix is a certificate issued by Apple or a
commercial CA, and both cost money.

The build already works without signing, and will keep working: forks and pull
requests cannot read repository secrets, so they must be able to produce
unsigned artifacts. Signing turns on by itself once the secrets exist.

## macOS

### What you need

| Item | Cost | Where |
| --- | --- | --- |
| Apple Developer Program membership | $99/year | <https://developer.apple.com/programs/> |
| "Developer ID Application" certificate | included | Apple Developer → Certificates |
| App-specific password | free | <https://appleid.apple.com> → Sign-In and Security |
| Team ID | free | Apple Developer → Membership |

A **Developer ID Application** certificate is the right kind. "Apple
Development" and "Apple Distribution" certificates do not work for software
distributed outside the App Store.

### Exporting the certificate

Once the certificate is installed in Keychain Access, select it, right-click →
**Export**, and save as `.p12` with a password. Then base64-encode it, because
GitHub secrets hold text:

```bash
base64 -i Certificates.p12 | pbcopy
```

### Repository secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret**. Add them yourself — never paste a certificate or password into an
issue, a pull request, or a chat window.

| Secret | Value |
| --- | --- |
| `MACOS_CERTIFICATE` | the base64 string from the command above |
| `MACOS_CERTIFICATE_PASSWORD` | the password chosen when exporting the `.p12` |
| `APPLE_ID` | the Apple ID email on the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password, format `abcd-efgh-ijkl-mnop` |
| `APPLE_TEAM_ID` | the 10-character Team ID, e.g. `A1B2C3D4E5` |

`MACOS_CERTIFICATE` is the switch. When it is present the workflow signs and
notarizes; when it is absent the build runs exactly as it does today.

### What the workflow then does

1. Signs the app with the Developer ID certificate, using the hardened runtime
   and the entitlements in `build/entitlements.mac.plist` — both already
   configured, and both prerequisites for notarization.
2. Uploads the app to Apple for notarization and staples the resulting ticket.
   This adds roughly 5–15 minutes to a macOS build.
3. Verifies the result with `codesign --verify` and `spctl --assess`. The
   second is the same check Gatekeeper performs, so a passing build is proof
   that Gatekeeper will accept the download — not an assumption that it will.

The verification step matters more than it looks. A misconfigured certificate
makes electron-builder log a warning and produce an *unsigned* app, which
otherwise looks like a successful build until a user is blocked by it.

## Windows

SmartScreen is a separate purchase and a separate problem.

- An **OV** code-signing certificate costs roughly $200–400/year. It stops the
  "unknown publisher" wording, but SmartScreen still warns until the signed
  binary builds reputation across enough installs.
- An **EV** certificate costs more and usually ships on a hardware token, which
  is awkward in CI, but carries reputation immediately.

Nothing here configures Windows signing. When a certificate exists,
electron-builder reads `CSC_LINK` and `CSC_KEY_PASSWORD` the same way, and the
same secret-presence pattern used for macOS applies.

## Until then

Unsigned builds are not damaged, and the release notes explain the one-time
steps to open them:

- **macOS 15 and later** — open the app, let it be blocked, then
  **System Settings → Privacy & Security** → **Open Anyway**.
- **macOS 14 and earlier** — right-click the app, choose **Open**, confirm.
- **Windows** — **More info**, then **Run anyway**.

Do not disable Gatekeeper (`spctl --master-disable`) to work around this. It
switches off that protection for every application on the machine, which is a
far larger concession than one warning dialog.
