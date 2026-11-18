#!/usr/bin/env python3
"""Read the public Scholar citation total and save the last successful result."""

import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


SCHOLAR_ID = "2t7iBnkAAAAJ"
PROFILE_URL = "https://scholar.google.com/citations?user=" + SCHOLAR_ID + "&hl=en"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "data" / "scholar-stats.json"
MAX_RESPONSE_BYTES = 2_000_000
RETRY_HTTP_CODES = {500, 502, 503, 504}
MAX_CACHE_AGE_SECONDS = 48 * 60 * 60


class ScholarUpdateError(RuntimeError):
    """The response does not contain a usable public citation total."""


class ScholarBlockedError(ScholarUpdateError):
    """Google explicitly declined the request; do not retry the block."""

    def __init__(self, status):
        self.status = status
        super().__init__("Google returned HTTP " + str(status) + ".")


class CitationTableParser(HTMLParser):
    """Read cells only from the Scholar statistics table."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.table_depth = 0
        self.table_count = 0
        self.completed = False
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            if self.table_depth:
                self.table_depth += 1
            elif attrs.get("id") == "gsc_rsb_st":
                self.table_depth = 1
                self.table_count += 1
        if self.table_depth != 1:
            return
        if tag == "tr":
            self.row = []
        elif tag in {"td", "th"} and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.table_depth == 1 and self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag == "table" and self.table_depth:
            self.table_depth -= 1
            if not self.table_depth:
                self.completed = True
            return
        if self.table_depth != 1:
            return
        if tag in {"td", "th"} and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def parse_citations(html):
    parser = CitationTableParser()
    parser.feed(html)
    parser.close()
    if parser.table_count != 1 or not parser.completed:
        raise ScholarUpdateError("The Scholar statistics table is missing or incomplete.")
    if not parser.rows or len(parser.rows[0]) < 3 or parser.rows[0][1] != "All":
        raise ScholarUpdateError("The Scholar statistics columns changed.")
    citation_rows = [row for row in parser.rows if row and row[0] == "Citations"]
    if len(citation_rows) != 1 or len(citation_rows[0]) < 3:
        raise ScholarUpdateError("The Scholar citation row is missing or ambiguous.")
    value = citation_rows[0][1]
    if not re.fullmatch(r"(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)", value):
        raise ScholarUpdateError("The Scholar citation total is not an integer.")
    citations = int(value.replace(",", ""))
    if citations > 1_000_000_000:
        raise ScholarUpdateError("The Scholar citation total is outside the expected range.")
    return citations


def validate_profile_url(url):
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "scholar.google.com"
        or parsed.path != "/citations"
        or query.get("user") != [SCHOLAR_ID]
    ):
        raise ScholarUpdateError("Google returned a different page or profile.")


def fetch_profile():
    request = Request(
        PROFILE_URL,
        headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                validate_profile_url(response.geturl())
                if response.headers.get_content_type() != "text/html":
                    raise ScholarUpdateError("Google did not return an HTML profile.")
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise ScholarUpdateError("The Scholar response exceeds the size limit.")
                return body.decode(response.headers.get_content_charset() or "utf-8")
        except HTTPError as error:
            if error.code in {403, 429}:
                raise ScholarBlockedError(error.code) from error
            if error.code not in RETRY_HTTP_CODES or attempt == 2:
                raise ScholarUpdateError("Google returned HTTP " + str(error.code) + ".") from error
        except (TimeoutError, URLError) as error:
            reason = getattr(error, "reason", error)
            if not isinstance(reason, (TimeoutError, ConnectionError)) or attempt == 2:
                raise ScholarUpdateError("The Scholar profile request failed.") from error
        time.sleep(2 ** (attempt + 1))
    raise ScholarUpdateError("The Scholar profile request failed.")


def write_stats(output, stats):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent,
            prefix="." + output.name + ".", suffix=".tmp", delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(stats, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def update(output=DEFAULT_OUTPUT):
    citations = parse_citations(fetch_profile())
    stats = {
        "scholar_id": SCHOLAR_ID,
        "profile_url": PROFILE_URL,
        "citations": citations,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    }
    write_stats(output, stats)
    return stats


def read_fresh_cache(output, now=None):
    """Validate a recent successful result without rewriting it or its timestamp."""
    try:
        stats = json.loads(Path(output).read_text(encoding="utf-8"))
    except (ValueError, OSError) as error:
        raise ScholarUpdateError("The cached Scholar data could not be read.") from error
    if not isinstance(stats, dict) or stats.get("scholar_id") != SCHOLAR_ID or stats.get("profile_url") != PROFILE_URL:
        raise ScholarUpdateError("The cached Scholar profile identity does not match.")
    citations = stats.get("citations")
    if type(citations) is not int or not 0 <= citations <= 1_000_000_000:
        raise ScholarUpdateError("The cached Scholar citation total is invalid.")
    timestamp = stats.get("updated_at")
    if not isinstance(timestamp, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", timestamp):
        raise ScholarUpdateError("The cached Scholar timestamp is invalid.")
    try:
        updated_at = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ScholarUpdateError("The cached Scholar timestamp is invalid.") from error
    age = ((now or datetime.now(timezone.utc)) - updated_at).total_seconds()
    if age < 0 or age > MAX_CACHE_AGE_SECONDS:
        raise ScholarUpdateError("The cached Scholar data is older than 48 hours or dated in the future.")
    return stats


def report_result(stats, blocked_status=None):
    count = format(stats["citations"], ",")
    timestamp = stats["updated_at"]
    if blocked_status is not None:
        message = (
            "Fetch blocked; validated cached result. Google Scholar returned HTTP "
            + str(blocked_status) + ". Cached citations: " + count
            + ". Last successful fetch: " + timestamp
            + ". Daily updates run on the Mac LaunchAgent; the cached timestamp is unchanged."
        )
        prefix = "::warning title=Google Scholar fetch blocked::" if os.environ.get("GITHUB_ACTIONS") == "true" else ""
        print(prefix + message)
        summary = (
            "### Fetch blocked; validated cached result\n\n"
            "Google Scholar returned HTTP " + str(blocked_status)
            + ". This run did not obtain a new citation count.\n\n"
            "- Validated cached total: **" + count + "**\n"
            "- Last successful Scholar fetch (UTC): `" + timestamp + "`\n"
            "- Maximum accepted cache age: **48 hours**\n\n"
            "Daily updates run on the Mac LaunchAgent. The cached data and its original timestamp were left unchanged.\n"
        )
    else:
        print("Citations: " + str(stats["citations"]) + ". Updated: " + timestamp)
        summary = (
            "### Scholar citation count refreshed\n\n"
            "- Citations fetched from Google Scholar: **" + count + "**\n"
            "- Successful fetch (UTC): `" + timestamp + "`\n"
        )
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with Path(summary_path).open("a", encoding="utf-8") as stream:
            stream.write(summary)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--use-fresh-cache-if-blocked", action="store_true",
        help="On HTTP 403/429 only, accept validated cached data up to 48 hours old without changing it.",
    )
    args = parser.parse_args(argv)
    blocked_status = None
    try:
        try:
            stats = update(args.output)
        except ScholarBlockedError as error:
            if not args.use_fresh_cache_if_blocked:
                raise
            blocked_status = error.status
            stats = read_fresh_cache(args.output)
    except (ScholarUpdateError, UnicodeError, OSError) as error:
        print("Scholar update failed. Existing data remains unchanged. " + str(error), file=sys.stderr)
        return 1
    report_result(stats, blocked_status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
