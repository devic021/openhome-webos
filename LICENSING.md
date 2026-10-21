# Licensing

This repository contains work under several licences. The summary badge says **GPL-3.0**, which is
how the project as a whole is distributed; this file says exactly what applies to what, because the
parts do not all share one licence.

Every source file carries an `SPDX-License-Identifier` header. Where this file and a header
disagree, **the header is authoritative for that file**.

---

## The project as a whole

Distributed under the **GNU General Public License, version 3 or later** - [LICENSE](LICENSE).

This follows upstream. [OpenLauncher](https://github.com/Shantil-K/OpenLauncher) by Shantil-K has
shipped a GPL-3.0 `LICENSE` since its first commit and states GPLv3 in its readme.

---

## Code written for this project

**GPL-3.0-or-later.** Fifteen files, each marked `SPDX-License-Identifier: GPL-3.0-or-later`:

| File | What it is |
|---|---|
| `src/js/tvsettings.js` | the TV settings pane |
| `src/js/syspanel.js` | the system panel |
| `src/js/i18n.js` | the translation framework and the Serbian table |
| `src/js/status.js` | the status strip |
| `src/js/quick.js` | input shortcuts |
| `src/js/photowall.js` | photo wallpapers and the cross-dissolve |
| `src/js/photocache.js` | the Wikimedia Commons pool on USB |
| `src/js/photos.js` | the bundled list of pool sources |
| `src/js/forecast.js` | the seven-day weather panel |
| `src/js/airquality.js` | the air-quality chip |
| `src/js/weathericons.js` | the weather glyphs |
| `src/js/homesettings.js` | the home-screen settings group |
| `src/js/tooltip.js` | hover hints |
| `src/js/fade.js` | panel transitions |
| `src/css/theme.css` | the visual overhaul |

Plus the startup scripts in `scripts/` and the developer helpers at the repository root.

> **Attribution:** these files say *"Copyright (C) 2026 the OpenHome contributors"*.
> Replace that with your own name or handle if you prefer to be named.

---

## Code inherited from upstream

Fourteen files were **modified** rather than written from scratch:

```
src/index.html        src/js/about.js       src/js/background.js   src/js/backup.js
src/js/clock.js       src/js/dpad.js        src/js/folders.js      src/js/info.js
src/js/main.js        src/js/rename.js      src/js/replacehome.js  src/js/settings.js
src/js/systemapps.js  src/js/weather.js
```

These, and the files not touched at all, keep their original
**`SPDX-License-Identifier: WTFNMFPL`** headers - the grant made by the original author, which is
not ours to restate. They come from **QwQHome** by **exkc**, originally at
[git.exkc.moe/qvh/moe.exkc.hoooooooooom](https://git.exkc.moe/qvh/moe.exkc.hoooooooooom), by way of
OpenLauncher.

**WTFNMFPL** is the *Do What The F\*ck You Want To But It's Not My Fault Public License*, version 1
(October 2013, Ben McGinnes) - the WTFPL with an added clause disclaiming liability. Its text is
not reproduced here; the canonical copy is at
[spdx.org/licenses/WTFNMFPL.html](https://spdx.org/licenses/WTFNMFPL.html).

It is a permissive licence, which is why upstream could distribute the combined work under
GPL-3.0, and why this fork can do the same.

---

## Third-party material

| Part | Licence | Source |
|---|---|---|
| `src/js/icons.js` | **Apache-2.0** | [Material Symbols](https://github.com/google/material-design-icons) (Rounded, weight 700) by Google |
| `src/access/appbar.svg` | **Apache-2.0** | [fonts.google.com](https://fonts.google.com/) |
| `src/access/fallback.png` | **Apache-2.0** | from the webOS open-source components |
| `src/access/plusjakartasans-bold.woff2` | **OFL-1.1** | Plus Jakarta Sans Bold - [OFL-PlusJakartaSans.txt](src/access/OFL-PlusJakartaSans.txt) |
| `src/access/manrope-latin*.woff2` | **OFL-1.1** | [Manrope](https://github.com/sharanda/manrope) - [OFL-Manrope.txt](src/access/OFL-Manrope.txt) |
| `src/access/wallpaper/*.jpg`, `*.png` | **CC-BY-SA** | the bundled photographs, from upstream - [LICENSE-CC-BY-SA](LICENSE-CC-BY-SA) |
| `src/access/wallpaper/loop.mp4` | **CC-BY-SA** | *not committed* - built locally from those photographs by `scripts/make-wallpaper-video.sh`, so it inherits their licence |
| the PlayStation mark in `src/js/inputicons.js` | **trademark, not licensed here** | Sony's logo, drawn when a console tells the TV over HDMI-CEC that it is a PlayStation. It identifies the connected device, which is the same use LG's own input artwork makes of it, and it is **not** covered by this project's licence. Remove that one entry if you would rather not ship it. |
| `src/js/lib/QwQwebosTV.js/main.js` | **WTFNMFPL** | [QwQwebosTV.js](https://git.exkc.moe/qvh/QwQwebosTV.js) by exkc, vendored so a plain clone works |

Both fonts are in use: `main.css` loads Plus Jakarta Sans, and `theme.css` loads Manrope on top of
it. Removing `theme.css` leaves the upstream appearance and the upstream font.

---

## Data and services

Used at runtime, not redistributed:

- **Weather** - [Open-Meteo](https://open-meteo.com), data under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No key, no account.
- **Wallpaper pool** - images fetched on demand from
  [Wikimedia Commons](https://commons.wikimedia.org). Each file carries its own licence on Commons;
  nothing from there is stored in this repository.
- **Aerial video list** - from
  [conreo/couchy-launcher](https://github.com/conreo/couchy-launcher). The videos stream from their
  original hosts and are not part of this repository.

---

## Not included

`src/js/personal-profile.js` exists in the development tree and seeds a first-run configuration for
one particular household. It is deliberately absent here.
