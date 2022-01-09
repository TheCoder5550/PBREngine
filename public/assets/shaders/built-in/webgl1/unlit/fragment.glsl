precision highp float;

uniform vec4 albedo;
uniform sampler2D albedoTexture;
uniform bool useTexture;

float alphaCutoff = 0.3;

varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;

void main() {
  vec4 currentAlbedo = useTexture ? texture2D(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  gl_FragColor = currentAlbedo;
}