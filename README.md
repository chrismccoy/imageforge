# Image Forge

This is a private web dashboard for generating images from prompts with OpenAI's image models. It is built for one owner who wants to generate, edit, organise and share images in one place, while keeping track of what each image cost. It needs your own OpenAI account and API key.

## Creating Images

- Type a prompt and get an image back.
- Choose from three image models: gpt-image-2, 2.6 Sunburst and 2.6 Flare.
- Pick a square, portrait or landscape size, or let the service choose.
- Generate one, two or four images at once from the same prompt.
- Compare the models side by side with one prompt, getting four images labelled by model, including a second one from the model you picked.
- If one model fails during a comparison you still get the others, with a note saying which one failed.
- Preview every result before deciding to save it.
- Keep only the images you like from a batch and discard the rest.
- Write reusable prompts with variables in curly or square brackets, and type the missing words into their own boxes.
- Start from a saved prompt and have its preferred size and model chosen for you.
- See a live character count as you type.
- Generate an image again from any saved image, with its prompt, size and model already filled in.
- See a clear notice, and a disabled Generate button, until an API key is set.
- Get a plain message when your OpenAI account is out of credits or is busy.
- See how long each image took to generate.

## Sharing and Public Pages

- Share a single image with a link to its own page or straight to the image, off by default.
- Share a whole collection under a public title, so its private name is never shown, off by default.
- Share all of your favourites through one link, off by default.
- Show every shared image in a public gallery, off by default.
- Let visitors page through a shared set, step to the previous or next image, and download one image or a zip of the whole set.
- Show the prompt, model, size, date, cost and generation time on shared pages, with buttons to copy the prompt or the link.
- Show an image preview when a shared link is pasted into chat apps and social sites.
- Turn on custom links that put part of the prompt in the address, off by default.
- Stop sharing at any time, which breaks every copy of that link.
- Ask search engines not to list any shared page.
- Remove trashed images from shared pages and bring them back if they are restored.
- Show a public page of screenshots of every screen in the app, with no sign in needed.
- Open any screenshot full size and move through the rest with the arrow keys or a strip of thumbnails.

## Prompt Library

- Save prompts with a name, category, preferred size, preferred model and private notes.
- Rate prompts from one to five stars, and click the current rating again to clear it.
- Pin prompts to the top of the list and of the Generate menu.
- Search prompts by name, text or notes, and filter by category or by uncategorised.
- Sort prompts by name or by rating, with a Top rated shortcut in the menu.
- See how many images each prompt has made and jump straight to them.
- Duplicate a prompt as the starting point for a new one.
- See up to four images made from a prompt on its edit page.
- Organise prompts into categories that you can add, rename and delete, and deleting a category keeps its prompts.
- Delete several prompts at once while keeping the images made from them.
- Export your prompts to a file and import them elsewhere, with prompts whose names already exist skipped and listed.

## Editing and Cropping

- Paint over part of an image and describe what should be there instead.
- Mark the area with a brush, box, oval or eraser, and change the brush size.
- Invert the marked area, undo the last stroke, or clear everything.
- Zoom in up to four times and move around the image while marking.
- Paint with one finger and move around with two on touch screens.
- Compare an edit with the original using a sliding before and after view.
- Go back to the brush to try again without losing your marks.
- Crop freely or to a fixed shape, with a live readout of the size in pixels and no charge from OpenAI.
- Save every edit and crop as a new image, keeping the original.
- See which image an edit came from and open the before and after comparison later.

## Your Image Library

- Browse saved images in a grid or a list, and the app remembers your choice.
- Search images by their prompt from any page.
- Filter by collection, by images in no collection, by favourites, or by the prompt that made them.
- See the model, size, usage, cost and generation time on each image.
- Read, copy or correct the prompt of one image in a pop up without changing the saved prompt it came from.
- Select several images to download as a zip, add to a collection, or delete.
- Download one image, or every image as a zip.
- Upload up to ten PNG, JPEG or WebP images at once by dragging them in, and record a prompt, model and size for them.
- See which uploaded images were saved and why any were refused.
- Get a helpful message and a next step whenever a page has nothing to show.

## Trash, Storage and Backups

- Send deleted images to a trash where you can restore them or delete them for good.
- Empty the whole trash in one step after confirming.
- Stop new saves when a storage limit is reached, 500 MB unless changed, with a hint to empty the trash.
- Confirm on a separate page, listing every item, before deleting several things at once.
- Create, download and delete full backups of your images and data from the Backup page.
- Leave your OpenAI key and sign in sessions out of every backup.
- Restore a backup from the command line, which saves a safety copy of your current data first.
- Check the database when the app starts and list exactly what to fix if anything is missing.

## Settings and Administration

