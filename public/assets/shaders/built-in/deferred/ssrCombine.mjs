import { screenQuadVertex, shaderBase } from "../base.mjs";

export const vertex = screenQuadVertex;

export const fragment = `
${shaderBase}

uniform sampler2D combinedTexture;
uniform sampler2D ssrTexture;
uniform vec2 SIZE;
uniform float scale;

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / SIZE;
  
  vec3 combinedColor = texture(combinedTexture, uv).rgb;
  vec4 ssrColor = texture(ssrTexture, uv * scale);

  fragColor = vec4(
    combinedColor.rgb + ssrColor.rgb,
    1
  );

  // fragColor = vec4(mix(combinedColor, ssrColor.rgb, ssrColor.a), 1);
}
`;