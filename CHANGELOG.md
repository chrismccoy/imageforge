# Changelog

# Updates - November 17, 2026

## 🔧 Improvements
- **Startup checks your database**: If your database is missing a column this version needs, the app refuses to start and lists the exact SQL to run. Before, it started anyway and saving images failed.

# Updates - November 13, 2026

## ✨ New Features
- **Remove your stored OpenAI key**: Settings has a "Remove the stored key" option. ImageForge then uses `OPENAI_API_KEY` from the environment again, if one is set.

## 🔧 Improvements
- **Flexible proxy setup**: `TRUST_PROXY` now accepts a number of proxy hops or a list of proxy addresses, as well as `true`.
- **Better proxy warnings**: Setup problems are now checked on every request, not only the first. A new warning appears when proxy headers arrive while `TRUST_PROXY` is off, because then everyone looks like localhost.
- **Public images get their own rate limit**: Images and downloads on shared pages are limited separately, at 10× the share-page limit. Galleries with many images no longer use up the page limit.
- **Clearer OpenAI errors**: When OpenAI is rate-limiting you get a "try again" response (503). Other OpenAI failures return 502 instead of looking like your mistake.
- **Cleaner shutdown**: Stopping the server closes idle connections. If it hangs, it exits after 10 seconds.
- **Gallery setting no longer blocks startup**: Setting `PUBLIC_GALLERY` without `PUBLIC_SHARE` now logs a warning and the app still starts.
- **JSON errors for API calls**: Background requests now get errors as JSON, not an HTML page.

## 🔒 Security
- **Forged IP addresses blocked**: `TRUST_PROXY=true` used to trust every proxy hop. A visitor could fake `X-Forwarded-For` to get past the IP allow list or reset rate limits. Now only the proxy hops you configure are trusted.
- **CSRF check on all file-upload forms**: Before, every multipart form skipped the token check. Now only the five upload endpoints skip it, and they check the token after reading the upload. Any other multipart post without a token is rejected.
- **No internal error details**: Unexpected errors now show a generic message instead of the raw error text.
- **Download and archive limits**: Images fetched from OpenAI are capped at 64 MB and 60 seconds. Backup archives are capped at 100,000 entries and 64 GB, and free disk space is checked before unpacking.
- **Backups no longer hold login sessions**: The database copy is securely wiped and compacted, so no trace of the API key or sessions is left in it. Restoring a backup logs you out.
- **Stricter input handling**: IDs must be plain whole numbers. "false", "0", "off" and "no" now really mean off. A truncated encryption tag on the stored API key is rejected.
- **IPv6 allow list matching**: Allow list entries now match an IPv6 address however it is written.
- **Trusted share-link host**: Share links use a forwarded host name only when it comes from a trusted proxy.
- **Bad file names refused**: Empty, `.` and `..` file names are refused.

## ⚠️ Breaking Changes
- With `TRUST_PROXY=true`, exactly one proxy is trusted. If you run behind two or more proxies, set the hop count or the proxy addresses.
- Secure cookies and HSTS are now turned on only by `NODE_ENV=production`; `TRUST_PROXY` no longer turns them on. If you relied on `TRUST_PROXY` for HTTPS cookies, set `NODE_ENV=production`.
- `scripts/restore.js` now refuses to run while the app is running. Scripted (non-interactive) restores must pass `--yes`.

## 🐛 Fixes
- **Safer saving**: Saving never overwrites an existing file. If a save fails, the partial file is removed, the storage quota is freed, and the unsaved image stays available to try again.
- **Correct image types**: JPEG and WebP images are saved and previewed with the right file type, not labeled as PNG.
- **Empty Trash**: Only the images you saw listed are deleted. Anything trashed after the page loaded is kept.
- **Model prices**: A price with only input or only output filled in is now refused. Before, it was saved as $0 and the model looked free.
- **Crop**: Handles stop at the image edge, and aspect-locked resizing keeps the opposite corner in place.
- **Edit**: A mask made only of eraser strokes, or one fully erased, no longer counts as a mask. Flattening no longer stretches an original with a different shape.
- **Prompt sorting**: Ratings and pins now keep the list in the right order, and a double click on a star sends one request.
- **No double saves**: Generate, Again and the image tiles are locked while a save is in progress.
- **Batch keeps its prompt**: A batch is saved against the prompt chosen when it was generated, even if you change the menu afterwards.
- **Backup names**: Backups made in the same second get a `-2`, `-3` suffix instead of overwriting each other.
- **Copy link**: The button now says "Copied" or "Copy failed" instead of failing silently.
- **Favourites paging**: Unstarring the last favourite on page 2 or later reloads that page instead of showing an empty one.
- **Collections**: A slow reply no longer overwrites a newer change on the same card.
- **Prompt pop-up**: A slow save updates the image it was made for, not whichever one is open now.
- **Empty upload**: Pressing Upload with no file chosen now says "Choose at least one image to upload."
- **Settings form**: A refused form keeps what you typed (except the API key), with a clear message for a half-filled price.
- **Blank names**: An empty category or collection name now says "Give it a name." instead of "taken".
- **Tiny costs**: Costs too small to show print as "<$0.001" instead of $0.00.
- **Dashboard counts**: Image counts leave out trashed images.
- **Trash dates**: Trashing an image that is already in the trash no longer resets its deleted date, and the heading says "1 image" for one.
- **Right and middle clicks**: Crop and Edit now ignore them instead of moving the box or painting.
- **Bulk add to collection**: Only saved, untrashed images are added.
- **Unknown category**: A prompt saved with a category that no longer exists becomes uncategorised.
- **Restore script**: Works on a fresh install with no database, refuses a backup with folders inside its uploads, and cleans up after a refusal.
- **Backup errors**: A missing backup file is no longer reported as "not a zip".
- **Compare slider**: Screen readers now hear "How much of the original to show".

