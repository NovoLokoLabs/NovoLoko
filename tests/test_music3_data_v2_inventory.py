from __future__ import annotations

from collections import Counter
import csv
import json
import unittest
from pathlib import Path

from test_music3_data_v2 import data_v2


ROOT = Path(__file__).resolve().parents[1]


class MusicDataV2InventoryTests(unittest.TestCase):
    def test_parent_child_coverage_before_and_after_is_auditable(self):
        with (ROOT / "csv/music3/02_subgenre_era.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as handle:
            old_names = {
                row.get("name", "").strip()
                for row in csv.DictReader(handle)
                if row.get("name", "").strip()
            }

        parents = data_v2._style_parent_map()
        before = Counter(parents[name] for name in old_names if name in parents)
        after = Counter(parents.values())
        report = {
            parent: {
                "before_flat_library_mapped": before.get(parent, 0),
                "after_hierarchical": after.get(parent, 0),
                "added_or_reclassified": after.get(parent, 0) - before.get(parent, 0),
            }
            for parent in data_v2.BROAD_GENRES
        }

        print("MUSIC_DATA_V2_PARENT_COUNTS=" + json.dumps(report, sort_keys=True))
        self.assertGreater(after["Pop"], before["Pop"])
        self.assertGreater(after["Rock"], before["Rock"])
        self.assertGreater(after["Metal"], before["Metal"])
        self.assertGreater(after["Electronic"], before["Electronic"])
        self.assertGreater(after["R&B / Soul"], before["R&B / Soul"])
        self.assertGreaterEqual(min(after[parent] for parent in ("Pop", "Rock", "Metal", "Hip-Hop / Rap", "Electronic")), 14)


if __name__ == "__main__":
    unittest.main()
