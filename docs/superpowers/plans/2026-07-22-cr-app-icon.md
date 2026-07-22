# CR macOS App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the packaged CR macOS application's default icon with the approved white rounded-square, red-outline, blue `CR` icon and deliver a verified `CR.app`.

**Architecture:** Keep one reviewed 1024 × 1024 PNG source and one compiled `.icns` resource in `resources/`. The existing packaging script copies the compiled resource into the bundle before signing, while the bundle test verifies both the file and the matching `Info.plist` declaration.

**Tech Stack:** Built-in image generation, macOS `sips` and `iconutil`, Bash, Apple property lists, ad-hoc `codesign`.

---

## File map

- Create `resources/CR-icon-1024.png`: reviewed, reproducible 1024 × 1024 source artwork.
- Create `resources/CR.icns`: compiled macOS icon resource used by the app bundle.
- Modify `resources/Info.plist.in`: declare `CFBundleIconFile` as `CR`.
- Modify `scripts/build-macos-app.sh`: copy the `.icns` resource into `Contents/Resources` before signing.
- Modify `scripts/test-macos-bundle.sh`: fail when the icon file or property-list declaration is absent.
- Rebuild `outputs/CR.app`: worktree-local packaged application used for verification.
- Deliver `outputs/CR.app`: user-facing application bundle.

### Task 1: Create and validate the icon assets

**Files:**
- Create: `resources/CR-icon-1024.png`
- Create: `resources/CR.icns`
- Reference: user-provided CR screenshot.

- [ ] **Step 1: Generate the approved artwork from the screenshot reference**

Use the built-in image generation tool with the screenshot attached and this exact direction:

```text
Create a clean 1024 by 1024 macOS application icon based on the attached screenshot's CR mark. Use a transparent square canvas with a centered white macOS-style rounded-square tile. Center one horizontal red rectangular outline on the tile and place exactly the two uppercase letters CR inside it in bold deep blue sans-serif type. Preserve generous safe margins. Remove the Chinese text, divider line, and all other UI. No extra letters, symbols, shadows, gradients, textures, watermark, or decoration. The letters must read exactly CR and remain legible at 16 pixels.
```

Save the selected result as `resources/CR-icon-1024.png`. Confirm with:

```bash
sips -g pixelWidth -g pixelHeight resources/CR-icon-1024.png
```

Expected: `pixelWidth: 1024` and `pixelHeight: 1024`.

- [ ] **Step 2: Inspect the source artwork at full size**

Open `resources/CR-icon-1024.png` with the local image viewer and verify all of the following:

```text
CR is spelled exactly with two uppercase letters.
The red rectangular outline is complete and centered.
The white rounded-square tile has clear safe margins.
No Chinese text, divider, watermark, or generated artifact is present.
```

If the generated letters are malformed, retain the generated tile as the visual base and replace only the red outline and `CR` lettering with deterministic local vector/text rendering. Do not change the approved composition.

- [ ] **Step 3: Generate the standard iconset and `.icns`**

Run:

```bash
iconset_dir="$(mktemp -d "${TMPDIR:-/tmp}/cr-iconset.XXXXXX")/CR.iconset"
mkdir -p "$iconset_dir"
sips -z 16 16 resources/CR-icon-1024.png --out "$iconset_dir/icon_16x16.png"
sips -z 32 32 resources/CR-icon-1024.png --out "$iconset_dir/icon_16x16@2x.png"
sips -z 32 32 resources/CR-icon-1024.png --out "$iconset_dir/icon_32x32.png"
sips -z 64 64 resources/CR-icon-1024.png --out "$iconset_dir/icon_32x32@2x.png"
sips -z 128 128 resources/CR-icon-1024.png --out "$iconset_dir/icon_128x128.png"
sips -z 256 256 resources/CR-icon-1024.png --out "$iconset_dir/icon_128x128@2x.png"
sips -z 256 256 resources/CR-icon-1024.png --out "$iconset_dir/icon_256x256.png"
sips -z 512 512 resources/CR-icon-1024.png --out "$iconset_dir/icon_256x256@2x.png"
sips -z 512 512 resources/CR-icon-1024.png --out "$iconset_dir/icon_512x512.png"
cp resources/CR-icon-1024.png "$iconset_dir/icon_512x512@2x.png"
iconutil -c icns "$iconset_dir" -o resources/CR.icns
```

Expected: all `sips` commands complete without errors and `resources/CR.icns` is created.

- [ ] **Step 4: Validate the compiled icon and small sizes**

Run:

```bash
test -s resources/CR.icns
check_iconset="$(dirname "$iconset_dir")/CR-check.iconset"
iconutil -c iconset resources/CR.icns -o "$check_iconset"
ls -1 "$check_iconset" | sort
```

Expected: ten standard PNG entries from `icon_16x16.png` through `icon_512x512@2x.png`.

Inspect `icon_16x16.png`, `icon_32x32.png`, `icon_128x128.png`, and `icon_512x512@2x.png`. Expected: red frame and `CR` remain recognizable with no edge clipping.

- [ ] **Step 5: Commit the reviewed assets**

