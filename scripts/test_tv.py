import datetime as dt
import unittest
from unittest.mock import patch
import update_tv as tv


class TVCatalogTests(unittest.TestCase):
    def test_matching_title_exact_not_wrong_spin_off(self):
        rows = [{'id': 10, 'name': 'Sheldon', 'original_name': 'Sheldon'},
                {'id': 11, 'name': "Georgie & Mandy's First Marriage", 'original_name': "Georgie & Mandy's First Marriage"}]
        self.assertEqual(tv.matching_search_result("Georgie & Mandy’s First Marriage", rows)['id'], 11)
        self.assertIsNone(tv.matching_search_result('Young Sheldon', rows))

    def test_episode_keys_stable_and_unique(self):
        a = {'season_number': 3, 'episode_number': 5}
        self.assertEqual(tv.episode_key(a), 's03e05')
        self.assertEqual(tv.episode_key(a), tv.episode_key(dict(a)))

    def test_air_date_filters_future_and_scheduled(self):
        season = {'episodes': [
            {'id': 1, 'season_number': 1, 'episode_number': 1, 'name':'Released',
             'air_date':'2026-10-08'},
            {'id': 2, 'season_number': 1, 'episode_number': 2, 'name':'Upcoming',
             'air_date':'2026-10-22'},
            {'id': 3, 'season_number': 1, 'episode_number': 3, 'name':'Far away',
             'air_date':'2027-12-01'},
            {'id': 4, 'season_number': 1, 'episode_number': 4, 'name':'Unknown',
             'air_date':None},
            {'id': 5, 'season_number': 0, 'episode_number': 1, 'name':'Special',
             'air_date':'2026-10-15'},
        ]}
        rows = tv.clean_episodes(season, dt.date(2026, 10, 16))
        self.assertEqual([e['key'] for e in rows], ['s01e01', 's01e02'])
        self.assertEqual(rows[0]['air_date'], '2026-10-08')

    @patch('update_tv.time.sleep')
    @patch('update_tv.fetch_json')
    def test_show_preserves_episode_name_number_and_dates(self, fetch, sleep):
        fetch.return_value = {'episodes': [
            {'id': 12, 'season_number': 3, 'episode_number': 2,
             'name':'The Second Episode', 'air_date':'2026-10-15'}
        ]}
        detail = {'id': 77, 'name': 'Current Series', 'seasons':[{'season_number':3}],
                  'status':'Returning Series', 'genres':[{'name':'Comedy'}]}
        show = tv.build_show(detail, 'FAKE', dt.date(2026, 10, 16))
        self.assertEqual(show['last_air_date'], '2026-10-15')
        self.assertEqual(show['episodes'][0]['name'], 'The Second Episode')
        self.assertEqual(show['episodes'][0]['key'], 's03e02')

    @patch('update_tv.time.sleep')
    @patch('update_tv.fetch_json')
    def test_curated_titles_survive_old_last_air_date(self, fetch, sleep):
        def stub(path, token, **kwargs):
            if path == '/search/tv':
                name = kwargs['query']
                return {'results': [{'id': 42, 'name': name, 'original_language':'en', 'popularity':6}]}
            if path in ('/tv/on_the_air', '/trending/tv/week'):
                return {'results': [], 'total_pages':1}
            if path == '/tv/42':
                return {'id':42, 'name':'Old Show', 'original_language':'en',
                        'last_air_date':'2019-05-01', 'seasons':[{'season_number':12}]}
            if path == '/tv/42/season/12':
                return {'episodes':[{'id':9,'season_number':12,'episode_number':1,
                                    'air_date':'2019-01-01', 'name':'Old episode'}]}
            raise AssertionError(path)
        fetch.side_effect = stub
        result = tv.build_catalog('FAKE', dt.date(2026, 10, 16))
        self.assertEqual(len(result['shows']), 1)
        self.assertEqual(result['shows'][0]['id'], 42)


if __name__ == '__main__':
    unittest.main()
