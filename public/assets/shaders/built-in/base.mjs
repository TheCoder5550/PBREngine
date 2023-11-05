var shaderBase = `
#version 300 es
precision highp float;
precision mediump int;
`;

var screenQuadVertex = `
#version 300 es

in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

var fogBase = `
#define USEFOG
const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
uniform float fogDensity;// = 0.0035;

vec4 applyFog(vec4 color) {
  float distance = length(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);
  float fogAmount = exp(-pow(distance * fogDensity, 2.));
  
  return mix(fogColor, color, fogAmount);
}
`;

var shadowBase = `
uniform float environmentMinLight;

// const int levels = 2;

// vec4 projectedTexcoords[levels];
// uniform float biases[levels];
// uniform sampler2D projectedTextures[levels];
uniform mat4 textureMatrices[levels];
uniform float shadowSizes[levels];

uniform int shadowQuality;
const bool blurShadows = true;
const int shadowSamples = 16;
const float shadowSampleRadius = 96. * 2.;

float shadowDarkness = 0.;
const float shadowKernalSize = 2.;
// mat3 shadowKernel = mat3(
//   1, 2, 1,
//   2, 4, 2,
//   1, 2, 1
// );
vec2 poissonDisk[16] = vec2[]( 
  vec2( -0.94201624, -0.39906216 ), 
  vec2( 0.94558609, -0.76890725 ), 
  vec2( -0.094184101, -0.92938870 ), 
  vec2( 0.34495938, 0.29387760 ), 
  vec2( -0.91588581, 0.45771432 ), 
  vec2( -0.81544232, -0.87912464 ), 
  vec2( -0.38277543, 0.27676845 ), 
  vec2( 0.97484398, 0.75648379 ), 
  vec2( 0.44323325, -0.97511554 ), 
  vec2( 0.53742981, -0.47373420 ), 
  vec2( -0.26496911, -0.41893023 ), 
  vec2( 0.79197514, 0.19090188 ), 
  vec2( -0.24188840, 0.99706507 ), 
  vec2( -0.81409955, 0.91437590 ), 
  vec2( 0.19984126, 0.78641367 ), 
  vec2( 0.14383161, -0.14100790 ) 
);

bool inRange(vec3 projCoord) {
  return projCoord.x >= 0.0 &&
         projCoord.x <= 1.0 &&
         projCoord.y >= 0.0 &&
         projCoord.y <= 1.0 &&
         projCoord.z <  1.0;
}

float fadeOutShadow(float visibility, vec3 proj) {
  return mix(visibility, 1., clamp(pow(length(proj.xy - vec2(0.5, 0.5)) * 2., 5.), 0., 1.));
}

float fadeToNextShadowMap(float v1, float v2, vec3 proj) {
  return mix(v1, v2, clamp(pow(length(proj.xy - vec2(0.5, 0.5)) * 2., 30.), 0., 1.));
}

vec2 VogelDiskSample(int sampleIndex, int samplesCount, float phi)
{
  float GoldenAngle = 2.4;

  float fSampleIndex = float(sampleIndex);
  float fSamplesCount = float(samplesCount);

  float r = sqrt(fSampleIndex + 0.5) / sqrt(fSamplesCount);
  float theta = fSampleIndex * GoldenAngle + phi;

  float sine = sin(theta);
  float cosine = cos(theta);
  
  return vec2(r * cosine, r * sine);
}

float InterleavedGradientNoise(vec2 position_screen)
{
  vec3 magic = vec3(0.06711056f, 0.00583715f, 52.9829189f);
  return fract(magic.z * fract(dot(position_screen, magic.xy)));
}

float random(vec3 seed, int i){
  vec4 seed4 = vec4(seed,i);
  float dot_product = dot(seed4, vec4(12.9898,78.233,45.164,94.673));
  return fract(sin(dot_product) * 43758.5453);
}

