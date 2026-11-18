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


class ScholarUpdateError(RuntimeError):
    """The response does not contain a usable public citation total."""


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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        stats = update(args.output)
    except (ScholarUpdateError, UnicodeError, OSError) as error:
        print("Scholar update failed. Existing data remains unchanged. " + str(error), file=sys.stderr)
        return 1
    print("Citations: " + str(stats["citations"]) + ". Updated: " + stats["updated_at"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
