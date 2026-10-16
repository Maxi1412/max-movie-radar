#!/usr/bin/env python3
"""Build region-aware subscription/ad-supported streaming discovery from TMDb/JustWatch.

The service data indicates CURRENT catalog availability, NOT the date a show
or film arrived on Netflix/Prime/Hulu/Stan. Never claim a premiere date from
the provider feed. Only names, image paths and IDs belonging to the SAME TMDb
item are combined. API credentials remain inside GitHub Actions.
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

REGIONS = ('US', 'GB', 'ES', 'AU')
LANGUAGES = {'en','es','fr','de','it','pt','nl','sv','no','da','pl','fi','ca'}
OUTPUT = pathlib.Path(__file__).resolve().parents[1] / 'data' / 'streaming.json'
DISCOVER_PAGES = 3
MAX_DETAILS_PER_KIND = 180
MAX_ITEMS_PER_KIND = 125
MIN_VOTES = 5
LOOKBACK_FILMS_DAYS = 900
LOOKBACK_TV_DAYS = 540
# Providers are sourced dynamically from TMDb; no fragile, invented provider IDs.
MONETIZATION = 'flatrate|free|ads'


def providers_by_region(raw: dict) -> dict:
    found: dict[str, list[dict]] = {}
    for region in REGIONS:
        entry = (raw.get('results') or {}).get(region) or {}
        seen: set[int] = set()
        options = []
        for mode in ('flatrate', 'free', 'ads'):
            for p in entry.get(mode) or []:
                pid = p.get('provider_id')
                if not isinstance(pid, int) or pid <= 0 or pid in seen:
                    continue
                name = str(p.get('provider_name') or '').strip()
                if not name:
                    continue
                seen.add(pid)
                options.append({
                    'id': pid, 'name': name, 'logo': p.get('logo_path'),
                    'type': 'subscription' if mode == 'flatrate' else mode,
                })
        if options:
            found[region] = sorted(options, key=lambda p: (p['type'] != 'subscription', p['name'].casefold()))
    return found


def qualify_movie(detail: dict, today: dt.date) -> bool:
    release = parse_date(detail.get('release_date'))
    if not release or release > today:
        return False
    if release < today - dt.timedelta(days=LOOKBACK_FILMS_DAYS):
        return False
    if detail.get('adult') or detail.get('original_language') not in LANGUAGES:
        return False
    return True


def qualify_tv(detail: dict, today: dt.date) -> bool:
    if detail.get('adult') or detail.get('original_language') not in LANGUAGES:
        return False
    # Recent season/episode activity OR newly premiered streaming series.
    last = parse_date(detail.get('last_air_date'))
    first = parse_date(detail.get('first_air_date'))
    upcoming = parse_date((detail.get('next_episode_to_air') or {}).get('air_date'))
    earliest = today - dt.timedelta(days=LOOKBACK_TV_DAYS)
    return bool((last and earliest <= last <= today) or
                (first and earliest <= first <= today) or
                (upcoming and today <= upcoming <= today + dt.timedelta(days=90)))


def build_catalog(token: str, today: dt.date | None = None) -> dict:
    today = today or dt.datetime.now(dt.timezone.utc).date()
    film_cutoff = (today - dt.timedelta(days=LOOKBACK_FILMS_DAYS)).isoformat()
    series_cutoff = (today - dt.timedelta(days=LOOKBACK_TV_DAYS)).isoformat()
    catalogs = {}
    for media in ('movie', 'tv'):
        candidates: dict[int, dict] = {}
        for region in REGIONS:
            for page in range(1, DISCOVER_PAGES + 1):
                params: dict[str, Any] = {
                    'language': 'en-US', 'watch_region': region,
                    'with_watch_monetization_types': MONETIZATION,
                    'sort_by': 'popularity.desc', 'include_adult': 'false', 'page': page,
                }
                if media == 'movie':
                    params['primary_release_date.gte'] = film_cutoff
                    params['primary_release_date.lte'] = today.isoformat()
                else:
                    params['air_date.gte'] = series_cutoff
                    params['air_date.lte'] = today.isoformat()
                data = fetch_json(f'/discover/{media}', token, **params)
                rows = data.get('results') or []
                for obj in rows:
                    ident = obj.get('id')
                    if not isinstance(ident, int) or obj.get('original_language') not in LANGUAGES:
                        continue
                    if obj.get('adult') or (int(obj.get('vote_count') or 0) < MIN_VOTES and
                                           float(obj.get('popularity') or 0) < 8):
                        continue
                    candidates.setdefault(ident, obj)
                if not rows or page >= int(data.get('total_pages') or 1):
                    break
                time.sleep(.11)

        ranked = sorted(candidates.values(),
                        key=lambda x: (float(x.get('popularity') or 0), int(x.get('vote_count') or 0)),
                        reverse=True)[:MAX_DETAILS_PER_KIND]
        items = []
        for idx, base in enumerate(ranked, 1):
            ident = base['id']
            details = fetch_json(f'/{media}/{ident}', token, language='en-US')
            valid = qualify_movie(details, today) if media == 'movie' else qualify_tv(details, today)
            if not valid:
                continue
            provider_raw = fetch_json(f'/{media}/{ident}/watch/providers', token)
            available = providers_by_region(provider_raw)
            if not available:
                continue
            name = details.get('title' if media == 'movie' else 'name') or base.get('title' if media == 'movie' else 'name')
            if not name:
                continue
            date_value = (details.get('release_date') if media == 'movie' else
                          details.get('last_air_date') or details.get('first_air_date')) or ''
            items.append({
                'id': ident, 'media_type': media, 'title': str(name),
                'original_title': str(details.get('original_title' if media == 'movie' else 'original_name') or ''),
                'year': str((details.get('release_date') if media == 'movie' else
                              details.get('first_air_date')) or '')[:4],
                'date': str(date_value)[:10],
                'date_label': 'original film release' if media == 'movie' else 'latest TV air date',
                'poster_path': details.get('poster_path') or base.get('poster_path'),
                'backdrop_path': details.get('backdrop_path') or base.get('backdrop_path'),
                'overview': str(details.get('overview') or '')[:850],
                'genres': [g['name'] for g in details.get('genres') or [] if g.get('name')],
                'rating': round(float(details.get('vote_average') or 0), 1),
                'votes': int(details.get('vote_count') or 0),
                'popularity': round(float(details.get('popularity') or 0), 2),
                'providers': available,
            })
            if idx % 30 == 0:
                print(f'{media}: validated {idx}/{len(ranked)}; selected {len(items)}', flush=True)
            if len(items) >= MAX_ITEMS_PER_KIND:
                break
            time.sleep(.11)
        if not items:
            raise ValueError(f'Empty {media} streaming catalog: retaining previous publication')
        catalogs['movies' if media == 'movie' else 'shows'] = items

    services: dict[str, dict] = {}
    for media in ('movies', 'shows'):
        for item in catalogs[media]:
            for region, providers in item['providers'].items():
                for p in providers:
                    k = str(p['id'])
                    if k not in services:
                        services[k] = {'id': p['id'], 'name': p['name'],
                                       'logo': p['logo'], 'regions': []}
                    if region not in services[k]['regions']:
                        services[k]['regions'].append(region)
    return {
        'schema_version': 1, 'status': 'ready',
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'source': 'TMDb watch/providers (JustWatch)',
        'countries': list(REGIONS), 'offer_types': ['subscription', 'free', 'ads'],
        'date_warning': 'Provider listings reflect current reported availability; no service debut date is supplied. Film year and TV episode dates are not streaming premiere dates.',
        'movies': catalogs['movies'], 'shows': catalogs['shows'],
        'services': sorted(services.values(), key=lambda p: p['name'].casefold()),
    }


def main() -> int:
    token = os.environ.get('TMDB_READ_ACCESS_TOKEN', '').strip()
    if not token:
        raise RuntimeError('GitHub Actions secret TMDB_READ_ACCESS_TOKEN missing')
    data = build_catalog(token)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=OUTPUT.parent,
                                     prefix='.stream.', suffix='.tmp', delete=False) as out:
        json.dump(data, out, ensure_ascii=False, separators=(',', ':'))
        filename = out.name
    os.replace(filename, OUTPUT)
    print(f"Streaming catalog saved: {len(data['movies'])} movies, {len(data['shows'])} series, {len(data['services'])} providers", flush=True)


if __name__ == '__main__':
    main()
