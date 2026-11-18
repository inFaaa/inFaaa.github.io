import importlib.util
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta, timezone
import io
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
    def cached_stats(self, age_hours=1):
        return {
            "scholar_id": scholar.SCHOLAR_ID,
            "profile_url": scholar.PROFILE_URL,
            "citations": 3533,
            "updated_at": (datetime.now(timezone.utc) - timedelta(hours=age_hours))
                .isoformat(timespec="seconds").replace("+00:00", "Z"),
        }

    def run_cli(self, stats, fetch_error=None, html=PROFILE, use_cache=True):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stats.json"
            summary = Path(directory) / "summary.md"
            before = json.dumps(stats, indent=2) + "\n"
            output.write_text(before)
            stdout, stderr = io.StringIO(), io.StringIO()
            arguments = ["--output", str(output)]
            if use_cache:
                arguments.append("--use-fresh-cache-if-blocked")
            with patch.object(scholar, "fetch_profile", side_effect=fetch_error, return_value=html):
                with patch.dict(scholar.os.environ, {
                    "GITHUB_ACTIONS": "true", "GITHUB_STEP_SUMMARY": str(summary),
                }):
                    with redirect_stdout(stdout), redirect_stderr(stderr):
                        result = scholar.main(arguments)
            return {
                "exit_code": result, "before": before, "after": output.read_text(),
                "stdout": stdout.getvalue(), "stderr": stderr.getvalue(),
                "summary": summary.read_text() if summary.exists() else "",
            }

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

    def test_explicit_blocks_do_not_retry(self):
        for status in (403, 429):
            with self.subTest(status=status):
                error = HTTPError(scholar.PROFILE_URL, status, "Request blocked", None, None)
                with patch.object(scholar, "urlopen", side_effect=error) as request:
                    with patch.object(scholar.time, "sleep") as sleep:
                        with self.assertRaises(scholar.ScholarBlockedError) as raised:
                            scholar.fetch_profile()
                self.assertEqual(raised.exception.status, status)
                self.assertEqual(request.call_count, 1)
                sleep.assert_not_called()

    def test_blocked_cloud_request_accepts_fresh_cache_without_rewriting_it(self):
        for status in (403, 429):
            with self.subTest(status=status):
                stats = self.cached_stats()
                result = self.run_cli(stats, fetch_error=scholar.ScholarBlockedError(status))
                self.assertEqual(result["exit_code"], 0)
                self.assertEqual(result["before"], result["after"])
                self.assertIn("::warning", result["stdout"])
                self.assertIn("Fetch blocked; validated cached result", result["summary"])
                self.assertIn("HTTP " + str(status), result["summary"])
                self.assertIn("**3,533**", result["summary"])
                self.assertIn(stats["updated_at"], result["summary"])
                self.assertIn("did not obtain a new citation count", result["summary"])
                self.assertIn("Mac LaunchAgent", result["summary"])

    def test_stale_and_future_cache_remain_failures(self):
        for age_hours in (49, -1):
            with self.subTest(age_hours=age_hours):
                result = self.run_cli(self.cached_stats(age_hours), fetch_error=scholar.ScholarBlockedError(403))
                self.assertEqual(result["exit_code"], 1)
                self.assertEqual(result["before"], result["after"])
                self.assertEqual(result["summary"], "")

    def test_invalid_cached_identity_count_and_date_remain_failures(self):
        for key, value in [
            ("scholar_id", "another-profile"), ("profile_url", "https://example.com/"),
            ("citations", "3533"), ("citations", True), ("citations", -1),
            ("updated_at", "2026-02-30T00:00:00Z"),
        ]:
            with self.subTest(key=key, value=value):
                stats = self.cached_stats()
                stats[key] = value
                result = self.run_cli(stats, fetch_error=scholar.ScholarBlockedError(403))
                self.assertEqual(result["exit_code"], 1)
                self.assertEqual(result["before"], result["after"])

    def test_missing_cache_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(scholar.ScholarUpdateError):
                scholar.read_fresh_cache(Path(directory) / "missing.json")

    def test_default_local_mode_remains_strict_on_google_blocks(self):
        result = self.run_cli(self.cached_stats(), fetch_error=scholar.ScholarBlockedError(403), use_cache=False)
        self.assertEqual(result["exit_code"], 1)
        self.assertEqual(result["before"], result["after"])
        self.assertEqual(result["summary"], "")

    def test_other_fetch_and_parser_errors_cannot_use_cache(self):
        cases = [
            {"fetch_error": scholar.ScholarUpdateError("Network request failed.")},
            {"fetch_error": scholar.ScholarUpdateError("Google returned HTTP 500.")},
            {"html": "<html>Unexpected or blocked response</html>"},
        ]
        for kwargs in cases:
            with self.subTest(kwargs=kwargs):
                result = self.run_cli(self.cached_stats(), **kwargs)
                self.assertEqual(result["exit_code"], 1)
                self.assertEqual(result["before"], result["after"])
                self.assertEqual(result["summary"], "")

    def test_successful_cloud_fetch_writes_a_new_result_and_accurate_summary(self):
        result = self.run_cli(self.cached_stats())
        self.assertEqual(result["exit_code"], 0)
        self.assertNotEqual(result["before"], result["after"])
        self.assertEqual(json.loads(result["after"])["citations"], 3533)
        self.assertIn("Scholar citation count refreshed", result["summary"])
        self.assertNotIn("cached", result["summary"])


if __name__ == "__main__":
    unittest.main()
