import datetime as dt
import unittest
from unittest.mock import patch
import update_streaming as stream


class StreamingCatalogTests(unittest.TestCase):
    def test_subscriptions_are_country_specific(self):
        sample = {'results': {
            'US': {'flatrate': [{'provider_id': 8,'provider_name':'Netflix','logo_path':'/n.png'},
                               {'provider_id': 8,'provider_name':'Netflix','logo_path':'/n.png'}],
                   'rent': [{'provider_id': 9,'provider_name':'Pay per rental'}]},
            'AU': {'flatrate':[{'provider_id':21,'provider_name':'Stan','logo_path':'/s.png'}]},
            'GB': {'buy':[{'provider_id':12,'provider_name':'Retail purchase'}]},
            'JP': {'flatrate':[{'provider_id':31,'provider_name':'Other region'}]},
        }}
        d = stream.providers_by_region(sample)
        self.assertEqual(set(d), {'US','AU'})
        self.assertEqual([p['name'] for p in d['US']], ['Netflix'])
        self.assertEqual([p['name'] for p in d['AU']], ['Stan'])
        self.assertEqual(d['US'][0]['type'], 'subscription')

    def test_excludes_old_movies_even_if_streaming_today(self):
        today=dt.date(2026,10,16)
        self.assertFalse(stream.qualify_movie({'release_date':'1999-10-15','original_language':'en'},today))
        self.assertTrue(stream.qualify_movie({'release_date':'2026-06-01','original_language':'en'},today))
        self.assertFalse(stream.qualify_movie({'release_date':'2026-11-01','original_language':'en'},today))

    def test_running_series_with_recent_episode(self):
        today=dt.date(2026,10,16)
        self.assertTrue(stream.qualify_tv({'first_air_date':'2015-01-01','last_air_date':'2026-10-02','original_language':'en'},today))
        self.assertFalse(stream.qualify_tv({'first_air_date':'2008-01-01','last_air_date':'2018-01-01','original_language':'en'},today))

    @patch('update_streaming.time.sleep')
    @patch('update_streaming.fetch_json')
    def test_provider_data_and_titles_match_single_tmdb_id(self, get, pause):
        def fake(path, token, **params):
            if path.startswith('/discover/'):
                ident = 901 if path.endswith('/movie') else 701
                return {'results':[{'id':ident,'original_language':'en','vote_count':100,'popularity':50}], 'total_pages':1}
            if path == '/movie/901':return {'id':901,'title':'New Movie','release_date':'2026-07-01','original_language':'en','poster_path':'/movie.png'}
            if path == '/tv/701':return {'id':701,'name':'New Series','first_air_date':'2026-03-01','last_air_date':'2026-10-01','original_language':'en','poster_path':'/tv.png'}
            if path.endswith('/watch/providers'):
                return {'results':{'GB':{'flatrate':[{'provider_id':8,'provider_name':'Netflix','logo_path':'/netflix.png'}]}}}
            raise AssertionError(path)
        get.side_effect = fake
        d = stream.build_catalog('FAKE',dt.date(2026,10,16))
        self.assertEqual(d['movies'][0]['id'],901)
        self.assertEqual(d['movies'][0]['poster_path'],'/movie.png')
        self.assertEqual(d['shows'][0]['id'],701)
        self.assertEqual(d['movies'][0]['providers']['GB'][0]['name'],'Netflix')
        self.assertNotIn('US', d['movies'][0]['providers'])
        self.assertIn('date_warning',d)


if __name__=='__main__':
    unittest.main()
