from __future__ import annotations

import unittest

from test_music3_data_v2 import data_v2


class MusicStyleCurationV2Tests(unittest.TestCase):
    def test_novelty_hybrids_do_not_pollute_mainstream_style_lists(self):
        parents = data_v2._style_parent_map()
        self.assertEqual("Experimental", parents["Gregorian Drill Opera"])
        self.assertEqual("Experimental", parents["Genre Roulette Mutation"])
        self.assertEqual("Rock", parents["Opera Rock"])
        self.assertEqual("Rock", parents["Gothic Post-Punk"])

    def test_pop_does_not_absorb_rock_styles_just_because_the_name_contains_pop(self):
        parents = data_v2._style_parent_map()
        self.assertEqual("Rock", parents["Britpop Swagger"])
        self.assertEqual("Rock", parents["90s Arena Alternative"])
        self.assertEqual("Punk", parents["Pop Punk"])


if __name__ == "__main__":
    unittest.main()
