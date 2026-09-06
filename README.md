# Image Forge

Generate images from prompts, right from a simple admin dashboard. Type what you want, pick a size, and get an image back from OpenAI. Save the prompts you like and reuse them later.

## Features

### Generating images

- Type a few words and get an image back
- Pick the image size you want
- Let the service pick a size for you with the auto option
- Choose which image model to use, 1.5 or 2
- Choose the model on the Generate page, not just in Settings
- See the generated image first, before you save it
- See how long your prompt is as you type it, under the box
- The count follows a prompt filled in from a saved one, and its variables, not only what you type
- Generate one, two or four images at a time from the same prompt
- Put the same prompt to both models at once and see the two results side by side, each labelled with which model it came from
- Comparing is always one picture from each, so it counts as two generations
- The two run at the same time rather than one after the other, so comparing takes as long as generating once
- If one model fails you still get the other, and the page says which one did not generate
- Compare a batch of four side by side and keep any of them, or none
- Watch a spinner while your image is being generated
- Until you have set your OpenAI key the Generate button is switched off, with a notice telling you why
- An image you have not saved yet is held for ten minutes then it expires
- Download an image to your device before you save it
- Regenerate from any saved image, with its prompt, size and model already filled in
- Generate again in one click once a result comes back

### Editing images

- Edit a saved image: brush over part of it, say what should be there, and get a new image back
- Crop any saved image: drag a box over it, freehand or locked to one of the shapes the app generates at
- A crop costs no credits, because nothing is sent for generation, and it is saved as a new image keeping the one you cropped
- The crop shows the size it will be in the picture's own pixels while you drag
- Everywhere you did not brush stays exactly as it was, and the new version appears right where the old one was, not below it
- Undo your last brush stroke, or wipe the whole painted area and begin again
- Make the brush wider or narrower, to mark small or large areas
- Mark an area with a box or an oval instead of the brush, for anything with straight edges or a clean curve
- Rub out part of what you painted with the eraser, without undoing a whole stroke
- Each tool says what it does as you pick it, the area you brushed, the box you drew, the oval you drew
- Invert what you marked, to change everything except the part you painted
- Inverting is only a way of reading what you painted, so it can be switched on and off and your painting stays
- Zoom in to 100, 200 or 400 per cent while you brush, to reach small details
- The brush stays the size you see on screen, so at 400 per cent it paints four times finer on the picture itself
- Scroll the box to move around a picture you have zoomed into, and zooming keeps whatever you were looking at in the middle
- On a touch screen one finger paints and two fingers move the picture
- See how long your description is as you type it
- Compare a fresh edit against the image you started from, with a slider for before and after, if you decide whether to keep it
- Come back to the brush after an edit and your painting is still there, ready for a second try
- If the service hands back an edit with gaps, the missing parts are filled in from the picture you started with before it is saved
- Every edit is saved as a new image, and it keeps a note of which image it came from
- Click an edit and it is put on top of the original, and drag a slider between them for before and after
- The slider is the comparison: the original on its left, the edit on its right
- The image you started from is kept, so a bad edit doesn't affect the original

### Uploading your own images

- Upload an image from your own device, not only ones you generate here
- Upload up to ten at once, and give them all the same prompt, model and size at the same time
- Drag images straight onto the upload page, with a preview of each one before it is saved
- A dropped file that is not a PNG, JPEG or WebP, or is too big, is refused before it is sent, and named so you know which
- One bad file in a batch does not fail the whole upload: the page says what saved and what did not
- Assign an upload to a saved prompt, or type the prompt it came from
- Say what size an uploaded image is
- Say which model made it, picked from the same list the Generate page uses
- A file over 10 MB is refused, with a notice
- Uploads are checked by what is really inside the file, so only PNG, JPEG and WebP go through

### Saved prompts

- Save prompts you like and reuse them later
- Pick a saved prompt from a drop down list, or type your own when generating images
- Edit a saved prompt any time on its own page
- See how long a prompt is while you write it
- Copy a prompt as the starting point for a new one, and nothing is saved until you say so
- Editing a prompt shows what it has made: its rating, the newest images generated from it, and whether it is pinned, all changeable from that page
- A copy of a prompt is named after the one it came from, with its own rating left blank
- Save a size and a model along with a prompt, and both are filled in for you when you choose it
- Write a prompt with variables in it, like {city} or [mood], and fill them in when you generate
- Both kinds of variable types work, so a prompt you copied from somewhere else needs no rewriting
- A blank you did not fill stays visible in the prompt, so you can see what is missing
- See your prompts in a table with the title and the full prompt text
- A long prompt is trimmed to three lines in the table, with a Show Prompt button for the whole thing
- See how many images you have generated from each prompt
- Click a prompt's image count to see everything made from it
- Read your prompts a page at a time, as many per page as you set in Settings
- Put your prompts into categories, and view them one category at a time
- Delete a category and its prompts dont get deleted, just assigned uncategorised
- Rate a prompt one to five stars straight from the list, and sort by rating
- Pin the prompts you use most, and they sit at the top of the list however it is sorted
- Pinned prompts come first in the drop down on the Generate page, so the one you always use is the one you see first
- A pinned prompt jumps to the top the moment you pin it, with no reloading, and keeps your search and your place in the list
- Unpin one and it drops back to where it belongs in the order, rather than to the end
- A pin stays with this install: it is not carried with an export
- Keep a note on a prompt, and find it again by searching what you wrote
- Select several prompts to delete them together, and the images they made are kept
- Delete a prompt and the images you generated from that prompt won't be deleted

