<template>
  <canvas ref="cv" class="absolute inset-0 w-full h-full block" aria-hidden="true" />
</template>

<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount } from "vue";

const props = withDefaults(
  defineProps<{ count?: number; seed?: number; shootingStar?: boolean; nebula?: boolean }>(),
  { count: 60, seed: 7, shootingStar: false, nebula: true }
);

const cv = ref<HTMLCanvasElement>();

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform float u_density;
uniform float u_nebula;

float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
vec2  h22(vec2 p){ float n=h21(p); return fract(vec2(n, h21(p+19.19))); }

float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=h21(i), b=h21(i+vec2(1.0,0.0)), c=h21(i+vec2(0.0,1.0)), d=h21(i+vec2(1.0,1.0));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.0; a*=0.5; } return s; }

vec3 starLayer(vec2 uv, float density, float bright, float seed){
  vec2 g = uv*density + seed;
  vec2 id = floor(g);
  vec2 f = fract(g);
  vec3 col = vec3(0.0);
  for(int y=-1;y<=1;y++){
    for(int x=-1;x<=1;x++){
      vec2 o = vec2(float(x), float(y));
      vec2 cell = id + o;
      float present = step(0.58, h21(cell + seed*3.1));
      vec2 pos = o + h22(cell + seed);
      float d = length(f - pos);
      float sz = mix(0.018, 0.05, h21(cell + seed*5.7));
      float core = smoothstep(sz, 0.0, d);
      float glow = 0.22 * exp(-d*d*70.0);
      float tw = 0.5 + 0.5*sin(u_time*(0.7+1.6*h21(cell)) + 6.2831*h21(cell+1.3));
      float b = (core + glow) * bright * present * (0.45 + 0.75*tw);
      vec3 tint = mix(vec3(0.76,0.84,1.0), vec3(1.0,0.93,0.82), h21(cell+9.1));
      col += tint * b;
    }
  }
  return col;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 auv = vec2(uv.x * u_res.x / u_res.y, uv.y);
  vec3 col = vec3(0.0);
  float dens = u_density;
  col += starLayer(auv, dens*0.6, 0.5, u_seed + 1.0);
  col += starLayer(auv, dens*1.1, 0.8, u_seed + 11.0);
  col += starLayer(auv, dens*1.9, 1.0, u_seed + 27.0);

  if(u_nebula > 0.5){
    float n = fbm(auv*2.2 + u_seed);
    n = smoothstep(0.5, 0.95, n);
    vec3 neb = mix(vec3(0.10,0.13,0.34), vec3(0.21,0.11,0.33), fbm(auv*1.4 + 5.0));
    col += neb * n * 0.16;
  }

  float a = clamp(max(max(col.r,col.g),col.b), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

let gl: WebGLRenderingContext | null = null;
let raf = 0;
let start = 0;
let visible = true;
let ro: ResizeObserver | null = null;
let io: IntersectionObserver | null = null;
let uRes: WebGLUniformLocation | null = null;
let uTime: WebGLUniformLocation | null = null;

function compile(g: WebGLRenderingContext, type: number, src: string) {
  const sh = g.createShader(type)!;
  g.shaderSource(sh, src);
  g.compileShader(sh);
  if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
    console.warn("[StarField] shader error:", g.getShaderInfoLog(sh));
  }
  return sh;
}

function resize() {
  const c = cv.value;
  if (!c || !gl) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(c.clientWidth * dpr));
  const h = Math.max(1, Math.round(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function frame(t: number) {
  if (!gl || !cv.value) return;
  if (!start) start = t;
  resize();
  gl.uniform2f(uRes, cv.value.width, cv.value.height);
  gl.uniform1f(uTime, (t - start) / 1000);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (visible) raf = requestAnimationFrame(frame);
}

function play() {
  if (!visible) return;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

onMounted(() => {
  const c = cv.value;
  if (!c) return;
  gl = (c.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true }) ||
    c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) {
    console.warn("[StarField] WebGL unavailable");
    return;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  uRes = gl.getUniformLocation(prog, "u_res");
  uTime = gl.getUniformLocation(prog, "u_time");
  gl.uniform1f(gl.getUniformLocation(prog, "u_seed"), props.seed * 1.37);
  gl.uniform1f(gl.getUniformLocation(prog, "u_density"), Math.min(34, Math.max(10, props.count * 0.32)));
  gl.uniform1f(gl.getUniformLocation(prog, "u_nebula"), props.nebula ? 1 : 0);

  resize();
  ro = new ResizeObserver(resize);
  ro.observe(c);

  // Only animate while on screen — keeps the gallery (many canvases) light.
  io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) play();
      else cancelAnimationFrame(raf);
    },
    { threshold: 0.01 }
  );
  io.observe(c);

  play();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  ro?.disconnect();
  io?.disconnect();
  const lose = gl?.getExtension("WEBGL_lose_context");
  lose?.loseContext();
  gl = null;
});
</script>
