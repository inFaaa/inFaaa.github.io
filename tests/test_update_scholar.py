import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_scholar.py"
SPEC = importlib.util.spec_from_file_location("update_scholar", MODULE_PATH)
scholar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scholar)

PROFILE = """
<table><tr><td class="gsc_rsb_std">99999</td></tr></table>
<table id="gsc_rsb_st"><thead><tr><th></th><th>All</th><th>Since 2021</th></tr></thead>
<tbody><tr><td><a>Citations</a></td><td class="gsc_rsb_std"><span>3,533</span></td>
<td class="gsc_rsb_std">3000</td></tr>
<tr><td>h-index</td><td class="gsc_rsb_std">25</td><td>24</td></tr></tbody></table>
"""


class ScholarTests(unittest.TestCase):
    def test_all_time_total_comes_from_the_citation_row(self):
        self.assertEqual(scholar.parse_citations(PROFILE), 3533)

    def test_blocked_missing_and_changed_pages_fail(self):
        invalid = [
            "<html><h1>Unusual traffic</h1></html>",
            PROFILE.replace("3,533", "Not available"),
            PROFILE.replace("<th>All</th>", "<th>Since 2021</th>"),
            PROFILE.replace("Citations", "Publications"),
            PROFILE.rsplit("</table>", 1)[0],
            PROFILE + PROFILE,
        ]
        for html in invalid:
            with self.subTest(html=html[:80]):
                with self.assertRaises(scholar.ScholarUpdateError):
                    scholar.parse_citations(html)

    def test_redirects_to_another_profile_or_challenge_fail(self):
        scholar.validate_profile_url(scholar.PROFILE_URL)
        for url in [
            "https://scholar.google.com/sorry/index",
            "https://scholar.google.com/citations?user=wrong-profile&hl=en",
            "https://accounts.google.com/citations?user=" + scholar.SCHOLAR_ID,
        ]:
            with self.assertRaises(scholar.ScholarUpdateError):
                scholar.validate_profile_url(url)

    def test_failure_preserves_last_successful_data(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stats.json"
            previous = '{"citations": 3520, "updated_at": "2026-11-17T00:00:00Z"}\n'
            output.write_text(previous)
            with patch.object(scholar, "fetch_profile", return_value="<html>CAPTCHA</html>"):
                with self.assertRaises(scholar.ScholarUpdateError):
                    scholar.update(output)
            self.assertEqual(output.read_text(), previous)

    def test_atomic_write_failure_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stats.json"
            output.write_text("previous")
            with patch.object(scholar.os, "replace", side_effect=OSError("test failure")):
                with self.assertRaises(OSError):
                    scholar.write_stats(output, {"citations": 3533})
            self.assertEqual(output.read_text(), "previous")
            self.assertEqual(list(Path(directory).iterdir()), [output])

    def test_success_stores_count_source_and_time(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stats.json"
            with patch.object(scholar, "fetch_profile", return_value=PROFILE):
                result = scholar.update(output)
            self.assertEqual(json.loads(output.read_text()), result)
            self.assertEqual(result["citations"], 3533)
            self.assertEqual(result["scholar_id"], scholar.SCHOLAR_ID)
            self.assertEqual(result["profile_url"], scholar.PROFILE_URL)
            self.assertTrue(result["updated_at"].endswith("Z"))

    def test_rate_limit_does_not_retry(self):
        error = HTTPError(scholar.PROFILE_URL, 429, "Too Many Requests", None, None)
        with patch.object(scholar, "urlopen", side_effect=error) as request:
            with patch.object(scholar.time, "sleep") as sleep:
                with self.assertRaises(scholar.ScholarUpdateError):
                    scholar.fetch_profile()
        self.assertEqual(request.call_count, 1)
        sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