### Moving prompts between installs

- Import and export are on their own page, from the sidebar or the prompts page
- Export every saved prompt to a single file, with its category and rating
- Import that file back on another install, or after a reinstall
- Importing never overwrites a prompt you already have: any with the same name are ignored, and you are notified which are skipped
- A file holding more than a thousand prompts is refused, and so is one that is simply too big, before anything is stored
- If one prompt in the file is broken it is skipped and counted, and the rest still get imported

### Browsing your images

- Browse all your generated images in one place
- Switch between a grid of pictures and a list that shows each prompt beside its image
- The layout(list,grid) you pick is saved into localstorage, and stays as you search and page through
- See your generated images a page at a time, with Previous and Next
- Set how many images a page shows in Settings, or leave it to the value you set up at install
- Search your images by keywords, and your prompts by their title or their text
- The search stays as you page through the results, and Clear resets the results
- See the prompt an image was made from, in a pop-up on its card
- Copy an image's prompt to your clipboard with one click
- Edit an image's prompt in that same pop-up, without leaving the page you are on
- An edited prompt is what the list searches next, and the card updates without a reload
- Download any saved image with one click
- Download all your generated images at once, as a zip file
- Press Select to reveal the checkboxes, so a list you are reading is not covered in controls
- Select several images to delete them together, or download just those as a zip
- Deleting a batch always asks first and names exactly what it is about to remove
- Delete a generated image or prompt with a quick confirm, right where you are

### Favourites

- Star any generated image and filter the list down to just your favourites
- The star saves straight away without reloading the page, and works alongside a search
- Favourites and Top rated have their own sidebar entries
- Share every image you have starred on one link, whether or not each one is shared on its own
- Removing a favourite takes an image off the favourites page at once, and turning the link off kills every share for the favourites page
- The favourites link is shown on the public gallery, only shown to you when you are signed in
- Whoever has the favourites link can view all the favourites, and download them as a zip, as favourites-2026-08-23.zip

### Collections

- Group images into collections and set a title
- Click a collection's image count to see what is in it
- Add an image to a collection from its card, or choose several and add them all at once
- Filter the generations page to one collection, or to the images in none
- Share a whole collection on one link, under a public title, so the name you use for it stays private
- A shared collection shows its images, and each opens a page with the prompt and a download
- Download a whole shared collection as a zip
- Un-share a collection and every link under it stops working at once
- Wherever you add images to a collection, the shared ones are marked, so you know when adding one puts it in public view
- A collection you have not shared stays private, and is never named on the gallery or on a shared link

### Sharing single images

- Send any saved image to someone with no account here, by copying a link to it or the address of the picture itself
- A share link never gives away where the file sits on your machine; it uses an address of random characters instead
- Share links are short, about a dozen characters
- There are two kinds of link: /s/k3f9Qa72vX opens a page about the image, and /i/k3f9Qa72vX.png is just the image
- The image link is the one to paste into a chat or a forum post, and it ends in the picture's own extension, because some chat rooms and forums only show a link that looks like a picture
- Image links given out without the extension on the end, still work
- Turn on Descriptive links in Settings and the address picks up the start of the prompt, like /s/a-blue-sky-k3f9Qa72vX and /i/a-blue-sky-k3f9Qa72vX.png
- Open one image inside a shared collection or the favourites link and you can step through the rest with Previous and Next, without going back to the grid each time
- Links you have already given out keep working
- Remove a share with Unshare, and every copy of that link stops working
- A shared link opens a page with the image, the prompt, the model, the size and the date
- Paste a page link into a chat room or a forum and it shows a preview card with the picture and the prompt, rather than a bare address
- Whoever you send it to can copy that prompt or download the image, without an account
- The shared page also shows what the image cost to make, so the person you sent it to can see what one like it would cost them
- The cost only appears for a model you have priced
- Every image in your list shows whether it is currently shared

### The public gallery

