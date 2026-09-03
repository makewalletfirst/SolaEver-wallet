# SolaEver Wallet

Official Android wallet for the **SolaEver** blockchain — an Agave (Solana v4.0) compatible
network running at `https://rpc-sola.ever-chain.xyz`.

[![Block Explorer](https://img.shields.io/badge/Explorer-solaever.ever--chain.xyz-blue)](https://solaever.ever-chain.xyz)
[![Repo](https://img.shields.io/badge/Repo-makewalletfirst%2FSolaEver--wallet-181717?logo=github)](https://github.com/makewalletfirst/SolaEver-wallet)

---

## Features

| | |
|---|---|
| **Wallet** | BIP39 12-word mnemonic create / restore. Keys encrypted on-device with `expo-secure-store` |
| **Balances** | Real-time SLE + SPL token balances via SolaEver RPC (`processed` commitment for sub-second feedback) |
| **Metaplex metadata** | Paste any mint address — wallet auto-fetches the on-chain Metaplex metadata PDA, deserializes the borsh-encoded `name` / `symbol` / `uri`, then fetches the off-chain `image` URL. Falls back to a `symbol`-based placeholder if no image |
| **24h cache** | `AsyncStorage` key `tokenmeta_v1_<mint>` — avoids re-fetching unchanged metadata |
| **Token transfer** | SPL transfer with on-the-fly account creation, manual signature polling (no library auto-confirm), pre-flight balance check, node-level retry (`maxRetries: 5`) |
| **Network hardening** | `network_security_config.xml` for Android cleartext policy; `User-Agent` header on every RPC POST; custom polyfills for `Uint8Array.prototype.slice` and `Buffer` |

---

## Tech Stack

- **Framework** — React Native + Expo SDK 54
- **Language** — TypeScript
- **Solana SDK** — `@solana/web3.js` ^1.98, `@solana/spl-token` ^0.4
- **Crypto polyfills** — `bip39`, `ed25519-hd-key`, `@craftzdog/react-native-buffer`, `react-native-randombytes`
- **Navigation** — `@react-navigation/native` + Stack
- **Storage** — `@react-native-async-storage/async-storage`, `expo-secure-store`
- **New Architecture** — Fabric / TurboModule enabled (RN 0.81)

---

## Build

### A. CI build (recommended) — GitHub Actions

`.github/workflows/release.yml` triggers on push to `main` or `260531`, or via
manual `workflow_dispatch`. Output: signed release APK uploaded as a workflow
artifact (90-day retention) plus an auto-generated GitHub Release on manual dispatch.

```
Actions tab → "Android Release APK" → Run workflow
```

The workflow installs **NDK 27.0.12077973** via `sdkmanager` (the correct path
that avoids the local-install pitfall described below).

### B. Local build

Prerequisites:
- Node 20
- Java 21 (Gradle 8.14.x requires JDK 17+; JDK 21 is what we test against)
- Android SDK with `cmdline-tools`, `platform-tools`, `build-tools;35.0.0`
- **NDK 27.0.12077973** — RN 0.81 + Expo 54 + New Architecture pin this version

```bash
# 1. install deps
npm install --force --no-audit --no-fund

# 2. regenerate native android/ (the dir is .gitignored; Expo recreates it)
npx expo prebuild --platform android --clean --no-install

# 3. release APK build
cd android
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT=/path/to/android-sdk
unset ANDROID_NDK_HOME ANDROID_NDK_ROOT   # avoid stale NDK path
chmod +x gradlew
./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs=-Xmx4g

# 4. APK output
ls app/build/outputs/apk/release/*.apk
```

The release APK is signed with `android/app/debug.keystore` (the default
`signingConfig signingConfigs.debug` in `app/build.gradle`). For production
distribution, generate a real keystore and override `signingConfig`.

### ⚠ Local NDK pitfall (learned the hard way over 7 failed builds)

If you install NDK 27.x by manually unpacking a `.zip` instead of via
`sdkmanager`, the `build/` subdirectory is sometimes missing (interrupted
download). Symptoms:

```
CMake Error: Could not find toolchain file:
  /path/to/ndk/27.0.12077973/build/cmake/android.toolchain.cmake
CMake Error: CMAKE_C_COMPILER not set, after EnableLanguage
```

The `clang`, `sysroot`, and `toolchains` directories are present and functional —
only `build/` is missing. Two fixes:

1. **Reinstall via sdkmanager** (clean):
   ```bash
   sdkmanager --install "ndk;27.0.12077973"
   ```
2. **Copy `build/` from a working NDK** (we used NDK 26.1.10909125):
   ```bash
   cp -r /path/to/ndk/26.1.10909125/build /path/to/ndk/27.0.12077973/build
   ```
   The NDK 26 `build/cmake/android.toolchain.cmake` is forward-compatible with
   NDK 27's `clang` and `sysroot`. Verify with:
   ```bash
   ls $ANDROID_HOME/ndk/27.0.12077973/build/cmake/android.toolchain.cmake
   ```

After fixing, clear all `.cxx` caches before retrying:
```bash
find node_modules -name .cxx -type d -exec rm -rf {} +
rm -rf android/app/.cxx android/app/build
```

---

## How Metaplex metadata fetch works

`src/lib/token.ts → fetchTokenMetadata(mintAddress)`:

```
mint address
   │
   ▼  PublicKey.findProgramAddressSync(
   │    [b"metadata", METAPLEX_PROGRAM_ID, mint],
   │    METAPLEX_PROGRAM_ID
   │  )
   │  // METAPLEX_PROGRAM_ID = metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
   │
   ▼  connection.getAccountInfo(metadataPDA)
   │
   ▼  parse borsh:
   │     skip 1 + 32 + 32 bytes (key + update_authority + mint)
   │     readStr() × 3 → name, symbol, uri
   │
   ▼  if uri starts with http(s):// or ipfs://
   │    fetch(uri).json() → metadata.image (URL)
   │    ipfs:// → https://ipfs.io/ipfs/<cid>  (gateway)
   │
   ▼  cache to AsyncStorage["tokenmeta_v1_<mint>"] (24h TTL)
   │
   ▼  return { name, symbol, imageUri, uri }
```

`HomeScreen` calls this in `loadSavedTokens()` (initial load + after Add Token
Mint) and renders the icon as a 36×36 rounded image. Falls back to a styled
3-char symbol placeholder when no `imageUri`.

---

## Repository layout (relevant files)

```
src/
├── lib/
│   ├── token.ts          ← getTokenInfo + fetchTokenMetadata (Metaplex PDA fetch)
│   ├── transfer.ts       ← SLE transfer with manual signature polling
│   ├── wallet.ts         ← BIP39 → ed25519 keypair derivation
│   ├── keystore.ts       ← expo-secure-store wrapper
│   └── shim.js           ← polyfills (Uint8Array.slice, Buffer)
├── screens/
│   ├── WelcomeScreen.tsx, CreateWallet.tsx, RestoreWallet.tsx
│   ├── HomeScreen.tsx    ← balance + token list with metadata icons
│   ├── SendScreen.tsx, TxHistoryScreen.tsx

tokens/                   ← hosted token icons + metadata.json
└── <symbol>/icon.png + metadata.json    (served via raw.githubusercontent.com)

.github/workflows/
├── release.yml           ← Android Release APK (260531 + main + manual)
├── build.yml             ← Android Debug APK (legacy, main only)
└── ci.yml                ← TypeScript validation
```

---

## Releasing a new SPL token that auto-displays in this wallet

Use the companion script — `spltoken.py` — for one-shot mint:

```bash
python3 spltoken.py \
  --name LNsola --symbol lnSOLA \
  --image /path/to/icon.png \
  --decimals 9 --supply 1000000 \
  --send-to <recipient-pubkey> --send-amount 100000
```

It performs 5 steps automatically:
1. Decide payer keypair (`--keypair <path>` for fixed authority, otherwise new random)
2. Commit + push the icon and `metadata.json` to this repo's `tokens/<symbol>/`
3. Create mint, mint to supply
4. Register Metaplex metadata pointing at the hosted URL
5. (Optional) Transfer to a recipient

Once executed, the new mint's name / symbol / icon load automatically in this
wallet — no app update needed.

---

## License

MIT. See [`LICENSE`](LICENSE).

Built for the **SolaEver Network**.
