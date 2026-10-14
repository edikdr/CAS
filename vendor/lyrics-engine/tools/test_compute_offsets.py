"""Offline tests for compute_offsets.py (no network, no Whisper).

    python -m unittest lyrics-engine/tools/test_compute_offsets.py

Lyrics here are generated nonsense syllables, not text from any song.
"""
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import compute_offsets as co  # noqa: E402

SYL = ["ka", "lo", "mi", "ren", "tu", "va", "so", "pex", "dor", "lin", "zu", "fae", "mor", "tis", "qua", "bel"]


def fake_song(seed=1, lines=40, repeat_chorus=False):
    rnd = random.Random(seed)
    words = lambda k: " ".join("".join(rnd.choice(SYL) for _ in range(rnd.randint(1, 3))) for _ in range(k))
    chorus = [words(rnd.randint(4, 7)) for _ in range(4)]
    rows, t = [], 8.0
    for i in range(lines):
        if repeat_chorus and i % 12 in (6, 7, 8, 9):
            text = chorus[i % 12 - 6]
        else:
            text = words(rnd.randint(4, 8))
        rows.append(f"[{int(t // 60):02d}:{t % 60:05.2f}]{text}")
        t += rnd.uniform(2.6, 4.2)
        if i % 9 == 8:
            rows.append(f"[{int(t // 60):02d}:{t % 60:05.2f}]")
            t += rnd.uniform(3, 6)
    return co.parse_lrc("\n".join(rows))


def fake_preview(lines, start, length=30.0, seed=2, drop=0.15, typo=0.1, jitter=0.25):
    rnd = random.Random(seed)
    out = []
    for w in co.lyric_words(lines):
        if start <= w.t < start + length and rnd.random() > drop:
            tok = w.token
            if rnd.random() < typo and len(tok) > 3:
                tok = tok[:-1] + "e"
            out.append((tok, max(0.0, w.t - start + rnd.uniform(-jitter, jitter))))
    return out


class LrcTests(unittest.TestCase):
    def test_parse(self):
        lines = co.parse_lrc("[ar:x]\n[00:01.5][00:10.250]ab cd\n[00:05]\n[00:03.07]ef")
        self.assertEqual([l.t for l in lines], [1.5, 3.07, 5.0, 10.25])
        self.assertTrue(co.is_break(lines[2].text))

    def test_clean_title(self):
        self.assertEqual(co.clean_title("Don’t Stop (Remastered 2011)"), "dont stop")
        self.assertEqual(co.clean_title("Name - 2009 Remaster"), "name")
        self.assertEqual(co.clean_title("Name feat. Someone"), "name")


class AlignTests(unittest.TestCase):
    def test_finds_offset(self):
        lines = fake_song(seed=3)
        for start in (20.0, 47.3, 81.9):
            m = co.locate_offset(lines, fake_preview(lines, start, seed=int(start)))
            self.assertIsNotNone(m)
            self.assertAlmostEqual(m.offset, start, delta=0.6, msg=m.detail)
            self.assertGreaterEqual(m.confidence, 0.6, m.detail)

    def test_garbage_is_low_confidence(self):
        lines = fake_song(seed=4)
        rnd = random.Random(9)
        heard = [("".join(rnd.choice("xyzwq") for _ in range(5)), i * 0.5) for i in range(40)]
        m = co.locate_offset(lines, heard)
        self.assertTrue(m is None or m.confidence < 0.6)

    def test_repeated_chorus_is_ambiguous(self):
        lines = fake_song(seed=5, lines=36, repeat_chorus=True)
        # a preview that holds only the chorus, which occurs three times
        chorus_start = [l.t for l in lines][6]
        heard = fake_preview(lines, chorus_start, length=11.0, drop=0.0, typo=0.0, jitter=0.0)
        m = co.locate_offset(lines, heard)
        self.assertTrue(m is None or m.confidence < 0.6, m and m.detail)


if __name__ == "__main__":
    unittest.main()