- The gallery is one page holding every image you have shared, so you can give out a link
- It opens in its own tab, since it is the page your visitors see and not part of the admin
- It has Previous and Next as well, and shows the same number per page as everywhere else
- You can look at it yourself from the sidebar at any time, even when it is switched off to everyone else
- Turn public sharing on and off in Settings, so your links only work while you want them to
- The gallery has a switch of its own in Settings, on or off whenever you like
- Shared collections and the favourites link have their own switches too, so you can publish one kind of link and keep the others private
- The gallery only works with public sharing on as well, and Settings tells you so instead of leaving you with a page of dead links
- Any switch you never touch keeps the choice you made at install, so a new copy starts out the way you set it up
- Shared pages and the gallery have noindex to avoid being crawled
- Preview cards work on shared pages: noindex tells not to crawl them
- Every public page: a shared image, a shared collection, the favourites link, the gallery, the login page shares the app's own design: the same fonts, colours and icons, just without the sidebar and the rest of the admin's design
- Whoever has a share link sees no navigation they cannot follow: there is no dashboard link, no sidebar, nothing pointing at a page they dont have access too. Signed in, that same page adds a dashboard link

### The screenshots

- `/screenshots` shows all items of the app: screenshots of every page of the application, dashboard and public pages
- Click any image to open it full size, then scroll through the rest with the arrow keys or the strip of thumbnails at the bottom
- Screenshots URL needs no login

### Dashboard

- The sidebar groups its links: Main, Library, Public, System, etc and each one that has a count is shown in the sidebar
- The dashboard has recent images, spend, storage, favourites and your most used prompts
- It also lists your largest collections, marking the ones that are shared publicly
- A chart on the dashboard shows the last thirty days of output, a bar per day including the low activity days, showing the day and its count on hover
- The old /stats url still works and takes you to the dashboard
- Every icon on the page is using Font Awesome

### What it costs

- Every image records what OpenAI charged for it, counted in tokens, shown on its card and on the shared page
- Images you uploaded have no token count
- Enter what you pay per million tokens in Settings, and every image will show what it cost you
- The dashboard keeps the running totals: images made this week, the cost of each model, and the space you are using
- Lifetime spend is everything you have paid since the day you started.
- A cost is only shown when you have entered a price for that model and the image has a token count.

### Storage

- You can see how much of your 500 MB has gone at any time, and saving stops once you reach it instead of using up space
- When there is no room left the app says so, and asks you to clear some space
- If the trash is filled it up, a message tells you how many images are waiting in there
- Everything stays on your own machine in one small file; the only thing that leaves it is the call to OpenAI

### Trash

- Deleting moves an image to the trash instead of deleting it
- Restore from the trash and it comes back exactly as it was, including its share link
- A trashed image stops being reachable at once: its link stops working and it leaves any shared collection
- Nothing is gone for good until you empty the trash yourself
- The trash page shows how much space its images are taking up, so you know what emptying it would give you back

### Backup and restore

- Back up the whole install to one zip with `node scripts/backup.js`: every image, all your prompts in a form you can read, and the record that ties them together
- Make a backup from the Backup page: create it, download it, and delete old ones you no longer need
- A backup holds no settings file and no OpenAI key, so it is safe to keep on any device
- Restore a backup with `node scripts/restore.js <file>.zip`, make sure to run with the app stopped
- Restoring is done with the CLI tool. It clears deletes everything you have and restores the backup that was created
- Restore checks the file first and doesnt allow anything it cannot use, whether it is the wrong sort of file, one from a newer version, or one with something missing, before it changes a thing
- Before starting the app on an older library, run `node scripts/schema-gaps.js` to see if anything is missing from it

### Settings and your OpenAI key

- Set your model, default size, and OpenAI key on the Settings page
- Change your OpenAI key any time, right in Settings
- The Settings page shows only the last few characters of your key, never the whole thing
- Your saved key is stored encrypted, so a stolen copy of your library is no use to anyone
- Prefer not to type the key into a browser at all? Set it once in the settings file instead
- Point the app at another image service that works the same way, by naming it in the settings file
- Settings shows how full your storage is
- It also shows who you are signed in as, how many addresses are on your IP allow list, and whether the app is trusting a proxy

### Authenticating

- Log in with a username and password you set
- Locked behind a login, only you can get in
- Log out any time from the sidebar
- Your login lasts a week, then asks again
- A wrong username and a wrong password give dont reveal any information
- Other machines on your network are blocked unless you have white listed them
- Blocked visitors get an access denied page and never see the login
- After too many wrong passwords, login is blocked for a few minutes

### Limits you set

- Every limit is yours to change at install: how much disk it may use, how big an upload, how big an edit, how big an import
- Only so many images can be generated in a minute
- A separate limit on how many you can save in a minute
- A public link can only be opened so many times a minute
- Anyone stopped by a limit gets an error message

### Keeping it safe

- On a live setup the app will not start until you have set the password and its two secret keys, so it never runs unprotected
- If it is set up wrong for the proxy web server, the log will notify you as the blocking of other addresses is required a valid setup
- Run it over a secure connection and your login is only ever sent over that connection
- Set it up behind a web server such as nginx and it still knows where a visitor really came from
