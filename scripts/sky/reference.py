# Reference positions for tests/unit/sky: altitude/azimuth of bright stars, the Moon, the Sun
# and the planets from Doha at four instants, computed with astropy's built-in ephemerides
# (no network). Regenerate with:
#   uv run --no-project --with astropy python -I scripts/sky/reference.py > tests/fixtures/sky/reference.json
import json
import warnings

from astropy.utils import iers

iers.conf.auto_download = False
warnings.simplefilter("ignore")

import astropy.units as u  # noqa: E402
from astropy.coordinates import AltAz, EarthLocation, SkyCoord, get_body  # noqa: E402
from astropy.time import Time  # noqa: E402

PLACE = {"lat": 25.2854, "lng": 51.531}
INSTANTS = ["2026-10-20T00:00:00Z", "2026-10-20T06:00:00Z", "2026-10-20T12:00:00Z", "2026-10-20T18:00:00Z"]
# ICRS (≈ J2000) right ascension and declination, degrees.
STARS = {
    "Sirius": (101.28716, -16.71612),
    "Canopus": (95.98796, -52.69566),
    "Arcturus": (213.91530, 19.18241),
    "Vega": (279.23473, 38.78369),
    "Capella": (79.17233, 45.99799),
    "Betelgeuse": (88.79294, 7.40706),
    "Altair": (297.69583, 8.86832),
    "Polaris": (37.95456, 89.26411),
    "Fomalhaut": (344.41269, -29.62224),
}
BODIES = ["moon", "sun", "mercury", "venus", "mars", "jupiter", "saturn"]

loc = EarthLocation(lat=PLACE["lat"] * u.deg, lon=PLACE["lng"] * u.deg, height=0 * u.m)
out = {"place": PLACE, "instants": []}
for iso in INSTANTS:
    t = Time(iso)
    frame = AltAz(obstime=t, location=loc, pressure=0)  # no refraction
    stars = {}
    for name, (ra, dec) in STARS.items():
        h = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs").transform_to(frame)
        stars[name] = {"ra": ra, "dec": dec, "alt": round(h.alt.deg, 4), "az": round(h.az.deg, 4)}
    bodies = {}
    for b in BODIES:
        h = get_body(b, t, loc).transform_to(frame)
        bodies[b] = {"alt": round(h.alt.deg, 4), "az": round(h.az.deg, 4)}
    out["instants"].append({"iso": iso, "stars": stars, "bodies": bodies})
print(json.dumps(out, indent=1))
