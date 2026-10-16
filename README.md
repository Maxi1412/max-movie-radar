# MAX Movie Radar — GitHub Pages PWA

A mobile-friendly movie dashboard tracking **physical home-media movie release dates** in **USA, United Kingdom and Spain**, with TMDb artwork, ratings, trailers, genres, search, date and market filters, watchlist, collection tracking and local backup import/export.

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

- 365-day lookback, three markets: US, GB, ES.
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
- `.github/workflows/refresh.yml`: scheduled/manual updater plus GitHub Pages deployment.
- `scripts/update_catalog.py`: verified physical release catalog builder.
- `scripts/test_catalog.py`: unit tests for physical release filtering.
- `data/releases.json`: published catalog, initially blank until the API token is configured.

### Running tests

`python -m unittest discover -s scripts -p 'test_*.py' -v` (run from project directory).

## Status and limitations

- The initial project deliberately shows **setup required** instead of invented movies until TMDb API authentication is set up.
- Manual refresh **does not directly trigger** a new TMDb query: it fetches the latest committed catalog, which is generated by the automatic/manual GitHub Actions workflow.
- Search searches currently fetched releases, not every film ever made. Use the per-movie TMDb link for further details.
- No Synology connection or movie downloading in v1; this edition tracks collection status only.
- Data source: [TMDb](https://www.themoviedb.org). "This product uses the TMDB API but is not endorsed or certified by TMDB."
