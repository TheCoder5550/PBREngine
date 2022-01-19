#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

in vec2 vUV;

uniform vec3 color;

void main() {
  float x = mod(vUV.x * 30., 1.);
  if (vUV.y < 0.6 && (x < 0.5 * vUV.y || x > 0.5 * vUV.y + 0.5)) {
    discard;
  }

  fragColor = vec4(mix(color, color * 10., pow(vUV.y, 8.)), vUV.y);
  return;
}