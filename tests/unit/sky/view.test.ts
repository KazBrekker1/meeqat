import { describe, expect, test } from "bun:test";
import { FOV_MAX, FOV_MIN, camera, fovForK, kForFov, pan, pick, project, projectAll, unproject, zoomAt } from "../../../app/utils/sky/view";
import { RAD, altAzOf, angleBetween, vecFromAltAz, type Mat3 } from "../../../app/utils/sky/vec";

const W = 1000, H = 600;
const cam = camera(30 * RAD, 200 * RAD, kForFov(100, W), W / 2, H / 2, W, H);
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe("projection", () => {
  test("the view centre lands on (cx, cy)", () => {
    const p = [0, 0];
    expect(project(cam, vecFromAltAz(30 * RAD, 200 * RAD), p)).toBe(true);
    expect(p[0]).toBeCloseTo(W / 2, 6);
    expect(p[1]).toBeCloseTo(H / 2, 6);
  });

  test("zenith-up: higher in the sky is higher on screen; east of south-west is to the left", () => {
    const p = [0, 0], q = [0, 0];
    project(cam, vecFromAltAz(40 * RAD, 200 * RAD), p);
    project(cam, vecFromAltAz(30 * RAD, 190 * RAD), q);
    expect(p[1]!).toBeLessThan(H / 2);
    expect(q[0]!).toBeLessThan(W / 2);
  });

  test("project → unproject round-trips across the screen", () => {
    for (const [x, y] of [[0, 0], [W, H], [123, 456], [W / 2, 10]]) {
      const p = [0, 0];
      expect(project(cam, unproject(cam, x!, y!), p)).toBe(true);
      expect(p[0]).toBeCloseTo(x!, 6);
      expect(p[1]).toBeCloseTo(y!, 6);
    }
  });

  test("a direction straight behind the viewer is not drawn", () => {
    expect(project(cam, vecFromAltAz(-30 * RAD, 20 * RAD), [0, 0])).toBe(false);
  });

  test("the field of view spans the width", () => {
    const left = unproject(cam, 0, H / 2), right = unproject(cam, W, H / 2);
    expect(angleBetween(left, right) / RAD).toBeCloseTo(100, 6);
    expect(fovForK(kForFov(73, W), W)).toBeCloseTo(73, 9);
  });
});

describe("pan and zoom", () => {
  test("dragging right turns the view toward the east (azimuth down)", () => {
    const v = pan({ alt: 0, az: Math.PI, fovDeg: 100 }, 100, 0, W);
    expect(v.az).toBeLessThan(Math.PI);
    expect(v.alt).toBe(0);
  });

  test("dragging down looks higher, and altitude stops short of the zenith", () => {
    expect(pan({ alt: 0, az: 0, fovDeg: 100 }, 0, 100, W).alt).toBeGreaterThan(0);
    expect(pan({ alt: 80 * RAD, az: 0, fovDeg: 100 }, 0, 10000, W).alt).toBeCloseTo(89.5 * RAD, 9);
  });

  test("zoomAt keeps the sky under the pointer within 0.5°", () => {
    const v = { alt: 30 * RAD, az: 200 * RAD, fovDeg: 100 };
    const before = unproject(camera(v.alt, v.az, kForFov(v.fovDeg, W), W / 2, H / 2, W, H), 800, 150);
    const z = zoomAt(v, 0.5, 800, 150, W / 2, H / 2, W, H);
    const after = unproject(camera(z.alt, z.az, kForFov(z.fovDeg, W), W / 2, H / 2, W, H), 800, 150);
    expect(z.fovDeg).toBe(50);
    expect(angleBetween(before, after) / RAD).toBeLessThan(0.5);
  });

  test("zoom is clamped", () => {
    expect(zoomAt({ alt: 0, az: 0, fovDeg: 30 }, 0.1, 500, 300, 500, 300, W, H).fovDeg).toBe(FOV_MIN);
    expect(zoomAt({ alt: 0, az: 0, fovDeg: 150 }, 3, 500, 300, 500, 300, W, H).fovDeg).toBe(FOV_MAX);
  });
});

describe("pick", () => {
  const dirs = new Float32Array([...vecFromAltAz(30 * RAD, 200 * RAD), ...vecFromAltAz(30.4 * RAD, 200 * RAD), ...vecFromAltAz(-30 * RAD, 20 * RAD)]);
  const xy = projectAll(cam, IDENTITY, dirs, new Float32Array(6));
  const base = { starXY: xy, starMag: new Float32Array([4, 0.5, 1]), vertXY: xy, segments: new Uint16Array([0, 1]), radius: 11, segRadius: 7 };

  test("hidden directions are NaN", () => expect(Number.isNaN(xy[4]!)).toBe(true));

  test("a body wins over a star under the pointer", () => {
    expect(pick({ ...base, x: W / 2, y: H / 2, bodies: [{ x: W / 2 + 3, y: H / 2 }] })).toEqual({ kind: "body", index: 0 });
  });

  test("between two close stars, the brighter one wins", () => {
    const midY = (xy[1]! + xy[3]!) / 2;
    expect(pick({ ...base, x: W / 2, y: midY, bodies: [] })).toEqual({ kind: "star", index: 1 });
  });

  test("away from stars, the nearest figure segment is picked", () => {
    const far = { ...base, starMag: new Float32Array([9, 9, 9]), radius: 0.5 };
    expect(pick({ ...far, x: xy[0]! + 4, y: (xy[1]! + xy[3]!) / 2, bodies: [] })).toEqual({ kind: "segment", index: 0 });
  });

  test("nothing nearby → null", () => {
    expect(pick({ ...base, x: 5, y: 5, bodies: [] })).toBeNull();
  });
});

test("altAzOf inverts vecFromAltAz", () => {
  const { alt, az } = altAzOf(vecFromAltAz(12 * RAD, 345 * RAD));
  expect(alt / RAD).toBeCloseTo(12, 9);
  expect(az / RAD).toBeCloseTo(345, 9);
});
