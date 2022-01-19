#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform vec4 albedo;

in vec3 vNormal;
in vec3 vTangent;
in vec4 vColor;
in vec2 vUV;

void main() {
  vec4 currentAlbedo = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo *= vColor;

  fragColor = currentAlbedo;
}