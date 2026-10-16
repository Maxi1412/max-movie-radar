#!/usr/bin/env python3
"""Refresh the release catalog from TMDb.

TMDb type 5 means PHYSICAL release, not necessarily DVD. This script deliberately
never claims that a DVD edition has been individually confirmed.

No dependencies outside the Python standard library. Uses the TMDb token from
GitHub Actions secrets, never writes the token to the public repo.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

API = 'https://api.themoviedb.org/3'
REGIONS = ('US', 'GB', 'ES')
LANGUAGES = {'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'pl', 'fi', 'ca'}
LOOKBACK_DAYS = 365
MAX_PREMIERE_AGE_DAYS = 900  # Reject classic-film reissues; original movie must be recent.
DISCOVER_PAGES_PER_REGION = 7
MAX_DETAILS = 300
OUTPUT = pathlib.Path(__file__).resolve().parents[1] / 'data' / 'releases.json'


def fetch_json(path: str, token: str, **params: Any) -> dict:
    query = urllib.parse.urlencode(params)
    url = f'{API}{path}' + (f'?{query}' if query else '')
    request = urllib.request.Request(url, headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
        'User-Agent': 'MAX-Movie-Radar/1.0 (private non-commercial catalog)',
    })
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                data = json.load(response)
                if not isinstance(data, dict):
                    raise ValueError(f'Unexpected TMDb response: {path}')
                return data
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
            header = exc.headers.get('Retry-After')
            wait = min(30, float(header)) if header and header.isdigit() else min(30, 2 ** (attempt + 1))
            print(f'TMDb temporarily unavailable ({exc.code}); retrying in {wait}s', file=sys.stderr)
            time.sleep(wait)
        except (TimeoutError, urllib.error.URLError):
            if attempt == 4:
                raise
            time.sleep(min(30, 2 ** (attempt + 1)))
    raise RuntimeError('TMDb retry limit exceeded')


def parse_date(value: Any) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(value or '')[:10])
    except ValueError:
        return None


def first_film_release(details: dict) -> dt.date | None:
    """Original movie premiere, NOT a 2026 physical reissue of an older film.

    TMDb primary release_date is combined with earliest nonphysical release
    worldwide; a wrongly updated primary date cannot mask an older theatrical
    record. If no evidence exists, do not advertise the film as new.
    """
    dates = [parse_date(details.get('release_date'))]
    for region in (details.get('release_dates') or {}).get('results') or []:
        for entry in region.get('release_dates') or []:
            if entry.get('type') in (1, 2, 3, 4, 6):
                dates.append(parse_date(entry.get('release_date')))
    valid = [d for d in dates if d is not None]
    return min(valid) if valid else None


def extract_physical_dates(details: dict, earliest: str, today: str) -> dict[str, str]:
    physical = {}
    release_obj = details.get('release_dates') or {}
    for country in release_obj.get('results') or []:
        code = country.get('iso_3166_1')
        if code not in REGIONS:
            continue
        all_dates = []
        for item in country.get('release_dates') or []:
            if item.get('type') != 5:
                continue
            raw = str(item.get('release_date') or '')[:10]
            try:
                dt.date.fromisoformat(raw)
            except ValueError:
                continue
            if earliest <= raw <= today:
                all_dates.append(raw)
        if all_dates:
            physical[code] = min(all_dates)
    return physical


def pick_trailer(details: dict) -> str | None:
    videos = (details.get('videos') or {}).get('results') or []
    choices = [v for v in videos if v.get('site') == 'YouTube' and v.get('type') == 'Trailer' and v.get('key')]
    choices.sort(key=lambda v: (v.get('official') is True, v.get('iso_639_1') == 'en'), reverse=True)
    return choices[0]['key'] if choices else None


def create_catalog(token: str, today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(dt.timezone.utc).date()
    earliest = (today - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    earliest_premiere = today - dt.timedelta(days=MAX_PREMIERE_AGE_DAYS)
    newest = today.isoformat()

    genre_data = fetch_json('/genre/movie/list', token, language='en-US')
    genres = {g['id']: g['name'] for g in genre_data.get('genres', []) if 'id' in g and 'name' in g}
    candidates: dict[int, dict] = {}

    for region in REGIONS:
        for page in range(1, DISCOVER_PAGES_PER_REGION + 1):
            result = fetch_json('/discover/movie', token, **{
                'region': region,
                'with_release_type': 5,
                'release_date.gte': earliest,
                'primary_release_date.gte': earliest_premiere.isoformat(),
                'release_date.lte': newest,
                'include_adult': 'false',
                'sort_by': 'popularity.desc',
                'language': 'en-US',
                'page': page,
            })
            items = result.get('results') or []
            for m in items:
                if not isinstance(m.get('id'), int) or m.get('original_language') not in LANGUAGES:
                    continue
                # Avoid predominantly niche titles while retaining European independents.
                if float(m.get('popularity') or 0) < 1.5 and int(m.get('vote_count') or 0) < 15:
                    continue
                entry = candidates.setdefault(m['id'], {'movie': m, 'regions': set()})
                entry['regions'].add(region)
            print(f'{region} page {page}: {len(items)} results, {len(candidates)} unique candidates')
            if not items or page >= int(result.get('total_pages') or 1):
                break
            time.sleep(.27)

    # Favor discoveries with genuinely recent physical dates, not just popularity.
    def rank(entry: dict) -> tuple:
        m = entry['movie']
        return (m.get('release_date') or '', float(m.get('popularity') or 0))

    ranked = sorted(candidates.values(), key=rank, reverse=True)[:MAX_DETAILS]
    movies = []
    for number, entry in enumerate(ranked, 1):
        base = entry['movie']
        detail = fetch_json(f'/movie/{base["id"]}', token, language='en-US', append_to_response='release_dates,videos')
        first_release = first_film_release(detail)
        # Release-type 5 may be a new Blu-ray edition of a 1999 film.
        # Only include movies whose FIRST premiere is within the last 900 days.
        if not first_release or first_release < earliest_premiere or first_release > today:
            continue
        dates = extract_physical_dates(detail, earliest, newest)
        # Invalid source metadata should not put a disc release before its film premiere.
        dates = {region: day for region, day in dates.items()
                 if dt.date.fromisoformat(day) >= first_release - dt.timedelta(days=14)}
        if not dates:
            continue
        title = detail.get('title') or base.get('title') or ''
        if not title:
            continue
        movies.append({
            'id': base['id'],
            'title': title,
            'year': str(first_release.year),
            'first_release_date': first_release.isoformat(),
            'overview': detail.get('overview') or base.get('overview') or '',
            'original_language': detail.get('original_language') or base.get('original_language'),
            'poster_path': detail.get('poster_path') or base.get('poster_path'),
            'backdrop_path': detail.get('backdrop_path') or base.get('backdrop_path'),
            'genre_names': [g.get('name') for g in detail.get('genres') or [] if g.get('name')] or [genres[g] for g in base.get('genre_ids') or [] if g in genres],
            'popularity': round(float(detail.get('popularity') or base.get('popularity') or 0), 2),
            'vote_average': round(float(detail.get('vote_average') or base.get('vote_average') or 0), 1),
            'vote_count': int(detail.get('vote_count') or base.get('vote_count') or 0),
            'physical_dates': dates,
            'trailer_key': pick_trailer(detail),
        })
        if number % 25 == 0:
            print(f'Validated {number}/{len(ranked)} titles; {len(movies)} matching physical dates')
        time.sleep(.27)

    movies.sort(key=lambda m: (max(m['physical_dates'].values()), m['popularity']), reverse=True)
    if not movies:
        raise ValueError('TMDb returned no validated physical releases; refusing to replace existing catalog')
    return {
        'schema_version': 2,
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'status': 'ready',
        'source': 'TMDb',
        'note': 'Recent original films only; physical DVD/Blu-ray/UHD release dates in selected countries. Individual disc formats and stock are not verified.',
        'coverage': {'countries': list(REGIONS), 'release_type': 5, 'formats': 'dvd_bluray_uhd_unverified', 'lookback_days': LOOKBACK_DAYS, 'maximum_film_age_days': MAX_PREMIERE_AGE_DAYS},
        'movies': movies,
    }


def main() -> int:
    token = os.environ.get('TMDB_READ_ACCESS_TOKEN', '').strip()
    if not token:
        print('Missing TMDB_READ_ACCESS_TOKEN. Configure this repository secret in GitHub Settings > Secrets and variables > Actions.', file=sys.stderr)
        return 2
    catalog = create_catalog(token)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=OUTPUT.parent, prefix='.releases.', suffix='.tmp', delete=False) as tmp:
        json.dump(catalog, tmp, indent=2, ensure_ascii=False)
        tmp.write('\n')
        tmp_name = tmp.name
    os.replace(tmp_name, OUTPUT)
    print(f'Wrote {len(catalog["movies"])} validated physical releases to {OUTPUT}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
