import { fragmentLogDepth, fragmentLogDepthMain, sharedUniforms } from "../../assets/shaders/built-in/base.mjs";
import * as lit from "../../assets/shaders/built-in/lit.glsl.mjs";

var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

${sharedUniforms}

${lit.litAttributesAndUniforms}

${lit.litBase}

${lit.fogBase}

int lanes = 3;
float dashScale = 2.;
float dashPercentage = 0.3;
float laneLineThickness = 0.007;
vec3 laneColor = vec3(1);

float rumbleStripScale = 50.;
float rumbleStripWidth = 0.025;

float innerShoulderWidth = 0.1;
float innerShoulderLineThickness = 0.007;
vec3 innerShoulderColor = vec3(1, 0.15, 0);

float outerShoulderWidth = 0.15;
float outerShoulderLineThickness = 0.007;
vec3 outerShoulderColor = vec3(1);

${fragmentLogDepth}

void main() {
  ${fragmentLogDepthMain}
  ${lit.motionBlurMain}

  vec4 currentAlbedo = vec4(0);

  float noise = LayeredNoise(vUV * 10.) * 0.01;
  float x = mod(vUV.x, 1.0);

  float laneX = (x - innerShoulderWidth) / (1. - innerShoulderWidth - outerShoulderWidth);
  laneX *= float(lanes);
  laneX %= 1.0;

  vec2 textureUV = vec2(laneX, vUV.y * float(lanes) / (1. - innerShoulderWidth - outerShoulderWidth));

  // Rumble strips
  if (
    (
      abs(x - innerShoulderWidth + innerShoulderLineThickness + rumbleStripWidth / 2.) < rumbleStripWidth / 2. &&
      mod(vUV.y * rumbleStripScale, 1.0) < 0.5
    ) || (
      abs(x - 1. + outerShoulderWidth - outerShoulderLineThickness - rumbleStripWidth / 2.) < rumbleStripWidth / 2. &&
      mod(vUV.y * rumbleStripScale, 1.0) < 0.5
    )
  ) {
    textureUV.y /= 20.;
    currentAlbedo.rgb += vec3(0.03);
  }

  currentAlbedo += texture(albedoTexture, textureUV);

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = sampleTexture(metallicRoughnessTexture, textureUV).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }

  // Inner shoulder
  if (abs(x - innerShoulderWidth) < innerShoulderLineThickness / 2. - noise * 0.1) {
    currentAlbedo.rgb = innerShoulderColor;
  }

  // Outer shoulder
  if (abs(x - (1. - outerShoulderWidth)) < outerShoulderLineThickness / 2. - noise * 0.1) {
    currentAlbedo.rgb = outerShoulderColor;
  }

  // Lane lines
  float fixedLaneThickness = laneLineThickness / (1. - innerShoulderWidth - outerShoulderWidth);
  fixedLaneThickness *= float(lanes);
  fixedLaneThickness -= noise;

  if (
    x > innerShoulderWidth + innerShoulderLineThickness / 2. &&
    x < 1. - outerShoulderWidth - outerShoulderLineThickness / 2. &&
    (
      laneX < fixedLaneThickness / 2. ||
      laneX > 1. - fixedLaneThickness / 2.
    ) &&
    mod(vUV.y * dashScale, 1.0) < dashPercentage
  ) {
    currentAlbedo.rgb = laneColor;
  }

  // Worn out tracks
  // if (
  //   x > innerShoulderWidth + innerShoulderLineThickness / 2. &&
  //   x < 1. - outerShoulderWidth - outerShoulderLineThickness / 2.
  // ) {
    float worn = pow(abs(mod(laneX * 2., 1.0) - 0.5), 1.0);
    currentAlbedo.rgb *= 1. - 0.6 * worn;
    _roughness *= 0.7 + 0.3 * worn;
  // }

  vec3 _tangentNormal = texture(normalTexture, textureUV).rgb * 2. - 1.;
  _tangentNormal = setNormalStrength(_tangentNormal, 2.);

  vec3 _emission = vec3(0);
  float _ao = 1.;
  vec4 litColor = lit(currentAlbedo, 0.5, _emission, _tangentNormal, _metallic, _roughness, _ao);

  #ifdef USEFOG
    litColor = applyFog(litColor);
  #endif

  fragColor = litColor;
}
`;

var webgl2 = {
  vertex,
  fragment
};

export {
  webgl2
};