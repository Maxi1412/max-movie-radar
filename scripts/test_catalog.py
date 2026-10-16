import datetime as dt
import unittest
from unittest.mock import patch
import update_catalog as updater

class PhysicalReleaseTests(unittest.TestCase):
    def test_only_physical_dated_releases(self):
        data={'release_dates': {'results': [
            {'iso_3166_1': 'US', 'release_dates': [
                {'type': 3, 'release_date': '2026-09-01T00:00:00.000Z'},
                {'type': 4, 'release_date': '2026-09-15T00:00:00.000Z'},
                {'type': 5, 'release_date': '2026-10-02T00:00:00.000Z'}]},
            {'iso_3166_1': 'GB', 'release_dates': [{'type': 5, 'release_date': '2026-11-01T00:00:00.000Z'}]},
            {'iso_3166_1': 'ES', 'release_dates': [{'type': 5, 'release_date': '2026-10-06T00:00:00.000Z'}]},
            {'iso_3166_1': 'JP', 'release_dates': [{'type': 5, 'release_date': '2026-10-06T00:00:00.000Z'}]}
        ]}}
        dates=updater.extract_physical_dates(data,'2026-06-01','2026-10-16')
        self.assertEqual(dates, {'US':'2026-10-02','ES':'2026-10-06'})
    def test_original_premiere_not_new_physical_reissue(self):
        classic = {'release_date': '1999-10-15',
                   'release_dates': {'results': [
                      {'iso_3166_1': 'US', 'release_dates': [
                        {'type': 3, 'release_date': '1999-10-15T00:00:00Z'},
                        {'type': 5, 'release_date': '2026-05-12T00:00:00Z'}]}]}}
        self.assertEqual(updater.first_film_release(classic), dt.date(1999, 10, 15))
        misleading = {'release_date': '2026-05-12',
                      'release_dates': {'results': [
                        {'iso_3166_1': 'GB', 'release_dates': [
                          {'type': 3, 'release_date': '1999-10-15T00:00:00Z'},
                          {'type': 5, 'release_date': '2026-05-18T00:00:00Z'}]}]}}
        self.assertEqual(updater.first_film_release(misleading), dt.date(1999, 10, 15))

    @patch('update_catalog.fetch_json')
    @patch('update_catalog.time.sleep')
    def test_classic_reissue_excluded_from_catalog(self,sleep,fetch):
        movies = [
            {'id': 550, 'title': 'Fight Club', 'release_date': '2026-05-18', 'original_language': 'en', 'popularity': 50, 'vote_count': 100},
            {'id': 123, 'title': 'New Film', 'release_date': '2026-10-03', 'original_language': 'en', 'popularity': 30, 'vote_count': 100},
        ]
        def mock(path, token, **kwargs):
            if path == '/genre/movie/list': return {'genres': []}
            if path == '/discover/movie':
                self.assertIn('primary_release_date.gte', kwargs)
                return {'results': movies, 'total_pages': 1}
            if path.endswith('/550'):
                return {'title': 'Fight Club', 'release_date': '1999-10-15',
                        'release_dates': {'results':[{'iso_3166_1':'GB','release_dates':[
                            {'type':5,'release_date':'2026-05-18T00:00:00Z'}]}]}}
            return {'title':'New Film', 'release_date': '2026-07-01',
                    'release_dates': {'results':[{'iso_3166_1':'US','release_dates':[
                        {'type':3,'release_date':'2026-07-01T00:00:00Z'},
                        {'type':5,'release_date':'2026-10-03T00:00:00Z'}]}]}}
        fetch.side_effect = mock
        catalog = updater.create_catalog('FAKE_TOKEN', dt.date(2026, 10, 16))
        self.assertEqual([m['title'] for m in catalog['movies']], ['New Film'])
        self.assertEqual(catalog['movies'][0]['first_release_date'], '2026-07-01')
        self.assertEqual(catalog['schema_version'], 2)

    def test_future_physical_dates_not_shown(self):
        movie = {'release_dates': {'results':[{'iso_3166_1':'US','release_dates':[
            {'type':5,'release_date':'2026-11-01T00:00:00Z'}]}]}}
        self.assertEqual(updater.extract_physical_dates(movie,'2026-01-01','2026-10-16'),{})

    def test_only_trailers_not_teasers(self):
        data={'videos': {'results':[{'site':'YouTube','type':'Teaser','key':'ignoredKey01'},
                 {'site':'YouTube','type':'Trailer','key':'validTrailer1','official':True,'iso_639_1':'en'}]}}
        self.assertEqual(updater.pick_trailer(data),'validTrailer1')
    @patch('update_catalog.fetch_json')
    @patch('update_catalog.time.sleep')
    def test_catalog_includes_only_correct_market_date(self,sleep,fetch):
        sample={'results':[{'id':123,'title':'Fixture Only','release_date':'2026-10-05','original_language':'en','popularity':20,'vote_count':220}], 'total_pages':1}
        details={'id':123,'title':'Fixture Only','release_date':'2026-02-14','overview':'A mock, not a real film','genre_names':['Drama'],'release_dates':{'results':[
            {'iso_3166_1':'US','release_dates':[{'type':3,'release_date':'2026-07-02T00:00:00Z'},{'type':5,'release_date':'2026-10-05T00:00:00Z'}]},
            {'iso_3166_1':'GB','release_dates':[{'type':4,'release_date':'2026-10-07T00:00:00Z'}]}
        ]}}
        def mock(path,token,**kwargs):
            if path=='/genre/movie/list':return {'genres':[]}
            if path=='/discover/movie':return sample
            return details
        fetch.side_effect=mock
        result=updater.create_catalog('FAKE_TOKEN',dt.date(2026,10,16))
        self.assertEqual(len(result['movies']),1)
        self.assertEqual(result['movies'][0]['physical_dates'],{'US':'2026-10-05'})
        self.assertEqual(result['coverage']['release_type'],5)

    @patch('update_catalog.fetch_json')
    @patch('update_catalog.time.sleep')
    def test_catalog_rejects_nonphysical_items(self,sleep,fetch):
        sample={'results':[{'id':42,'title':'Sample Test','release_date':'2026-09-02','original_language':'en','popularity':12,'vote_count':100}], 'total_pages':1}
        details={'id':42,'title':'Sample Test','release_date':'2026-01-10','release_dates':{'results':[{'iso_3166_1':'US','release_dates':[{'type':4,'release_date':'2026-09-02T00:00:00Z'}]}]}}
        def mock(path, token, **kwargs):
            if path=='/genre/movie/list':return {'genres':[]}
            if path=='/discover/movie':return sample
            return details
        fetch.side_effect=mock
        with self.assertRaisesRegex(ValueError, 'no validated physical releases'):
            updater.create_catalog('FAKE_TOKEN',dt.date(2026,10,16))

if __name__=='__main__':
    unittest.main()
