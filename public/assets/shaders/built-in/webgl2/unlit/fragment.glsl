#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

float alphaCutoff = 0.1;

in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;

void main() {
  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  fragColor = currentAlbedo;
}