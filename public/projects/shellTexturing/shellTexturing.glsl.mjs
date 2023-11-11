import * as lit from "../../assets/shaders/built-in/lit.glsl.mjs";

export const vertex = `
${lit.shaderBase}

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vNormal;
out vec2 vUV;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
};

uniform mat4 modelMatrix;

uniform sampler2D simplexNoiseTexture;
uniform float height;
uniform int shells;
uniform int shellIndex;
uniform float heightBias;

void main() {
  vNormal = normal;
  vUV = uv;

  float currentHeight = pow(float(shellIndex) / float(shells - 1), heightBias/*0.3*/) * height;// + texture(simplexNoiseTexture, position.xy * 0.1).r;
  vec3 offsetPosition = position + normalize(normal) * currentHeight;

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(offsetPosition, 1.0);
}
`;

export const fragment = `
${lit.shaderBase}

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec2 motionVector;

in vec2 vUV;

uniform float iTime;

uniform int shells;
uniform int shellIndex;

uniform vec4 baseColor;
uniform float density;
uniform float thickness;

uniform float swayStrength;
uniform float swayDensity;
uniform float windSpeed;
uniform sampler2D simplexNoiseTexture;

#define M1 1597334677U     //1719413*929
#define M2 3812015801U     //140473*2467*11
float hash( uvec2 q ) {
  q *= uvec2(M1, M2); 
  
  uint n = (q.x ^ q.y) * M1;
  
  return float(n) * (1.0 / float(0xffffffffU));
}

void main() {
  motionVector = vec2(0.5);

  float normalizedIndex = float(shellIndex) / float(shells - 1);

  vec2 scaledUVs = vUV * density - normalizedIndex * swayStrength * (texture(simplexNoiseTexture, iTime * windSpeed + vUV * swayDensity).r - 0.5) * 2.;
  uvec2 intUVs = uvec2(floor(scaledUVs));
  float n = hash(intUVs);

  float distanceToCenter = length(fract(scaledUVs) * 2. - 1.);
  bool outsideStrand = distanceToCenter > thickness * ((1. - normalizedIndex) - n);
  
  if (outsideStrand && shellIndex > 0) {
    discard;
  }

  vec3 color = baseColor.rgb * pow(normalizedIndex + 0.05, 0.8);

  fragColor = vec4(color, 1);
}

`;