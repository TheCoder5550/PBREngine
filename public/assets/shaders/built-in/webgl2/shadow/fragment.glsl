precision highp float;

varying vec2 vUV;

uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform float alphaCutoff;

void main() {
  if (useTexture && texture2D(albedoTexture, vUV).a < alphaCutoff) {
    discard;
  }

  gl_FragColor = vec4(1, 0, 0, 1);
}