vec2 hash( vec2 p ) { // replace this by something better
  p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float getBias(float bias, vec2 shadowStepSize, float cosTheta) {
  // bias = -bias * (cosTheta > 0. ? 1. : 0.);
  // bias = bias * tan(acos(cosTheta));
  // bias = clamp(bias, 0.0, 0.1);

  // return bias;

  bias *= shadowStepSize.x;
  // bias = bias * tan(acos(cosTheta));
  // bias = clamp(bias, 0.0, 0.001);

  return bias;
}

float getShadowAmount(vec3 worldPosition, float cosTheta) {
  // vec4 projectedTexcoords[levels];
  
  // for (int i = 0; i < levels; i++) {
  //   projectedTexcoords[i] = textureMatrices[i] * vec4(worldPosition + worldNormal * 0.1, 1);
  // }

  if (shadowQuality == 0) {
    return 1.;
  }

  cosTheta = clamp(cosTheta, 0., 1.);

  if (shadowQuality == 1) {
    vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
    bool inside = inRange(proj);
    
    if (inside) {
      // float bias = 0.005*tan(acos(cosTheta)); // cosTheta is dot( n,l ), clamped between 0 and 1
      // bias = clamp(bias, 0.0, 0.01);

      float projectedDepth = texture(projectedTextures[0], proj.xy).r;
      float currentDepth = proj.z + biases[0];
      return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
    }
    
    proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
    inside = inRange(proj);

    if (inside) {
      float currentDepth = proj.z + biases[1];
      float projectedDepth = texture(projectedTextures[1], proj.xy).r;
      return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
    }

    return 1.;
  }

  vec2 shadowStepSize = vec2(1) / vec2(textureSize(projectedTextures[0], 0));

  if (shadowQuality >= 2) {
    vec4 ShadowCoord = projectedTexcoords[0];
    vec3 proj = ShadowCoord.xyz / ShadowCoord.w;

    // float bias = getBias(biases[0], shadowStepSize, cosTheta);

    float bias = biases[0];
    bias *= shadowStepSize.x;
    // bias = bias * tan(acos(cosTheta));
    // bias = clamp(bias, 0.0, 0.001);

    float currentDepth = proj.z - bias;
    bool inside = inRange(proj);

    if (inside) {
      float outShadow = 0.;

      if (blurShadows) {
        float visibility = 1.;
        for (int i = 0; i < shadowSamples; i++) {
          // int index = int(16.0*random(gl_FragCoord.xyy + float(i) * vec3(1, 0.4, -0.5), i))%16;
          // int index = int(16.0 * random(floor(worldPosition.xyz * 50000.0) + vec3(i), 0)) % 16;
          
          // if (texture(projectedTextures[0], proj.xy + poissonDisk[index] * shadowStepSize * shadowSampleRadius).r < currentDepth) {
          //   visibility -= 1. / float(shadowSamples);
          // }

          // if (texture(projectedTextures[0], proj.xy + (hash(worldPosition.xz + worldPosition.zy + float(i) * vec2(1, -.9)) * 2. - 1.) * shadowStepSize * shadowSampleRadius).r < currentDepth) {
          //   visibility -= 1. / float(shadowSamples);
          // }

          // visibility -= 0.01*(1.0-textureProj(projectedTextures[0], vec3(ShadowCoord.xy + poissonDisk[index]/700.0, (ShadowCoord.z-bias * 3.) / ShadowCoord.w)).r);
        
          float phi = InterleavedGradientNoise(gl_FragCoord.xy) * 2. * PI;

          if (texture(
            projectedTextures[0],
            proj.xy + VogelDiskSample(i, shadowSamples, phi) * shadowStepSize * shadowSampleRadius / float(shadowSizes[0])
          ).r < currentDepth) {
            visibility -= 1. / float(shadowSamples);
          }
        }

        outShadow = visibility;
      }
      else {
        float sum = 0.0;
        for (float j = -shadowKernalSize / 2. + 0.5; j <= shadowKernalSize / 2. - 0.5; j++) {
          for (float k = -shadowKernalSize / 2. + 0.5; k <= shadowKernalSize / 2. - 0.5; k++) {
            // float projectedDepth = texture(projectedTextures[0], proj.xy + shadowStepSize * hash(vec2(j, k) / 1000.)).r;
            float projectedDepth = texture(projectedTextures[0], proj.xy + shadowStepSize * vec2(j, k)).r;

            sum += 1. - step(projectedDepth, currentDepth);//(projectedDepth <= currentDepth ? shadowDarkness : 1.);// * shadowKernel[j + 1][k + 1];
          }
        }

        outShadow = sum / float(shadowKernalSize * shadowKernalSize);
      }

      // bruh double calc
      vec3 projNext = projectedTexcoords[1].xyz / projectedTexcoords[1].w;

      float bias = getBias(biases[1], shadowStepSize, cosTheta);

      float depthNext = projNext.z - bias;
      float projectedDepthNext = texture(projectedTextures[1], projNext.xy).r;
      float nextVis = (projectedDepthNext <= depthNext ? shadowDarkness : 1.);
      return fadeToNextShadowMap(outShadow, nextVis, proj);
    }

    proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
    inside = inRange(proj);

    if (inside) {
      float bias = getBias(biases[1], shadowStepSize, cosTheta);
      currentDepth = proj.z - bias;
      
      if (shadowQuality == 2) {
        float projectedDepth = texture(projectedTextures[1], proj.xy).r;
        return fadeOutShadow((projectedDepth <= currentDepth ? shadowDarkness : 1.), proj);
      }

      if (shadowQuality == 3) {
        float sum = 0.0;
        for (float j = -shadowKernalSize / 2. + 0.5; j <= shadowKernalSize / 2. - 0.5; j++) {
          for (float k = -shadowKernalSize / 2. + 0.5; k <= shadowKernalSize / 2. - 0.5; k++) {
            float projectedDepth = texture(projectedTextures[1], proj.xy + shadowStepSize * vec2(j, k)).r;
            sum += (projectedDepth <= currentDepth ? shadowDarkness : 1.);
          }
        }

        return fadeOutShadow(sum / 16., proj);
      }
    }

    return 1.;
  }

  return 1.;
}
`;

export {
  shaderBase,
  screenQuadVertex,
  fogBase,
  shadowBase,
};