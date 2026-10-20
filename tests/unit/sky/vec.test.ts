import { describe, expect, test } from "bun:test";
import { RAD, altAzOf, angleBetween, mulMat, mulVec, toColumnMajor, vecFromAltAz, vecFromRaDec, wrapPi, wrapTau, type Mat3 } from "../../../app/utils/sky/vec";

const close = (a: ArrayLike<number>, b: ArrayLike<number>) => [...Array(b.length).keys()].forEach((i) => expect(a[i]!).toBeCloseTo(b[i]!, 12));

describe("vec", () => {
  test("horizon frame: x east, y north, z up; altAzOf inverts it", () => {
    close(vecFromAltAz(90 * RAD, 0), [0, 0, 1]);
    close(vecFromAltAz(0, 90 * RAD), [1, 0, 0]);
    close(vecFromAltAz(0, 0), [0, 1, 0]);
    const { alt, az } = altAzOf(vecFromAltAz(-20 * RAD, 250 * RAD));
    expect(alt / RAD).toBeCloseTo(-20, 9);
    expect(az / RAD).toBeCloseTo(250, 9);
  });

  test("equatorial frame: x toward RA 0h, z toward the pole", () => {
    close(vecFromRaDec(0, 0), [1, 0, 0]);
    close(vecFromRaDec(90 * RAD, 0), [0, 1, 0]);
    close(vecFromRaDec(1.234, 90 * RAD), [0, 0, 1]);
  });

  test("matrix products, and mulVec reads at an offset", () => {
    const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const R: Mat3 = [0, -1, 0, 1, 0, 0, 0, 0, 1]; // 90° about z
    expect(mulMat(I, R)).toEqual(R);
    close(mulMat(R, R), [-1, 0, 0, 0, -1, 0, 0, 0, 1]);
    close(mulVec(R, new Float32Array([9, 9, 9, 1, 0, 0]), 3), [0, 1, 0]);
  });

  test("toColumnMajor transposes for WebGL", () => {
    expect([...toColumnMajor([1, 2, 3, 4, 5, 6, 7, 8, 9])]).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  test("angle wrapping and the angle between directions", () => {
    expect(wrapTau(-0.5)).toBeCloseTo(2 * Math.PI - 0.5, 12);
    expect(wrapPi(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 12);
    expect(angleBetween(vecFromAltAz(0, 0), vecFromAltAz(0, 30 * RAD)) / RAD).toBeCloseTo(30, 9);
    expect(angleBetween(vecFromAltAz(0, 0), vecFromAltAz(1e-7, 0))).toBeCloseTo(1e-7, 15);
  });
});
