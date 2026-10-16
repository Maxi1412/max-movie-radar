#!/usr/bin/env python3
"""Build a TV episode schedule for MAX Movie Radar using TMDb server-side credentials.
TV airdates are not disc releases, and do not confirm regional streaming availability.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import pathlib
import tempfile
import time
from typing import Any

from update_catalog import fetch_json, parse_date

OUTPUT = pathlib.Path(__file__).resolve().parents[1] / 'data' / 'tv.json'
REGION_LANGUAGES = {'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'sv', 'no', 'da', 'pl', 'fi', 'ca'}
MAX_SHOWS = 110
MAX_SEARCH = 170
MAX_EPISODES_PER_SHOW = 54  # Recent episode tracking; avoids giant daily-soap schedules.
LOOKBACK_DAYS = 540
LOOKAHEAD_DAYS = 90
CURATED = (
    ('The Big Bang Theory', 'Big Bang universe'),
    ('Young Sheldon', 'Big Bang universe'),
    ("Georgie & Mandy's First Marriage", 'Big Bang universe'),
    ('Stuart Fails to Save the Universe', 'Big Bang universe'),
    ('Reacher', ''),
    ('Lanterns', ''),
    ('The Pitt', ''),
    ('The Last of Us', ''),
    ('Severance', ''),
    ('The Boys', ''),
    ('Fallout', ''),
    ('Slow Horses', ''),
    ('House of the Dragon', ''),
    ('Wednesday', ''),
    ('The White Lotus', ''),
    ('The Mandalorian', ''),
    ('Abbott Elementary', ''),
    ('Tracker', ''),
    ('The Bear', ''),
    ('The Diplomat', ''),
    ('Tulsa King', ''),
    ('Daredevil: Born Again', ''),
    ('The Rookie', ''),
    ('The Lincoln Lawyer', ''),
    ('Nobody Wants This', ''),
    ('Silo', ''),
    ('Only Murders in the Building', ''),
    ('Shrinking', ''),
    ('For All Mankind', ''),
    ('Stranger Things', ''),
)
SEED_FRANCHISE = {name.casefold(): franchise for name, franchise in CURATED if franchise}


def matching_search_result(name: str, results: list[dict]) -> dict | None:
    key = name.casefold().replace('’', "'").strip()
    for item in results:
        choices = [str(item.get('name') or ''), str(item.get('original_name') or '')]
        if any(x.casefold().replace('’', "'").strip() == key for x in choices):
            return item
    return None


def episode_key(episode: dict) -> str:
    return f"s{int(episode['season_number']):02d}e{int(episode['episode_number']):02d}"


def clean_episodes(season: dict, today: dt.date) -> list[dict]:
    maximum = today + dt.timedelta(days=LOOKAHEAD_DAYS)
    rows = []
    for e in season.get('episodes') or []:
        air = parse_date(e.get('air_date'))
        sn = e.get('season_number')
        en = e.get('episode_number')
        if not air or air > maximum or not isinstance(sn, int) or sn < 1 or not isinstance(en, int) or en < 1:
            continue
        if e.get('episode_type') in ('special', 'finale_special'):
            continue
        rows.append({
            'id': int(e.get('id') or 0),
            'season_number': sn, 'episode_number': en,
            'key': episode_key(e),
            'name': str(e.get('name') or f'Episode {en}'),
            'air_date': air.isoformat(),
            'overview': str(e.get('overview') or '')[:230],
        })
    return sorted(rows, key=lambda e: (e['season_number'], e['episode_number']))


def build_show(detail: dict, token: str, today: dt.date, franchise: str = '') -> dict | None:
    show_id = detail.get('id')
    if not isinstance(show_id, int) or show_id < 1:
        return None
    seasons = sorted({s.get('season_number') for s in detail.get('seasons') or []
                      if isinstance(s.get('season_number'), int) and s.get('season_number') > 0}, reverse=True)
    episodes = []
    # Recent two seasons include current season, giving users relevant episodes to mark watched.
    for sn in seasons[:2]:
        season = fetch_json(f'/tv/{show_id}/season/{sn}', token, language='en-US')
        episodes.extend(clean_episodes(season, today))
        time.sleep(.12)
    seen = set()
    unique = []
    for e in episodes:
        if e['key'] not in seen:
            unique.append(e)
            seen.add(e['key'])
    # Retain only recent episodes across the latest two seasons; weekly shows
    # remain complete, while long-running daily programmes no longer balloon
    # the catalog into several megabytes.
    unique = sorted(unique, key=lambda e: (e['air_date'], e['season_number'], e['episode_number']),
                    reverse=True)[:MAX_EPISODES_PER_SHOW]
    unique.sort(key=lambda e: (e['season_number'], e['episode_number']))
    aired = [e for e in unique if e['air_date'] <= today.isoformat()]
    future = [e for e in unique if e['air_date'] > today.isoformat()]
    last_aired = max((e['air_date'] for e in aired), default='')
    next_air = min((e['air_date'] for e in future), default='')
    return {
        'id': show_id, 'name': str(detail.get('name') or ''),
        'original_name': str(detail.get('original_name') or ''),
        'first_air_date': str(detail.get('first_air_date') or '')[:10],
        'status': str(detail.get('status') or ''),
        'overview': str(detail.get('overview') or '')[:750],
        'poster_path': detail.get('poster_path'),
        'backdrop_path': detail.get('backdrop_path'),
        'original_language': detail.get('original_language'),
        'genres': [str(g.get('name')) for g in detail.get('genres') or [] if g.get('name')],
        'networks': [str(n.get('name')) for n in detail.get('networks') or [] if n.get('name')][:3],
        'popularity': round(float(detail.get('popularity') or 0), 2),
        'vote_average': round(float(detail.get('vote_average') or 0), 1),
        'last_air_date': last_aired,
        'next_air_date': next_air,
        'franchise': franchise,
        'episodes': unique,
    }


def build_catalog(token: str, today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(dt.timezone.utc).date()
    cutoff = (today - dt.timedelta(days=LOOKBACK_DAYS)).isoformat()
    maximum = (today + dt.timedelta(days=LOOKAHEAD_DAYS)).isoformat()
    candidates: dict[int, dict] = {}
    curated_ids: dict[int, str] = {}

    def register(item: dict, curated: bool = False, franchise: str = '') -> None:
        ident = item.get('id')
        if not isinstance(ident, int) or ident < 1 or item.get('original_language') not in REGION_LANGUAGES:
            return
        candidates[ident] = item
        if curated:
            curated_ids[ident] = franchise

    for name, franchise in CURATED:
        result = fetch_json('/search/tv', token, query=name, language='en-US', include_adult='false')
        match = matching_search_result(name, result.get('results') or [])
        if match:
            register(match, curated=True, franchise=franchise)
        else:
            print(f'Curated title unavailable in TMDb: {name}')
        time.sleep(.14)

    for path, pages in (('/tv/on_the_air', 5), ('/trending/tv/week', 4)):
        for page in range(1, pages + 1):
            result = fetch_json(path, token, language='en-US', page=page)
            for item in result.get('results') or []:
                register(item)
            if page >= int(result.get('total_pages') or 1):
                break
            time.sleep(.16)

    # Keep priority shows even if no longer airing, so spin-offs can be discovered.
    pinned = list(curated_ids)
    other = sorted((x for x in candidates if x not in curated_ids),
                   key=lambda ident: float(candidates[ident].get('popularity') or 0), reverse=True)
    show_ids = (pinned + other[:max(0, MAX_SEARCH - len(pinned))])[:MAX_SEARCH]

    result = []
    for index, ident in enumerate(show_ids, 1):
        detail = fetch_json(f'/tv/{ident}', token, language='en-US')
        if detail.get('original_language') not in REGION_LANGUAGES:
            continue
        if detail.get('adult') is True:
            continue
        if ident not in curated_ids and any(g.get('id') in (10763, 10764, 10767)
                                           for g in detail.get('genres') or []):
            # Skip news, reality and talk shows; prioritize narrative series.
            continue
        if ident not in curated_ids:
            date = str(detail.get('last_air_date') or '')[:10]
            upcoming = (detail.get('next_episode_to_air') or {}).get('air_date') or ''
            if date < cutoff and not (today.isoformat() <= upcoming <= maximum):
                continue
        show = build_show(detail, token, today, franchise=curated_ids.get(ident, ''))
        if show and show['name'] and show['episodes']:
            result.append(show)
        if index % 25 == 0:
            print(f'TV details checked: {index}/{len(show_ids)}, accepted {len(result)}')
        if len(result) >= MAX_SHOWS:
            break
        time.sleep(.15)
    if not result:
        raise ValueError('No valid TV series/episodes; preserving previous catalog')
    result.sort(key=lambda s: (s['last_air_date'] or '', s['popularity']), reverse=True)
    return {
        'schema_version': 1, 'status': 'ready',
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'source': 'TMDb', 'date_type': 'episode_original_air_date',
        'note': 'Dates are original episode airdates, NOT DVD, Blu-ray, or regional streaming availability confirmations.',
        'lookback_days': LOOKBACK_DAYS, 'upcoming_days': LOOKAHEAD_DAYS,
        'shows': result,
    }


def main() -> int:
    token = os.environ.get('TMDB_READ_ACCESS_TOKEN', '').strip()
    if not token:
        print('Missing TMDB_READ_ACCESS_TOKEN', file=__import__('sys').stderr)
        return 2
    data = build_catalog(token)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=OUTPUT.parent,
                                     prefix='.tv.', suffix='.tmp', delete=False) as temp:
        json.dump(data, temp, ensure_ascii=False, indent=2)
        temp.write('\n')
        filename = temp.name
    os.replace(filename, OUTPUT)
    print(f"TV catalog saved: {len(data['shows'])} shows")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
