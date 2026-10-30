# Changes from upstream

This project is a modified version of
**[OpenLauncher](https://github.com/Shantil-K/OpenLauncher)** by Shantil-K, which is itself based
on **QwQHome** by exkc. OpenLauncher is GPL-3.0, so this is too.

The GPL asks that modified versions carry prominent notices stating what was changed and when.
This file is that notice. **[LICENSING.md](LICENSING.md)** says which licence applies to which
file, since the parts do not all share one.

Work was done in **October 2026** against OpenLauncher 0.7.2-beta, on an LG 65UR78003LK running
webOS 10.3.2-33 (SDK 10.3, Chromium 120).

---

## Added

### TV settings pane - `src/js/tvsettings.js` (new)

The largest addition. Thirteen tabs covering **100+ of the TV's own system settings**, read and
written through `com.webos.settingsservice` by way of the Homebrew Channel's root service.

The settings were found by dumping every key the firmware keeps (838 of them, against the 36 LG's
own menu shows) and matching them against LG's own labels and descriptions from the settings app
and its locale files. The labels in both languages are therefore LG's own wording, not a
translation.

Controls are generated from `getSystemSettingDesc` rather than hard-coded, so each control reflects
what the key accepts on *this* model and stays correct across firmware updates.

Picture and sound keys are stored per picture mode × input. The pane deliberately sends **no**
`dimension` field: the service then resolves the current context itself and reports which one it
used. Passing a field it does not expect makes it answer "no result from DB".

### System panel - `src/js/syspanel.js` (new)

Opens from the status strip. Network link with latency and traffic since boot, CPU with panel
temperature, RAM and swap, storage, TV model/firmware/kernel, and a row of health indicators for
the root setup - root active, LG updates blocked, Homebrew Channel version, SSH, startup scripts
and screen-saver state.

### Translation framework - `src/js/i18n.js` (new)

English and Serbian, keyed by English source text so a missing entry falls back to readable
English. *Automatic* follows the TV's own interface language.

Also translates `data-i18n`, `data-i18n-title` and `data-i18n-placeholder` markup in `index.html`,
and hands one string to CSS as a custom property because `#folderbar::before` is drawn by
generated content, which no function can reach.

### Photo wallpapers - `src/js/photowall.js`, `src/js/photocache.js` (new)

A rotating pool of 3840 px photographs from Wikimedia Commons, kept on a USB disk. About 36 MB an
hour against roughly 2.7 GB for the streamed video the upstream uses, and it works with the
internet down.

The transition is a true cross-dissolve: the arriving picture is decoded first, then faded in *on
top of* the old one, which stays at full strength until it is hidden. Fading both at once made each
change pulse darker in the middle, because two half-transparent pictures over black composite to
about three quarters of a picture.

### Forecast and air quality - `src/js/forecast.js`, `src/js/airquality.js`, `src/js/weathericons.js` (new)

Current conditions, an hourly strip, sunrise and sunset on the home screen; a seven-day panel
behind OK. An air-quality chip appears only when the air is worth mentioning. Source is Open-Meteo,
which needs no key.

`src/js/weather.js` already existed upstream and was **modified** rather than written here.

### Input shortcuts - `src/js/quick.js` (new)

A row of the TV's inputs above the dock, showing **only the ones with something plugged in**. An
empty port is not drawn and appears by itself when a device is connected.

"Awake right now" is read from `cecPower` in the input manager's sub-list, with the HDMI 5 V line
as a fallback for devices that do not speak CEC. `hdmiSignalExist` cannot be used: it is true only
for the input the TV is actually tuned to, so on the home screen it is false for everything.

### Status strip - `src/js/status.js` (new)

Wi-Fi band and signal, network throughput, CPU load and panel temperature, RAM, storage and uptime,
refreshed once a second.

### Home replacement - `scripts/homestub.sh`, `src/access/replace/appstub/` (new)

Upstream's "Default App" method sets a Luna setting, which covers the **Home button** - `sam`
honours it. It cannot cover **power-on**, because `bootd` has `com.webos.app.home` compiled into it
and never reads that setting (confirmed with `strings /usr/sbin/bootd`).

This adds a stub: a transparent app bind-mounted over `/usr/palm/applications/com.webos.app.home`
that launches the launcher and closes itself, so anything asking for the stock home gets this one.

webOS sometimes brings the launcher up as a window with no renderer behind it: foreground, named
by `getForegroundAppInfo`, and the screen black. Every observation was after a software `reboot`;
a real cold start with the mains pulled came up drawing on its own. The script used to restart `sam` here,
which hid that by accident, since it took every app down and the set started the launcher again.
It now relaunches only this app, which does the same job without taking the rest of the set with
it, and falls back to restarting `sam` if six relaunches do not help. Picture at 47.0s against
48.2s, so this is not faster to speak of; what it stops doing is throwing every other running app
away to fix one of them.

The check counts `WebAppMgr` processes by name. `pgrep -f` is unusable: BusyBox pgrep matches its
own command line, so the first version of the check answered "already drawing" every time and
never fired.
It also repoints the TV's "last input" and turns off Home Auto Launch, because the mount only takes
effect about a minute into a cold boot and LG's home would otherwise open first. The cost is that
webOS's boot animation no longer plays - except that on this model there is none to lose.
Tested by setting homeAutoLaunch back to `on` and pulling the mains: no logo and no animation
appeared, only LG's own home, in the foreground at 39.40s against the launcher drawing at 36.90s
with it off. `com.webos.app.bootlogo` is not installed, there is no animation media on the
filesystem, and `general.homeAnimation` answers "There is no matched result from DB". What
turning it on does cost is real: `bootd` launches `com.webos.app.home` before the stub is
mounted, so LG's home comes up and then stays.

The "last input" is a record of four keys that webOS rewrites on every input change, not a
setting. Measured on a 65UR78003LK: selecting HDMI 3 rewrote all four, and going back to the
launcher rewrote none, so the record names the last input ever selected rather than the last thing
on screen. Writing two of the four once at boot therefore fixed nothing past the first input
change, and on a port with a games console the TV re-selecting the input wakes it out of rest mode
over SIMPLINK. The script now leaves a watcher behind that writes all four back when the record
has drifted, one settings write per input change, and `WATCH_EVERY=0` turns that off.

### Startup scripts - `scripts/` (new)

- `homestub.sh` - the home replacement above
- `replace.sh` - re-applies the home-app setting at boot, because on this set it did not survive a
  power cycle
- `tweaks.sh` - re-applies chosen system settings at boot, for the same reason
- `wallpapers.sh` - mounts the wallpaper disk **by UUID**, since webOS re-enumerates USB devices
  across a reboot and a device-node path fails with `Input/output error`

### A usable first run - `src/js/firstrun.js` (new)

Upstream's default bar is a fixed list of app ids, three of them games almost no television has,
so a fresh install showed gaps where another person's apps had been. Nothing is assumed now: the
bar is built from what the set actually reports, and Streaming / Games / Tools folders are made
only when at least two of their apps are installed.

The other inputs are deliberately left off the bar. A set has four HDMI ports, two DisplayPorts
and two USB-C ports whether or not anything is plugged in, and listing them all filled the bar
with empty sockets. They already have their own row above the dock, which shows only the ports
with something connected.

The weather location sets itself too. Previously a new install had none, so switching Weather on
appeared to do nothing - it only fetches once a place is set. The launcher now reads the TV's own
time zone, which carries a city and a country code, and looks that up; a hard-coded default city
would be wrong for everybody outside one country. Reading the `time` category is refused to an
ordinary app ("Access denied"), so it goes through the root service, and without root the search
box is still the way in. A location you chose is never overwritten.

### A second look, and the default - `src/css/editorial.css` (new)

**Editorial**, chosen in Settings > Clock > Look, and the default from 1.1.0. Every rule in the
sheet is scoped to `html.look-editorial`, so the whole thing switches off with one class and the
original appearance - **Classic** - is still there underneath, untouched.

The chrome dissolves. The dock loses its bar and the icons sit on the photograph behind a
gradient that separates them from it. The clock is large and thin, the date spaced small
capitals. The TV's inputs stand in a column down the left edge and the settings and info buttons
in a matching one on the right - all five the same size, all resting on the same baseline as the
app icons. The drawer becomes a single layer over a dimmed picture instead of two opaque panels,
with the "Apps" title gone and the category pills centred over the tiles.

Measured on the set it was built on: 5.0% of one core at idle against 4.2% for Classic.

Three things in it were not obvious:

- Dimming the picture behind the drawer cannot use the pattern the stylesheet uses elsewhere.
  The wallpaper layers sit **before** the drawer's checkbox in the document, so
  `#realappbarbtu:checked ~ ...` never reaches them; a scrim hung off `#appluncher` is clipped to
  its box, because it clips its content; one hung off `#drawertools` lands above the drawer
  rather than behind it. `:has()` matches on an ancestor, so document order stops mattering.
- `#appbar` and `#appluncher` are `content-box`, so side padding is **added** to their width.
  Padding the dock pushed it 77px off centre; padding the grid made it 2081px wide on a 1920
  screen.
- The category chips are `button.chip` with a `span.chipicon` inside, not `.hrtile`.

### Our own input glyphs - `src/js/inputicons.js` (new)

The TV's input artwork is per-device, but every file carries its own baked-in background - a grey
square behind one mark, a different grey behind another - so a row of them never looks like a
set. These are drawn instead: one weight, one box, no background, inheriting colour from the chip
they sit in. Specificity is kept where it matters, so a console that announces itself over
HDMI-CEC as a PlayStation still shows the PlayStation mark. That one is Sony's trademark, used to
identify a connected device exactly as LG's own artwork does - see [LICENSING.md](LICENSING.md).

Also fixed, and it predates all of this: `.appname` is 95px while "Streaming" needs 100, and a
centred nowrap line loses two and a half pixels off each end, so it has always read as
"treaming".

### Packaging and distribution (new)

`.github/workflows/release.yml` builds the `.ipk` on a version tag, generates the Homebrew Channel
manifest from that exact package, and attaches both to the release. The manifest carries the
package's SHA-256 and byte size, so one written by hand goes stale the moment the package is
rebuilt; building both in the same job makes that impossible.

`scripts/install-home.sh` does the home replacement in one command, and undoes it with `--undo`.
`docs/apps-repo-entry.yml` is the submission for the Homebrew Channel's app repository.

### Developer tooling - `deploy.sh`, `cdp.js`, `shots.js` (new)

`deploy.sh` syntax-checks every JavaScript file with `node --check` *before* sending it, because a
file that does not parse leaves a blank home screen recoverable only over SSH. `cdp.js` and
`shots.js` drive and photograph the running launcher over the Chrome DevTools Protocol.

---

## Changed

- **Visual theme** - `src/css/theme.css` (new, loaded after `main.css` so it only restyles).
  Removing that one line gives the upstream appearance back.
- **Folders** - the TV's own app groups (Inputs, TV, Settings, Sharing, Help) are picked up
  automatically alongside folders made by hand.
- **App bar** - pagination, configurable icon size, and names under the icons.
- **Remote navigation** (`src/js/dpad.js`) - focus handling reworked for the added panels.
- **About pane** - reports the launcher, the configuration, the wallpaper source, the screen, the
  TV and the project, and checks GitHub for a newer release only when asked.

---

## Changed from upstream's packaging

- **Package id** is `io.github.devic021.openhome`, not upstream's `com.homebrew.openlauncher`.
  Taking upstream's id in a shared repository would overwrite anyone's OpenLauncher without
  warning; with its own id OpenHome installs beside it. Carry settings across with
  **Backup → Export** and **Import**.
- **Wallpaper disk** is found by the label `OPENHOME` rather than a UUID edited into the script by
  hand, so no file has to be changed before use. A UUID still wins if one is set.

## Removed

- The bundled streamed-video wallpaper list is still present but is no longer the default source.
- `src/access/wallpaper/loop.mp4` is no longer committed. It is a generated 4K video, rebuilt by
  `scripts/make-wallpaper-video.sh` when wanted; without it the offline source falls back to the
  same photographs as stills.

---

## Not carried over

`src/js/personal-profile.js` in the development tree seeds a first-run configuration - pinned apps,
folder names, a weather location. It is specific to one household and is **not** part of this
repository.
