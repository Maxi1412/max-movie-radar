# MAX Movie Radar — Media Library / NAS / playback handoff

Status: UI shell implemented. Real NAS inventory synchronization and playable streams are NOT connected yet.

## User's exact UX requirement

DS video / Video Station is ONLY a visual and interaction reference. It is NOT a required integration, software choice or backend. User wants the existing premium dark/gold UI with a top-level Media Library tab: Netflix-like poster carousels, featured movies, browse by genre, movies vs series, searching, movie details, show seasons, episodes, watched states, Continue Watching, player chooser and playback.

Android preferred player: **VLC**. Allow choosing another installed player and optionally remembering that device's preference. Desktop/other devices normally use browser video playback when codec and secure delivery permit, with manual override. Chrome Android intents need real user gesture; native playback success and VLC watch progress are not directly observable from a web PWA.

## Implemented in browser-facing app now

- library.js / library.css, loaded from index.html and cached by service worker.
- Media Library nav tab and full-size cinematic browsing/detail views.
- Shows existing locally saved/owned movie titles and followed/watched TV shows from the established PWA localStorage keys; these are labelled Saved / tracked, **NOT verified On NAS**.
- TV seasons/episodes from available metadata, watched controls, filters, search, genre rails, Continue Watching layout.
- Separate player choice UI with VLC default on Android, system chooser, and browser video support. Play is unavailable without real verified file/episode and private resolver; NO fake playback URLs.
- Browser player progress / manual watched controls are local to this device, not an assertion that VLC can report progress back.
- Optional local-only sanitized JSON preview. Local import not uploaded to GitHub and not proof a NAS file exists.
- Future adapter API: window.MaxMovieRadarLibrary.connect(adapter). Adapter must implement loadInventory() returning sanitized schema_version 1 JSON and resolvePlayback({kind, tmdbId, mediaId, season?, episode?}) returning a short-lived authorized {url, mime}. window.MaxMovieRadarLibrary.refresh() updates the display. Nothing public contains NAS credentials.

## Start here, before adding any scanner

1. User explicitly says the Synology already contains various movie and TV index files. Inspect those existing inventories, scripts, schedules, and metadata first (previously discussed media_inventory.json name is NOT a verified current file). Read-only audit, sample comparison against files, back up before changes.
2. Verify Synology model, DSM, RAM/CPU, existing media services and which home/remote network access is permitted. Don't modify packages or open ports without approval.
3. Define source-of-truth and confidence rules. Match by TMDb/IMDb IDs, cross-check title, original year/type, TV season/episode. Fallback to OMDb (free key) and TVmaze (keyless) if needed. Flag uncertain collisions; never label wrong posters/files owned automatically.
4. Implement a private authenticated, LAN/VPN-accessible **inventory endpoint** with a sanitized schema, avoiding raw filesystem paths or creds in the PUBLIC GitHub Pages repository.
5. Example schema (synthetic, not real owned titles): schema_version = 1; movies = [{tmdb_id:1234,title:"Example Film",year:"2025",media_id:"opaque-item-id",poster_path:"/tmdb-poster-path"}]; shows = [{tmdb_id:5678,title:"Example Series",episodes:[{season:1,episode:1,name:"Pilot",media_id:"opaque-episode-id"}]}]. A media_id signals a mapping in the *private* verified source; don't invent such IDs.
6. Implement resolvePlayback() on the private companion: return short-lived authenticated HTTPS media link (not long-lived public URL). Byte-range seeking, correct video MIME, permissions, and codec-specific fallback are required. Avoid writing tokenized URLs into localStorage or public GitHub.
7. Test a real movie and episode from the verified NAS with Android VLC and a second device. Chrome intent links only work with user activation and compatible app; if blocked use system chooser or another supported integration. External VLC watched sync requires separate server/player integration; otherwise allow manual Watched toggle.
8. Add accurate missing episode/season detection, prevent duplicate movie recommendations and optionally user-approved Download Station tasks from authorized links only.
9. Preserve ALL existing watchlists, collection statuses, watched data and PWA code. Never delete NAS media or replace current index scripts before verification.

## Playback/security limitations

A GitHub Pages app cannot safely read private NAS shares or expose a private stream without a secure companion. Browser HTML5 video support depends on codecs, mixed-content restrictions and an authenticated HTTPS/Range-capable gateway. Native VLC opening through Android Chrome requires device testing; the current code is future-facing scaffolding rather than end-to-end working NAS playback. Video Station is NOT a dependency; optional VLC, Jellyfin, or another private gateway are implementation choices after on-NAS research.

References: https://developer.chrome.com/docs/android/intents
https://github.com/videolan/vlc-android/blob/master/application/vlc-android/AndroidManifest.xml
https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
GitHub roadmap: https://github.com/Maxi1412/max-movie-radar/issues/1
