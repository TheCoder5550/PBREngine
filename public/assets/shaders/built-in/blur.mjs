import { screenQuadVertex, shaderBase } from "./base.mjs";

var vertex = screenQuadVertex;

var fragment = `
${shaderBase}
out vec4 fragColor;

uniform vec2 SIZE;
uniform sampler2D imageTexture;
uniform bool horizontal;
uniform int radius;

void main() {
  vec2 uv = gl_FragCoord.xy / SIZE;
  vec2 texelSize = 1. / vec2(textureSize(imageTexture, 0));

  vec4 col = vec4(0);

  for (int i = -radius; i <= radius; i++) {
    col += (1. - float(abs(i)) / float(radius)) * texture(imageTexture, uv + texelSize * float(i) * vec2(horizontal, 1 - int(horizontal)));
  }

  col /= float(radius * 2 + 1) / 2.;

  fragColor = col;
  // fragColor = vec4(col.rgb, texture(imageTexture, uv).a);
}
`;

vertex = vertex.trim();
fragment = fragment.trim();

export {
  vertex,
  fragment
};