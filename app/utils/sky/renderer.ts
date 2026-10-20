// The WebGL 1 sky: uploads the catalogue once, then each frame is three draws (sky, figures,
// stars) driven by a handful of uniforms. Nothing here schedules frames; RealSky does.
import type { SkyCatalog } from "./catalog";
import type { Camera } from "./view";
import { LINE_FS, LINE_VS, SKY_FS, SKY_VS, STAR_FS, STAR_VS } from "./shaders";
import { mulMat, toColumnMajor, type Mat3 } from "./vec";

export interface SkyFrame {
  /** J2000 equatorial → horizon */
  rot: Mat3;
  cam: Camera;
  /** constellation drawn in amber, −1 for none */
  figure: number;
  /** figure line opacity and width (px) */
  lineAlpha: number;
  lineWidth: number;
  /** star size, px per unit */
  starScale: number;
}

export interface SkyRenderer {
  draw(f: SkyFrame): void;
  /** true between webglcontextlost and webglcontextrestored */
  readonly lost: boolean;
  dispose(): void;
}

/** Brightness of stars and figure lines below the horizon. */
const BELOW = 0.36;

type Prog = { p: WebGLProgram; u: (name: string) => WebGLUniformLocation | null; a: (name: string) => number };

function program(gl: WebGLRenderingContext, vs: string, fs: string): Prog {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`sky shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`sky program: ${gl.getProgramInfoLog(p)}`);
  const us = new Map<string, WebGLUniformLocation | null>();
  return { p, u: (n) => (us.has(n) ? us.get(n)! : (us.set(n, gl.getUniformLocation(p, n)), us.get(n)!)), a: (n) => gl.getAttribLocation(p, n) };
}

/** Interleaved per-star data: x, y, z, magnitude, B−V. */
function starData(cat: SkyCatalog): Float32Array<ArrayBuffer> {
  const n = cat.starMag.length, out = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    out.set(cat.starDirs.subarray(i * 3, i * 3 + 3), i * 5);
    out[i * 5 + 3] = cat.starMag[i]!;
    out[i * 5 + 4] = cat.starBv[i]!;
  }
  return out;
}

/** Four corners per segment (a, b, which end, side, constellation) and two triangles. */
function lineData(cat: SkyCatalog): { verts: Float32Array<ArrayBuffer>; index: Uint16Array<ArrayBuffer> } {
  const n = cat.segFigure.length, verts = new Float32Array(n * 4 * 9), index = new Uint16Array(n * 6);
  const dir = (v: number) => cat.lineDirs.subarray(v * 3, v * 3 + 3);
  for (let i = 0; i < n; i++) {
    const a = dir(cat.segments[i * 2]!), b = dir(cat.segments[i * 2 + 1]!), fig = cat.segFigure[i]!;
    // a+, a−, b−, b+ : around the quad
    ([[0, 1], [0, -1], [1, -1], [1, 1]] as const).forEach(([end, side], k) => {
      const o = (i * 4 + k) * 9;
      verts.set(a, o);
      verts.set(b, o + 3);
      verts[o + 6] = end;
      verts[o + 7] = side;
      verts[o + 8] = fig;
    });
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  return { verts, index };
}

/** null when WebGL is unavailable or the shaders do not compile (the caller falls back). */
export function createSkyRenderer(canvas: HTMLCanvasElement, cat: SkyCatalog, onLost: (lost: boolean) => void): SkyRenderer | null {
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return null;
  const stars = starData(cat), lines = lineData(cat), m = new Float32Array(9);
  let sky: Prog, star: Prog, line: Prog;
  let triBuf: WebGLBuffer, starBuf: WebGLBuffer, lineBuf: WebGLBuffer, lineIdx: WebGLBuffer;
  let lost = false;

  const setup = () => {
    sky = program(gl, SKY_VS, SKY_FS);
    star = program(gl, STAR_VS, STAR_FS);
    line = program(gl, LINE_VS, LINE_FS);
    const buffer = (target: number, data: BufferSource) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, gl.STATIC_DRAW);
      return b;
    };
    triBuf = buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]));
    starBuf = buffer(gl.ARRAY_BUFFER, stars);
    lineBuf = buffer(gl.ARRAY_BUFFER, lines.verts);
    lineIdx = buffer(gl.ELEMENT_ARRAY_BUFFER, lines.index);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  };
  try {
    setup();
  } catch (err) {
    console.warn("[sky]", err);
    return null;
  }

  const onContextLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    onLost(true);
  };
  const onContextRestored = () => {
    try {
      setup();
      lost = false;
      onLost(false);
    } catch (err) {
      console.warn("[sky]", err);
    }
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  const attrib = (pr: Prog, name: string, size: number, stride: number, offset: number) => {
    const loc = pr.a(name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
    return loc;
  };
  const common = (pr: Prog, f: SkyFrame) => {
    gl.uniformMatrix3fv(pr.u("u_m"), false, m);
    gl.uniform2f(pr.u("u_res"), f.cam.w, f.cam.h);
    gl.uniform2f(pr.u("u_c"), f.cam.cx, f.cam.cy);
    gl.uniform1f(pr.u("u_k"), f.cam.k);
  };

  return {
    get lost() {
      return lost;
    },
    draw(f) {
      if (lost) return;
      const { cam } = f;
      if (canvas.width !== cam.w || canvas.height !== cam.h) {
        canvas.width = cam.w;
        canvas.height = cam.h;
      }
      gl.viewport(0, 0, cam.w, cam.h);
      toColumnMajor(mulMat([...cam.r, ...cam.u, ...cam.f] as Mat3, f.rot), m);
      const hz = [f.rot[6], f.rot[7], f.rot[8]] as const;

      gl.disable(gl.BLEND);
      gl.useProgram(sky.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
      const pos = attrib(sky, "a_pos", 2, 0, 0);
      gl.uniform2f(sky.u("u_res"), cam.w, cam.h);
      gl.uniform2f(sky.u("u_c"), cam.cx, cam.cy);
      gl.uniform1f(sky.u("u_k"), cam.k);
      gl.uniform3f(sky.u("u_cup"), cam.r[2], cam.u[2], cam.f[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(pos);

      gl.enable(gl.BLEND);
      gl.useProgram(line.p);
      common(line, f);
      gl.uniform3f(line.u("u_hz"), ...hz);
      gl.uniform1f(line.u("u_width"), f.lineWidth);
      gl.uniform1f(line.u("u_fig"), f.figure);
      gl.uniform1f(line.u("u_below"), BELOW);
      const a = f.lineAlpha;
      gl.uniform4f(line.u("u_color"), (150 / 255) * a, (172 / 255) * a, a, a);
      gl.uniform4f(line.u("u_hiColor"), 0.99 * 0.9, 0.83 * 0.9, 0.3 * 0.9, 0.9);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIdx);
      const l1 = attrib(line, "a_a", 3, 36, 0), l2 = attrib(line, "a_b", 3, 36, 12), l3 = attrib(line, "a_meta", 3, 36, 24);
      gl.drawElements(gl.TRIANGLES, lines.index.length, gl.UNSIGNED_SHORT, 0);
      [l1, l2, l3].forEach((l) => gl.disableVertexAttribArray(l));

      gl.useProgram(star.p);
      common(star, f);
      gl.uniform3f(star.u("u_hz"), ...hz);
      gl.uniform1f(star.u("u_scale"), f.starScale);
      gl.uniform1f(star.u("u_below"), BELOW);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
      const s1 = attrib(star, "a_dir", 3, 20, 0), s2 = attrib(star, "a_magbv", 2, 20, 12);
      gl.drawArrays(gl.POINTS, 0, cat.starMag.length);
      [s1, s2].forEach((l) => gl.disableVertexAttribArray(l));
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (!lost) {
        [triBuf, starBuf, lineBuf, lineIdx].forEach((b) => gl.deleteBuffer(b));
        [sky, star, line].forEach((pr) => gl.deleteProgram(pr.p));
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
