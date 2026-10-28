"""Execute the actual homologation environment generator with synthetic inputs."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit, parse_qs

SOURCE=Path(__file__).resolve().parents[1]/'vendi04-homologate-candidate.sh'
CODE=SOURCE.read_text().split("<<'PY'\n",1)[1].split('\nPY\n',1)[0]

class HomologEnvironment(unittest.TestCase):
    def fixture(self,homolog,prod):
        def env(value): return {'Config':{'Env':[k+'='+v for k,v in value.items()]}}
        return {'vendorai-homolog-api':env(homolog),'vendorai-prod-api-candidate':env(prod),
                'vendorai-mcp-novo':env({'BROWSER_MCP_ACCESS_TOKEN':'synthetic-token'}),
                'vendorai-homolog-db':{'State':{'Running':True},'NetworkSettings':{'Networks':{'vendorai-homolog':{'Aliases':['vendorai-homolog-db']}}}}}
    def generate(self,fixture):
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'env'
            with patch('sys.argv',['generator',str(target)]), patch('subprocess.check_output',side_effect=lambda args,**kw:json.dumps([fixture[args[-1]]])), contextlib.redirect_stdout(io.StringIO()):
                exec(compile(CODE,str(SOURCE),'exec'),{})
            return dict(line.split('=',1) for line in target.read_text().splitlines())
    def test_effective_app_url_wins_over_safe_looking_fallback(self):
        fixture=self.fixture({'DATABASE_URL':'postgres://user@vendorai-homolog-db/homolog','APP_DATABASE_URL':'postgres://user@prod/db'}, {'DATABASE_URL':'postgres://user@prod/db'})
        with self.assertRaisesRegex(SystemExit,'HOMOLOG_USES_PRODUCTION_DATABASE'): self.generate(fixture)
    def test_external_alias_is_not_a_proof_of_isolation(self):
        fixture=self.fixture({'SUPABASE_DATABASE_URL':'postgres://user@alias.supabase.co/db'}, {'DATABASE_URL':'postgres://user@prod/db'})
        with self.assertRaisesRegex(SystemExit,'HOMOLOG_DATABASE_NOT_LOCAL_ISOLATED'): self.generate(fixture)
    def test_all_runtime_urls_use_local_db_and_readonly_sessions(self):
        result=self.generate(self.fixture({'DATABASE_URL':'postgres://user@vendorai-homolog-db/homolog'}, {'DATABASE_URL':'postgres://user@prod/db'}))
        self.assertEqual(result['DATABASE_URL'],result['APP_DATABASE_URL'])
        self.assertEqual(result['DATABASE_URL'],result['SUPABASE_DATABASE_URL'])
        self.assertIn('default_transaction_read_only=on',parse_qs(urlsplit(result['DATABASE_URL']).query)['options'][0])
        self.assertEqual(result['VENDORAI_DISABLE_BACKGROUND_JOBS'],'true')
        self.assertEqual(result['VENDORAI_HOMOLOGATION_SEED'],'true')

if __name__=='__main__': unittest.main(verbosity=2)
