var shaderBase = `
#version 300 es
precision highp float;
precision mediump int;
`;

var screenQuadVertex = `
#version 300 es

in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

var fogBase = `
#define USEFOG
const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
uniform float fogDensity;// = 0.0035;

vec4 applyFog(vec4 color) {
  float distance = length(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);
  float fogAmount = exp(-pow(distance * fogDensity, 2.));
  
  return mix(fogColor, color, fogAmount);
}
`;

export {
  shaderBase,
  screenQuadVertex,
  fogBase,
};