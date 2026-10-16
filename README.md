## Media Library UI and future NAS integration (v1.4)

An additional top-level **Media Library** tab provides cinematic cover browsing, Movies and TV Show sub-collections, filters, genres, movie and series detail views, TV seasons/episodes and watched controls. It reuses existing saved movie / tracked TV flags from the installed app **without assuming that those files are on the NAS**. The On NAS badge is reserved for private indexed media. The new interface retains the established premium styling and stores viewing preferences/progress locally.

The playback chooser defaults to **VLC on Android**, allows other installed apps and in-browser HTML5 playback, and can remember the device's preferred player. **Playback is not live yet**; Play requires a private NAS adapter and a short-lived authenticated stream URL. Chrome Android intent links, app choices and codec compatibility are subject to device tests. External VLC progress cannot be read automatically from a plain browser PWA. A local sanitized index JSON can be previewed, but it is not automatically synchronized to the Synology.

**Video Station/DS video is a UI reference only, NOT a required media engine.** Codex must first inspect the already-existing movie and TV indexes on Synology and extend/reuse them before scanning or installing anything new. Future integration is defined in [NAS Media Library handoff](docs/NAS_MEDIA_LIBRARY_HANDOFF.md) and [GitHub integration checklist](https://github.com/Maxi1412/max-movie-radar/issues/1). No NAS addresses, logins, raw files, or private inventory should ever enter the public repository.

## Streaming discovery (version 1.3)

New **Streaming** tab covers current TMDb/JustWatch-reported availability in the **United States (US), United Kingdom (GB), Spain (ES), and Australia (AU)**. Australia supports regional Stan listings; Hulu is mainly US. Providers are read dynamically from TMDb and filtered by returned service IDs rather than hardcoded. Netflix, Prime Video, Disney+, Hulu, Stan, Apple TV, and many other provider listings can be selected where available. Provider data is supplied by **JustWatch** via **TMDb**, and requires attribution.

The separate tab supports Movies / TV Series, regional and provider filters, search, Likes, Streaming Saved and provider-change alerts for saved titles. Alerts mean **newly detected by the local catalog**, not verified first-service-arrival dates. Streaming subscriptions, free and ad-supported providers are included; rental/purchase-only services are excluded. Availability is only a best-effort country-dependent snapshot.

Saved and liked streaming titles are stored on this device in browser localStorage, separately from DVD movie watchlists and TV episode tracking, avoiding incorrectly labelling a streaming-only title as physically released. The app refreshes its published static streaming feed when opened; GitHub Actions regenerates that feed twice daily. TMDb **does not provide trustworthy exact service debut dates** or guarantee every episode is available in a particular region.

Streaming files: `streaming.js`, `streaming.css`, `scripts/update_streaming.py`, `scripts/test_streaming.py`, `data/streaming.json`. Existing private TMDb secret is reused.

## TV Shows and episode alerts (v1.2)

The PWA includes a separate **TV Shows** tab. It imports current/returning television shows plus selected favourites and Big Bang universe shows from TMDb on the same GitHub schedule as the films. TV episodes are dated by **original air date**, not DVD release or regional streaming-platform availability. Each series provides episode tracking from its latest two numbered seasons, capped at the 54 most recently dated episodes to keep the PWA responsive. Track individual episodes, mark all aired episodes watched, and follow a series for in-app alerts on newly aired episodes as the server feed changes.

Alerts are **in-app only**. They appear the next time the site opens/refreshes; there is no background phone push notification service. Follows, watched history and alerts are stored only in localStorage on that device. Curated universe links are editorial, not a generic automated spin-off graph. The public catalog is a curated/trending subset rather than an exhaustive TMDb search.

### Poster matching QA (v1.2)

Movie titles and artwork originate from one TMDb movie ID. The fallback title graphic is displayed only if there is no valid poster or the poster image fails to load, avoiding a previously overlaid title/fallback obscuring the actual poster. TMDb poster and translation contributions themselves cannot be guaranteed correct without title-by-title human review.

# MAX Movie Radar — GitHub Pages PWA

A mobile-friendly movie and TV-series dashboard tracking **recent original movies newly available on physical home media (DVD, Blu-ray, 4K UHD)** in **USA, United Kingdom and Spain**, with TMDb artwork, ratings, trailers, genres, search, date and market filters, watchlist, collection tracking and local backup import/export.

## Important precision: physical is not DVD-only

TMDb release type **5 (Physical)** includes formats such as **DVD, Blu-ray and 4K UHD**, without an independent reliable DVD-only flag. This program **never includes cinema-only or digital-only dates**, but **cannot assert that every physical release has a DVD edition**. Every movie and its country-specific physical date is shown as a **candidate requiring DVD-format confirmation**. This is not a retailer inventory or DVD-stock checker.

TMDb documentation: https://developer.themoviedb.org/docs/region-support

## Publish the PWA — 1-time setup

The following assumes you have an ordinary GitHub account. The project is designed for GitHub Pages on a **new public repository**.

1. Visit **https://github.com/new** and create a new **public** repository named **max-movie-radar**. Leave **Add a README file** unchecked so you start with an empty repository.
2. Unzip `max-movie-radar.zip` locally. Open the new repository, click **Add file → Upload files**, and upload **the files and folders inside** the extracted `max-movie-radar` directory, **including `.github/workflows/refresh.yml`**. Commit the upload to the default branch. GitHub can reject hidden `.github` folders during drag-and-drop. **If `.github/workflows/refresh.yml` is missing after upload**, click **Add file → Create new file**, type `.github/workflows/refresh.yml` as the filename, paste the full contents of that file from the extracted project, and commit. Do not omit the workflow.
3. Create or sign in to a free TMDb account: **https://www.themoviedb.org/settings/api**. In your TMDb account **Settings → API**, request the **Developer** API credential and locate your **API Read Access Token** (the longer token, not the API key). TMDb describes the non-commercial developer API as free with attribution.
4. In your **new GitHub repository** open **Settings → Secrets and variables → Actions → New repository secret**. Enter name **`TMDB_READ_ACCESS_TOKEN`** and paste the TMDb **API Read Access Token** as the value. Save. **Do not paste the token into app.js, index.html, commits or a public issue.**
5. Open **Settings → Pages** and select **GitHub Actions** under **Build and deployment → Source** (do not choose Deploy from a branch). The included workflow both refreshes the catalog and publishes the updated PWA; the branch-based method does not reliably republish commits made by the automatic updater.
6. Open **Actions → Refresh movie catalog and publish PWA → Run workflow → Run workflow**. The first successful run downloads the catalog, commits it and publishes your site. If the update fails because the workflow cannot write to the repository, check **Settings → Actions → General → Workflow permissions** and the run log, then rerun. Your expected site URL after deployment is `https://Maxi1412.github.io/max-movie-radar/` (not live until a successful deployment).
7. Open the website. On Android Chrome choose browser menu **Add to Home screen** / **Install app** (wording varies). The refresh icon checks the most recently published release data. GitHub Actions refreshes and republishes the catalog automatically about twice daily; delayed or skipped scheduled runs are possible.

GitHub docs: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

### Data design

- Disc releases in the last 365 days, three markets: US, GB, ES.
- **First film release must be within 900 days** and validated against earliest known nonphysical release worldwide; older-film disc reissues such as Fight Club (1999) are excluded. Filters apply server-side and are revalidated in the browser.
- The release date on a card is the **physical-media date**; the label `FILM 2025` represents the original film year. Dates and edition stock depend on TMDb and retailers.
- Per-market TMDb `/discover/movie` restricted to `with_release_type=5` and physical date range; details are checked via `/movie/{id}?append_to_response=release_dates,videos` and only actual release-type-5 country dates survive.
- English and European original languages emphasized: English, Spanish, French, German, Italian, Portuguese, Dutch, Nordic, Polish, Finnish and Catalan. Not a Hollywood-only rule; films outside this original-language selection will be omitted.
- TMDb popularity filter de-emphasizes very obscure titles. `scripts/update_catalog.py` includes parameters for adjusting coverage later.
- No API key in public client JavaScript. No external paid packages or server needed; updater uses only Python standard library.
- Movie catalog in publicly readable `data/releases.json`; **watchlist and collection are not published to GitHub**. They stay in your current browser's local storage. Export backup JSON under **Settings** and import on other devices. Backups merge status and do not delete saved items. No cross-device cloud sync in v1.
- When site is offline, the app shell and last successfully fetched catalog can be used from service-worker cache. New titles require internet and a successful Actions update.
- TMDb data and images are subject to its attribution and use terms. Current catalog is refreshed regularly and should not be archived beyond six months.

### Files

- `index.html`, `styles.css`, `app.js`: responsive frontend.
- `sw.js`, `manifest.webmanifest`, `assets/`: installable PWA and offline shell.
- `.github/workflows/refresh.yml`: scheduled/manual movie and TV updater plus GitHub Pages deployment.
- `tv.js`, `tv.css`: separate TV dashboard, following and episode tracker.
- `scripts/update_tv.py`, `scripts/test_tv.py`: TMDb series/episode updates and QA tests.
- `data/tv.json`: scheduled and aired TV episodes (original air dates).
- `scripts/update_catalog.py`: verified physical release catalog builder.
- `scripts/test_catalog.py`: unit tests for physical release filtering, classic-film reissue exclusion, original premiere detection, and future-date rejection.
- `data/releases.json`: published catalog, initially blank until the API token is configured.

### Running tests

`python -m unittest discover -s scripts -p 'test_*.py' -v` (run from project directory).

## Status and limitations

- Watchlist and collection entries, including any older films previously saved, remain locally stored and are not deleted by the catalog cleanup.
- The initial project deliberately shows **setup required** instead of invented movies until TMDb API authentication is set up.
- Manual refresh **does not directly trigger** a new TMDb query: it fetches the latest committed catalog, which is generated by the automatic/manual GitHub Actions workflow.
- Search searches currently fetched releases, not every film ever made. Use the per-movie TMDb link for further details.
- No Synology connection or movie downloading in v1; this edition tracks collection status only.
- Data source: [TMDb](https://www.themoviedb.org). "This product uses the TMDB API but is not endorsed or certified by TMDB."
