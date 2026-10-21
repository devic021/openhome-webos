# The TV's settings, as the firmware keeps them

LG's settings menu shows **36** items. The television actually stores **838**. These two files are
the difference, and they are where the TV settings pane in this launcher comes from.

| file | what is in it |
|---|---|
| [`tv-settings-keys.json`](tv-settings-keys.json) | all 838 keys, by category, with the values each one accepts and whether LG's own menu shows it |
| [`tv-settings-labels.json`](tv-settings-labels.json) | 228 of them with **LG's own name and description**, in English and Serbian |

---

## How the key list was made

`com.webos.settingsservice` will hand over everything it has, one category at a time, through the
Homebrew Channel's root service:

```bash
luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettings \
  '{"category":"picture"}' < /dev/null
```

The categories are `general`, `option`, `other`, `time`, `network`, `lock`, `picture`, `sound`,
`aiService`, `commercial`, `customerService` and `twinPicture`.

For each key, `getSystemSettingDesc` reports what it will accept — a range, or a list of values,
and which of them are valid on this model right now:

```bash
luna-send -n 1 -f luna://com.webos.settingsservice/getSystemSettingDesc \
  '{"category":"picture","keys":["backlight"]}' < /dev/null
```

That is why the controls in the settings pane are generated rather than written by hand: ask the
set what a key accepts, and the control matches the model instead of going stale after a firmware
update.

## How the names were found

The names are **not a translation**. They are LG's own words, pulled out of the TV's own settings
application at `/usr/palm/applications/com.palm.app.settings/main.js`, where each key appears as
`VH("key")` followed by the string it is labelled with. The Serbian half comes from the same app's
locale files, so a label here reads exactly as it does in LG's menu.

228 keys of the 838 could be matched that way. The rest are internal state with no label, because
they were never meant to be shown.

## What is not here

**No values.** Every entry describes a key — its category, what it accepts, whether LG shows it —
and nothing about how one particular television is set. That is deliberate: a settings dump taken
off a real set carries things like `IPControlSecureKey`, `password_ipcontrol` and `systemPin`,
which are credentials, along with the device name, so publishing one as-is would publish those.

To see your own values, ask your own TV with the command above.

## Finding something worth exposing

`inLgMenu: false` is the interesting filter — those are the keys the menu never draws. Most are
internal (`*Count`, `*Index`, `*Version`, `last*`), but what is left includes the things this
launcher surfaces:

| key | category | what it does |
|---|---|---|
| `screenSaverMode` | `option` | the screen saver, which LG's menu has no on/off switch for |
| `livePlus` | `option` | recognises what is on screen and reports viewing data |
| `uhdDeepColor` | `other` | HDMI Deep Colour — filed under `other`, not `picture` |
| `444BypassHDMI1`..`4` | `other` | 4:4:4 pass through, per port |
| `homePromotion` | `option` | the "Sponsored" tiles on the home screen |

**A warning about `picture` and `sound`:** those keys are stored per picture mode × input, so one
key has many values on one set. Send **no** `dimension` field and the service resolves the current
context itself and tells you which one it used. Send a field it does not expect and it answers
*"no result from DB"*, which looks like the key does not exist when it does.
