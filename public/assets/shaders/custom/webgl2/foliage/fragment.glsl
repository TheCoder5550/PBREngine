#version 300 es
precision highp float;

out vec4 fragColor;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform sampler2D normalTexture;
uniform bool useNormalMap;

uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;
uniform vec3 sunDirection;
uniform vec3 albedo;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;

void main() {
  vec4 baseColor = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  if (baseColor.a < 0.5) {
    discard;
  }

  vec3 color = vec3(172, 227, 32) / 255.;
  vec3 shadowColor = vec3(38, 74, 31) / 255.;

  float diffuse = clamp(dot(sunDirection, vNormal), 0., 1.);

  vec3 outColor = mix(shadowColor, color, diffuse) * min(baseColor.xyz * 2., 1.);
  fragColor = vec4(outColor, 1);
}