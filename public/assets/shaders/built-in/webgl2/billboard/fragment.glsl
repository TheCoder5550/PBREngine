#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D albedoTexture;

in vec2 vUV;

void main() {
  vec2 uv = vUV;
  uv.y = 1. - uv.y;
  fragColor = texture(albedoTexture, uv);
}