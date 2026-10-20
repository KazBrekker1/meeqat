// GLSL ES 1.0 (WebGL 1) for the sky. All passes share the zenith-up stereographic camera:
//   u_m   J2000 → camera (x right, y up, z forward) = camera basis · sky rotation
//   u_c   where the view centre lands (px), u_k pixels per stereographic unit, u_res canvas size (px)
// Colours are premultiplied (blend ONE, ONE_MINUS_SRC_ALPHA).

const PROJECT = `
uniform mat3 u_m;
uniform vec2 u_res;
uniform vec2 u_c;
uniform float u_k;
vec2 toPx(vec3 c) {
  float s = 2.0 / (1.0 + c.z) * u_k;
  return vec2(u_c.x + c.x * s, u_c.y - c.y * s);
}
vec4 toClip(vec2 px) {
  return vec4(px.x / u_res.x * 2.0 - 1.0, 1.0 - px.y / u_res.y * 2.0, 0.0, 1.0);
}
const vec4 HIDDEN = vec4(2.0, 2.0, 2.0, 1.0);
`;

const FRAG_PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

/** Full-screen triangle: the night gradient by altitude and the ground below the horizon. */
export const SKY_VS = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
export const SKY_FS = `${FRAG_PRECISION}
uniform vec2 u_res;
uniform vec2 u_c;
uniform float u_k;
uniform vec3 u_cup; // the horizon "up" component of the camera's x, y, z axes
const vec3 HORIZON = vec3(28.0, 30.0, 74.0) / 255.0;
const vec3 ZENITH = vec3(6.0, 9.0, 26.0) / 255.0;
const vec3 GROUND = vec3(13.0, 10.0, 20.0) / 255.0;
void main() {
  vec2 xy = vec2(gl_FragCoord.x - u_c.x, u_c.y - (u_res.y - gl_FragCoord.y)) / u_k;
  float p2 = dot(xy, xy);
  float z = (4.0 - p2) / (4.0 + p2);
  float h = (1.0 + z) * 0.5;
  float up = dot(vec3(xy * h, z), u_cup);
  float alt = degrees(asin(clamp(up, -1.0, 1.0)));
  vec3 c = mix(HORIZON, ZENITH, smoothstep(0.0, 65.0, max(alt, 0.0)));
  c = mix(c, GROUND, 0.62 * (1.0 - smoothstep(-6.0, 0.0, alt)));
  gl_FragColor = vec4(c, 1.0);
}
`;

/** One point per star: size and brightness from magnitude, colour from B−V, dimmed below the horizon. */
export const STAR_VS = `
attribute vec3 a_dir;
attribute vec2 a_magbv;
${PROJECT}
uniform vec3 u_hz;      // J2000 → horizon "up" (third row of the sky rotation)
uniform float u_scale;  // px per size unit
uniform float u_below;  // brightness below the horizon
varying vec3 v_col;
varying float v_a;
varying float v_r;
varying float v_glow;
varying float v_size;
vec3 bvColor(float bv) {
  vec3 blue = vec3(0.67, 0.76, 1.0), white = vec3(0.98, 0.97, 1.0), yellow = vec3(1.0, 0.91, 0.78), orange = vec3(1.0, 0.8, 0.59);
  if (bv < 0.4) return mix(blue, white, clamp((bv + 0.1) / 0.5, 0.0, 1.0));
  if (bv < 0.9) return mix(white, yellow, (bv - 0.4) / 0.5);
  return mix(yellow, orange, clamp((bv - 0.9) / 0.6, 0.0, 1.0));
}
void main() {
  vec3 c = u_m * a_dir;
  float mag = a_magbv.x;
  v_glow = mag < 1.9 ? 1.0 : 0.0;
  v_col = v_glow > 0.5 ? bvColor(a_magbv.y) : vec3(0.886, 0.91, 1.0);
  v_a = clamp(1.12 - 0.12 * (mag + 1.0), 0.32, 1.0) * (dot(u_hz, a_dir) < 0.0 ? u_below : 1.0);
  v_r = max(0.7, 1.9 - 0.25 * mag) * u_scale;
  v_size = 2.0 * (v_glow > 0.5 ? v_r * 2.8 : v_r) + 2.0;
  if (c.z < -0.8) { gl_Position = HIDDEN; gl_PointSize = 0.0; return; }
  gl_Position = toClip(toPx(c));
  gl_PointSize = v_size;
}
`;
export const STAR_FS = `${FRAG_PRECISION}
varying vec3 v_col;
varying float v_a;
varying float v_r;
varying float v_glow;
varying float v_size;
void main() {
  float d = length(gl_PointCoord - 0.5) * v_size;
  float core = clamp(v_r + 0.5 - d, 0.0, 1.0);
  float halo = v_glow * 0.22 * clamp(1.0 - d / (v_r * 2.8), 0.0, 1.0);
  float a = max(core, halo) * v_a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(v_col * a, a);
}
`;

/** Constellation figures as quads of constant on-screen width, edge anti-aliased; one figure in amber. */
export const LINE_VS = `
attribute vec3 a_a;       // segment start (J2000)
attribute vec3 a_b;       // segment end
attribute vec3 a_meta;    // which end (0 = a, 1 = b), side (±1), constellation index
${PROJECT}
uniform vec3 u_hz;
uniform float u_width;    // px
uniform float u_fig;      // highlighted constellation, −1 for none
uniform float u_below;
varying float v_hi;
varying float v_dim;
varying float v_px;
varying float v_hw;
void main() {
  vec3 ca = u_m * a_a, cb = u_m * a_b;
  v_hi = abs(a_meta.z - u_fig) < 0.5 ? 1.0 : 0.0;
  v_dim = dot(u_hz, mix(a_a, a_b, a_meta.x)) < 0.0 ? u_below : 1.0;
  v_hw = u_width * (v_hi > 0.5 ? 1.8 : 1.0) * 0.5;
  v_px = a_meta.y * (v_hw + 1.0);
  vec2 p = toPx(ca), q = toPx(cb), d = q - p;
  float len = length(d);
  if (ca.z < -0.8 || cb.z < -0.8 || len < 0.001 || len > u_res.x * 0.6) { gl_Position = HIDDEN; return; }
  vec2 n = vec2(-d.y, d.x) / len;
  gl_Position = toClip(mix(p, q, a_meta.x) + n * v_px);
}
`;
export const LINE_FS = `${FRAG_PRECISION}
uniform vec4 u_color;
uniform vec4 u_hiColor;
varying float v_hi;
varying float v_dim;
varying float v_px;
varying float v_hw;
void main() {
  float cover = clamp(v_hw + 0.5 - abs(v_px), 0.0, 1.0);
  gl_FragColor = (v_hi > 0.5 ? u_hiColor : u_color * v_dim) * cover;
}
`;