- Choose the default model, the default size and how many items appear on each page.
- Save your OpenAI API key, shown masked, or remove it.
- Turn each public sharing feature on or off.
- Enter OpenAI's prices for each model so the app can work out what images cost.
- Rename the app, choose its icon with a live preview, and show or hide the "Made with" credit on public pages.
- See who is signed in, how many addresses are allowed in, and whether the app is behind a proxy.
- Point the app at another service that works like OpenAI's.
- Check that the app is running from an uptime monitor with a simple health address.

## Security and Privacy

- Sign in as the single administrator, and stay signed in for up to seven days, even across restarts.
- Allow in only your own device and the addresses you list.
- Slow down repeated sign in attempts and bursts of requests.
- Protect every form against requests forged by other websites.
- Store your OpenAI key encrypted.
- Check uploaded files by their contents, not their names.
- Refuse to start in production without a password, a session secret and an encryption key.

## Dashboard and Spending

- See your total images, how many were made this week, your favourites and your storage use at a glance.
- Track estimated spend for each model, based on the prices you enter.
- View a bar chart of images made each day over the last 30 days, with daily cost.
- See your recent images, top rated and most used prompts, and largest collections.
- Click a recent image to generate it again.
- See counts for each section and how much storage is left in the sidebar.

## Collections and Favourites

- Group images into named collections that you can rename or delete without losing any images.
- Add an image to a collection from its card, or remove it with one click.
- Star images as favourites and view them on their own page.
- See how many images are in each collection and open them as a filtered list.
- Spot which collections are shared, marked in every collection picker.

## Phones and Accessibility

- Use the app on phones and tablets, with a scrolling menu in place of the sidebar.
- Hear labels for buttons, sliders and switches, and status messages, with a screen reader.
- Close pop ups with the Escape key or by clicking outside them.

## Setup

1. Install the dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. In `.env`, set `SESSION_SECRET`, `ADMIN_PASSWORD` and `SETTINGS_ENC_KEY`. Generate each secret with `openssl rand -hex 32`.
4. Add other machines to `ALLOWED_IPS`. Left blank, only this machine can reach the app.
5. Start the app with `npm start` and open `http://localhost:3000` (or the `PORT` you set).
6. Sign in and save your OpenAI API key on the Settings page, or set `OPENAI_API_KEY` in `.env`.

For a live setup, set `NODE_ENV=production` and serve the app over HTTPS. Behind a web server such as nginx, also set `TRUST_PROXY`. The stylesheet is already built; run `npm run build` only if you change the styles.

When upgrading an older library, the app checks the database on startup. If columns are missing, it refuses to start and prints the SQL to run. `node scripts/schema-gaps.js` lists the same thing without starting the app.

## Configuration

Every option is described in `.env.example`.

### Settings and your OpenAI key

- Set your model, default size, and OpenAI key on the Settings page
- Change your OpenAI key any time, right in Settings
- The Settings page shows only the last few characters of your key, never the whole thing
- Your saved key is stored encrypted, so a stolen copy of your library is no use to anyone
- Prefer not to type the key into a browser at all? Set it once in the settings file instead
- Point the app at another image service that works the same way, by naming it in the settings file
- Settings shows how full your storage is
- It also shows who you are signed in as, how many addresses are on your IP allow list, and whether the app is trusting a proxy

### Limits you set

- Every limit is yours to change at install: how much disk it may use, how big an upload, how big an edit, how big an import
- Only so many images can be generated in a minute
- A separate limit on how many you can save in a minute
- A public link can only be opened so many times a minute
- Anyone stopped by a limit gets an error message

## Backup and restore

- Back up the whole install to one zip with `node scripts/backup.js`: every image, all your prompts in a form you can read, and the record that ties them together
- Generate a backup from the Backup page: create it, download it, and delete old ones you no longer need
- A backup holds no settings file and no OpenAI key, so it is safe to keep on any device
- Restore a backup with `node scripts/restore.js <file>.zip`, making sure the app is stopped
- Restoring is done with the CLI tool. It deletes everything you have and restores the backup that was created
- Restore checks the file first and refuses anything it cannot use, whether it is the wrong sort of file, one from a newer version, or one with something missing, before it changes a thing
- Before starting the app on an older library, run `node scripts/schema-gaps.js` to see if anything is missing from it

## Authenticating

- Log in with a username and password you set
- Locked behind a login, only you can get in
- Log out any time from the sidebar
- Your login lasts a week, then asks again
- A wrong username and a wrong password don't reveal which one was wrong
- Other machines on your network are blocked unless you have allow listed them
- Blocked visitors get an access denied page and never see the login
- After too many wrong passwords, login is blocked for a few minutes

## Security

- On a live setup the app will not start until you have set the password and its two secret keys, so it never runs unprotected
- If it is set up wrong for the proxy web server, the log warns you, because blocking other addresses depends on a valid setup
- Run it over a secure connection and your login is only ever sent over that connection
- Set it up behind a web server such as nginx and set `TRUST_PROXY` (true trusts one proxy, or give the number of proxies or their addresses), and it still knows where a visitor really came from