```bash
git add resources/CR-icon-1024.png resources/CR.icns
git commit -m "assets: add CR macOS app icon"
```

Expected: a commit containing only the PNG and `.icns` assets.

### Task 2: Add a failing bundle contract, then package the icon

**Files:**
- Modify: `scripts/test-macos-bundle.sh:3-10`
- Modify: `resources/Info.plist.in:8-10`
- Modify: `scripts/build-macos-app.sh:12-26`

- [ ] **Step 1: Add icon assertions to the bundle test**

Insert the following after the existing `pyright` resource check and before `plutil -lint`:

```bash
test -s "$app_path/Contents/Resources/CR.icns"
icon_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$app_path/Contents/Info.plist")"
test "$icon_name" = "CR"
```

- [ ] **Step 2: Run the bundle test to verify the old package fails**

Run:

```bash
bash scripts/test-macos-bundle.sh outputs/CR.app
```

Expected: non-zero exit at the new `CR.icns` assertion because the previous app bundle has no packaged icon.

- [ ] **Step 3: Declare the icon in the application property list**

Add the property immediately after `CFBundlePackageType`:

```xml
  <key>CFBundleIconFile</key><string>CR</string>
```

Validate the template:

```bash
plutil -lint resources/Info.plist.in
```

Expected: `resources/Info.plist.in: OK`.

- [ ] **Step 4: Copy the icon resource during packaging**

Add the copy immediately before copying `Info.plist`:

```bash
ditto "$repo_root/resources/CR.icns" "$contents/Resources/CR.icns"
ditto "$repo_root/resources/Info.plist.in" "$contents/Info.plist"
```

The existing `Info.plist` copy line is replaced by this two-line block, ensuring both resources are present before `xattr` cleanup and signing.

- [ ] **Step 5: Rebuild the worktree-local application bundle**

Run:

```bash
bash scripts/build-macos-app.sh
```

Expected: TypeScript/web build and arm64 Swift release build complete, `scripts/test-macos-bundle.sh` passes inside the build script, signing succeeds, and the command prints the app size.

- [ ] **Step 6: Run the bundle contract directly**

Run:

```bash
bash scripts/test-macos-bundle.sh outputs/CR.app
/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' outputs/CR.app/Contents/Info.plist
test -s outputs/CR.app/Contents/Resources/CR.icns
```

Expected: all commands exit zero and the printed value is `CR`.

- [ ] **Step 7: Commit the bundle integration**

```bash
git add resources/Info.plist.in scripts/build-macos-app.sh scripts/test-macos-bundle.sh
git commit -m "build: package CR app icon"
```

Expected: a commit containing only the property-list and packaging-test integration.

### Task 3: Run full regression and deliver the rebuilt app

**Files:**
- Verify: `outputs/CR.app`
- Deliver: `outputs/CR.app`

- [ ] **Step 1: Run the source test suite and type checks**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: every workspace test passes, type checking exits zero, and all workspace builds complete successfully.

- [ ] **Step 2: Verify the native launcher independently**

Run:

```bash
arch -arm64 swift build -c release --package-path launcher
```

Expected: `Build complete!` with a zero exit code.

- [ ] **Step 3: Exercise the packaged application**

Run:

```bash
bash scripts/test-macos-bundle.sh outputs/CR.app
bash scripts/smoke-macos-app.sh
codesign --verify --deep --strict outputs/CR.app
```

Expected: bundle checks and smoke workflow exit zero; `codesign` produces no error.

- [ ] **Step 4: Inspect the final bundle metadata and rendered icon**

Run:

```bash
plutil -p outputs/CR.app/Contents/Info.plist
final_icon_dir="$(mktemp -d "${TMPDIR:-/tmp}/cr-final-icon.XXXXXX")/CR-final.iconset"
iconutil -c iconset outputs/CR.app/Contents/Resources/CR.icns -o "$final_icon_dir"
```

Expected: `CFBundleIconFile` is `CR`. Inspect the extracted 16, 32, 128, and 1024 pixel PNGs and confirm the approved composition at each size.

- [ ] **Step 5: Copy the verified bundle to the shared output**

Run from the implementation worktree:

```bash
delivery_root="${CR_DELIVERY_ROOT:?Set CR_DELIVERY_ROOT to the target checkout}"
delivery_app="$delivery_root/outputs/CR.app"
ditto outputs/CR.app "$delivery_app"
```

Expected: the shared output contains the rebuilt app without changing its delivery path.

- [ ] **Step 6: Re-verify the shared deliverable**

Run:

```bash
delivery_root="${CR_DELIVERY_ROOT:?Set CR_DELIVERY_ROOT to the target checkout}"
delivery_app="$delivery_root/outputs/CR.app"
codesign --verify --deep --strict "$delivery_app"
test -s "$delivery_app/Contents/Resources/CR.icns"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "$delivery_app/Contents/Info.plist")" = "CR"
```

Expected: all commands exit zero.

- [ ] **Step 7: Record final repository state**

Run:

```bash
git status --short
git log -3 --oneline --decorate
```

Expected: only the pre-existing `.superpowers/` visual-companion directory may remain untracked; the latest commits include the icon assets and bundle integration.
