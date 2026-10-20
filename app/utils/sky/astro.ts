// The sky for a place and instant: one rotation that takes catalogue (J2000) directions into the
// local horizon frame, plus the Moon, the Sun and the planets as horizon directions.
// Not modelled (all < 0.02°): nutation, aberration, proper motion, refraction.
import { julianDay, sunEcliptic, eclToEq, horizontal, moonView, type MoonView } from "../moon/sphere";
import { planetsAt, type Planet } from "./planets";
import { RAD, mulMat, mulVec, vecFromAltAz, type Mat3, type Vec3 } from "./vec";

const ARCSEC = RAD / 3600;

/** J2000 mean equator → mean equator of date (IAU 1976 precession; Meeus 21.2–21.4). */
export function precessionMatrix(jd: number): Mat3 {
  const T = (jd - 2451545) / 36525;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * ARCSEC;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(theta), st = Math.sin(theta);
  return [
    cz * cZ * ct - sz * sZ, -sz * cZ * ct - cz * sZ, -cZ * st,
    cz * sZ * ct + sz * cZ, -sz * sZ * ct + cz * cZ, -sZ * st,
    cz * st, -sz * st, ct,
  ];
}

/** Greenwich mean sidereal time, radians (the expression sphere.ts `horizontal` uses). */
export function gmst(jd: number): number {
  const d = (280.46061837 + 360.98564736629 * (jd - 2451545)) % 360;
  return (d < 0 ? d + 360 : d) * RAD;
}

/** Equator of date → local horizon frame (x east, y north, z up) at a place (degrees, east +). */
export function equatorToHorizon(jd: number, lat: number, lng: number): Mat3 {
  const th = gmst(jd) + lng * RAD, phi = lat * RAD;
  const ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(phi), sp = Math.sin(phi);
  return [
    -st, ct, 0,
    -sp * ct, -sp * st, cp,
    cp * ct, cp * st, sp,
  ];
}

export interface SkyState {
  /** J2000 equatorial → local horizon (x east, y north, z up). */
  rot: Mat3;
  /** The Moon as seen from the place (zenith-up tilt), with its horizon direction. */
  moon: MoonView & { dir: Vec3 };
  sun: { dir: Vec3; altDeg: number };
  planets: (Planet & { dir: Vec3 })[];
}

export function skyAt(date: Date, lat: number, lng: number): SkyState {
  const jd = julianDay(date), T = (jd - 2451545) / 36525;
  const rot = mulMat(equatorToHorizon(jd, lat, lng), precessionMatrix(jd));
  const mv = moonView(date, lat, lng);
  const s = sunEcliptic(T), se = eclToEq(s.lambda, 0, s.eps), sh = horizontal(jd, se.ra, se.dec, lat, lng);
  return {
    rot,
    moon: { ...mv, dir: vecFromAltAz(mv.altitude, mv.azimuth) },
    sun: { dir: vecFromAltAz(sh.altitude, sh.azimuth), altDeg: sh.altitude / RAD },
    planets: planetsAt(jd).map((p) => ({ ...p, dir: mulVec(rot, p.dirJ2000) })),
  };
}