# Updates - November 6, 2026

## ✨ New Features
- **Compare includes a second image from your model**: Compare runs every model once, plus a second image from the model you selected. The four tiles are labeled #1 and #2 for that model. It still counts as four generations.

## 🔧 Improvements
- **Newer Sunburst and Flare models**: The image models are now 2, 2.6 Sunburst and 2.6 Flare. 2.6 Sunburst is the default for generating and editing.
- **Tidier model picker**: The model buttons sit three across on Generate, Edit and Upload.

## ⚠️ Breaking Changes
- gpt-image-1.5 is removed, and 2.5 Sunburst and 2.5 Flare are replaced by their 2.6 versions. On startup, saved settings and prompt defaults move to the matching current model automatically. Existing images keep the model that made them.
- The 2.6 models start with no prices. Enter them in Settings, or their spend shows as uncosted.

# Updates - October 6, 2026

## ✨ New Features
- **Model buttons on Edit and Upload**: Pick the model with one tap on the Edit and Upload screens, the same as on Generate.

## 🔧 Improvements
- **Out-of-credits message**: When your OpenAI account is out of credits, you are told to add funds. A separate message tells you when OpenAI is only limiting requests.
- **One clear reason when Compare fails**: If every model fails for the same reason, that reason is shown, not a generic failure.
- **Edit defaults to 2.5 Sunburst**: The Edit page now preselects gpt-image-2.5-sunburst. Before, it preselected the model that made the image. You can still pick another.
- **Full-width model buttons**: Model and size controls on Upload and Edit are stacked full width, so the buttons are not squeezed.

# Updates - September 2026

## ✨ New Features
- **Edit an image's prompt**: In the Generations "Show Prompt" pop-up you can edit and save the prompt for that one image. The saved prompt it came from is not changed.
- **Generation time**: Every generated or edited image records how long OpenAI took. It is shown on the image's card and on public share pages. Older images, uploads and crops show none.
- **More models**: Added gpt-image-2.5 Sunburst and gpt-image-2.5 Flare alongside 1.5 and 2.
- **Health check**: `GET /health` returns `{ok:true}` for uptime monitors. It needs no login and is not limited by the IP allow list.

## 🔧 Improvements
- **Model buttons**: The model drop-down on Generate and Settings is now a row of buttons.
- **Compare every model**: Compare now sends the prompt to all four models, so it costs four images instead of two.

## ⚠️ Breaking Changes
- Generation times need a new database column. Before upgrading an existing library, run `node scripts/schema-gaps.js` and apply the `ALTER TABLE` it prints, or saving images will fail.

# Updates - August 29, 2026 (Initial beta)

## ✨ New Features
- **Generate images from prompts**: Choose the size (or auto), the model (gpt-image-1.5 or 2) and how many images (1, 2 or 4). Preview images before saving, download them, and regenerate with the same settings. Prompts can include fill-in-the-blank variables.
- **Compare**: Send one prompt to both models side by side, compare a batch of four, or check an edit against its original with a before/after slider.
- **Edit and crop**: Inpaint with brush, box, oval and eraser tools, with zoom and touch support. Crop freely or to a fixed aspect ratio, at no API cost. Each edit and crop is saved as a new image.
- **Uploads**: Drag and drop up to 10 PNG, JPEG or WebP images at once. They share a prompt, model and size.
- **Prompt library**: Organize prompts into categories, with ratings, pins, search, notes, per-prompt default size and model, and import/export.
- **Collections, favourites and sharing**: Group images into collections. Share single images, collections, favourites or a public gallery with preview cards and zip downloads. Each public feature has its own on/off switch.
- **Dashboard, trash and backups**: See spend per model, storage use, top prompts and a 30-day chart. Deleted images go to a trash you can restore from. Create backups from a page, and back up or restore from the command line.
- **White-label branding**: Set the app's name, icon and "Made with" footer credit.
- **Storage quota**: Saving stops when images reach the limit, 500 MB by default.

## 🔒 Security
- **Single admin login**: Credentials come from the environment and are compared in constant time. Sessions last 7 days, are regenerated at login, and use HTTP-only cookies.
- **IP allow list**: Only localhost and the addresses in `ALLOWED_IPS` can reach the app. Public pages are open only when their sharing switch is on.
- **CSRF protection**: Each session has its own token, and every form post and API change must send it.
- **Encrypted API key**: The OpenAI key stored in Settings is encrypted with AES-256-GCM using `SETTINGS_ENC_KEY`.
- **Strict browser headers**: A tight Content-Security-Policy, no framing, no MIME sniffing, and HSTS in production.
- **Rate limits** on login, generation, saving and sharing. Uploaded files are checked by their contents, not their names.
- **Safe production startup**: The app will not start in production without a real session secret, an admin password and a valid encryption key.
