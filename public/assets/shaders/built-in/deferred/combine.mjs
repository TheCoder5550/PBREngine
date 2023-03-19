import { screenQuadVertex, shaderBase, shadowBase } from "../base.mjs";

var vertex = screenQuadVertex;

var fragment = `
${shaderBase}

// #define DEBUG_NORMAL
// #define DEBUG_ALBEDO

layout (location = 0) out vec4 fragColor;
layout (location = 1) out vec4 motionVector;

uniform vec2 SIZE;

uniform sampler2D gPosition;
uniform sampler2D gNormal;
uniform sampler2D gAlbedo;
uniform sampler2D gProperties;

struct LightInfo {
  int type;
  vec3 position;
  vec3 direction;
  float angle;
  vec3 color;
};
const int maxLights = 8;
uniform LightInfo lights[maxLights];
uniform int nrLights;

uniform vec3 sunDirection;
uniform vec3 sunIntensity;
uniform float environmentIntensity;
uniform vec3 ambientColor;

uniform samplerCube u_diffuseIBL;
uniform samplerCube u_specularIBL;
uniform sampler2D u_splitSum;

uniform mat4 inverseViewMatrix;

// Motion blur
uniform mat4 projectionMatrix;
uniform mat4 prevViewMatrix;
uniform mat4 viewMatrix;

// FOG

#define USEFOG
uniform vec4 fogColor;
uniform float fogDensity;

vec3 applyFog(vec3 color, vec3 worldPosition) {
  float distance = length(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - worldPosition);
  float fogAmount = exp(-pow(distance * fogDensity, 2.));
  
  return mix(fogColor.rgb, color, fogAmount);
}

//


bool doNoTiling = false;

const float PI = 3.141592;

// No tiling
vec4 hash4( vec2 p ) {
  return fract(sin(vec4(1.0+dot(p,vec2(37.0,17.0)), 
                        2.0+dot(p,vec2(11.0,47.0)),
                        3.0+dot(p,vec2(41.0,29.0)),
                        4.0+dot(p,vec2(23.0,31.0))))*103.0);
}

vec3 textureNoTile( sampler2D samp, in vec2 uv, float v ) {
    vec2 p = floor( uv );
    vec2 f = fract( uv );
  
    // derivatives (for correct mipmapping)
    vec2 ddx = dFdx( uv );
    vec2 ddy = dFdy( uv );
    
  vec3 va = vec3(0.0);
  float w1 = 0.0;
    float w2 = 0.0;
    for( int j=-1; j<=1; j++ )
    for( int i=-1; i<=1; i++ )
    {
        vec2 g = vec2( float(i),float(j) );
    vec4 o = hash4( p + g );
    vec2 r = g - f + o.xy;
    float d = dot(r,r);
        float w = exp(-5.0*d );
        vec3 c = textureGrad( samp, uv + v*o.zw, ddx, ddy ).xyz;
    va += w*c;
    w1 += w;
        w2 += w*w;
    }
    
    // normal averaging --> lowers contrasts
    return va/w1;

    // contrast preserving average
    float mean = 0.3;// textureGrad( samp, uv, ddx*16.0, ddy*16.0 ).x;
    vec3 res = mean + (va-w1*mean)/sqrt(w2);
    return mix( va/w1, res, v );
}

// Texture sampling
vec4 sampleTexture(sampler2D samp, vec2 uv) {
  if (doNoTiling) {
    return vec4(textureNoTile(samp, uv, 1.), 1);
  }
  else {
    return texture(samp, uv);
  }
}

//Normal map
vec3 setNormalStrength(vec3 normal, float strength) {
  return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
}

// vec3 sampleNormalTexture(sampler2D texture, vec2 uv) {
//   return sampleTexture(texture, uv).rgb * 2. - 1.
// }

// PBR
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0); // trying this
  // return F0 + (1.0 - F0) * pow(max(1.0 - cosTheta, 0.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
} 

float DistributionGGX(vec3 N, vec3 H, float roughness) {
  float a      = roughness*roughness;
  float a2     = a*a;
  float NdotH  = max(dot(N, H), 0.0);
  float NdotH2 = NdotH*NdotH;

  float num   = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;

  return num / denom;
}

float GeometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r*r) / 8.0;

  float num   = NdotV;
  float denom = NdotV * (1.0 - k) + k;

  return num / denom;
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2  = GeometrySchlickGGX(NdotV, roughness);
  float ggx1  = GeometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

vec3 IBL (vec3 N, vec3 V, vec3 R, vec3 albedo, float metallic, float roughness, float scalarF0) {
  vec3 F0 = vec3(scalarF0);
  F0 = mix(F0, albedo, metallic);
  vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.), F0, roughness);

  vec3 kS = F;
  vec3 kD = 1.0 - kS;
  kD *= 1.0 - metallic;	  
    
  vec3 irradiance = texture(u_diffuseIBL, N).rgb;
  vec3 diffuse  = irradiance * albedo;
    
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 prefilteredColor = textureLod(u_specularIBL, R, roughness * MAX_REFLECTION_LOD).rgb;

  vec2 uv = vec2(max(dot(N, V), 0.), roughness);
  uv.y = 1. - uv.y;
  vec2 envBRDF = texture(u_splitSum, uv).rg;

  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
    
  vec3 ambient = (kD * diffuse + specular) * environmentIntensity;

  return ambient;
}

vec3 DirectionalLight (vec3 worldPos, vec3 N, vec3 V, vec3 lightDir, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0) {
  vec3 L = normalize(lightDir);  
  vec3 H = normalize(V + L);  
  vec3 radiance     = lightColor;     
  vec3 F0 = vec3(scalarF0); 
  F0      = mix(F0, albedo, metallic);
  vec3 F  = fresnelSchlick(max(dot(H, V), 0.0), F0);    
  float NDF = DistributionGGX(N, H, roughness);       
  float G   = GeometrySmith(N, V, L, roughness);     
  vec3 nominator    = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001;
  vec3 specular     = nominator / denominator;
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;

  kD *= 1.0 - metallic;
  float NdotL = max(dot(N, L), 0.0);

  vec3 finalColor = (kD * albedo / PI + specular) * radiance * NdotL;
  return finalColor;
}

vec3 PositionalLight (vec3 worldPos, vec3 N, vec3 V, vec3 lightPos, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0) {
  float distance    = length(lightPos - worldPos);
  float attenuation = 1.0 / (distance * distance);
  vec3 L = normalize(lightPos - worldPos);  
  vec3 H = normalize(V + L);  
  vec3 radiance     = lightColor * attenuation;     
  vec3 F0 = vec3(scalarF0); 
  F0      = mix(F0, albedo, metallic);
  vec3 F  = fresnelSchlick(max(dot(H, V), 0.0), F0);    
  float NDF = DistributionGGX(N, H, roughness);       
  float G   = GeometrySmith(N, V, L, roughness);     
  vec3 nominator    = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001; 
  vec3 specular     = nominator / denominator;       
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
    
  kD *= 1.0 - metallic;     
  float NdotL = max(dot(N, L), 0.0);        
  return (kD * albedo / PI + specular) * radiance * NdotL;  
}

vec3 Spotlight (vec3 worldPos, vec3 N, vec3 V, vec3 lightPos, vec3 dir, float angle, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0) {
  vec3 currentDir = normalize(worldPos - lightPos);
  float distance    = length(lightPos - worldPos);
  float attenuation = 1.0 / (distance * distance);

  float sharpness = 5.;
  attenuation *= clamp((dot(currentDir, dir) - cos(angle)) * sharpness, 0., 1.);

  vec3 L = normalize(lightPos - worldPos);  
  vec3 H = normalize(V + L);  
  vec3 radiance     = lightColor * attenuation;     
  vec3 F0 = vec3(scalarF0); 
  F0      = mix(F0, albedo, metallic);
  vec3 F  = fresnelSchlick(max(dot(H, V), 0.0), F0);    
  float NDF = DistributionGGX(N, H, roughness);       
  float G   = GeometrySmith(N, V, L, roughness);     
  vec3 nominator    = NDF * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001; 
  vec3 specular     = nominator / denominator;       
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
    
  kD *= 1.0 - metallic;     
  float NdotL = max(dot(N, L), 0.0);
  
  return (kD * albedo / PI + specular) * radiance * NdotL;  
}

const int levels = 2;

vec4 projectedTexcoords[levels];
uniform float biases[levels];
uniform sampler2D projectedTextures[levels];
uniform mat4 textureMatrices[levels];

${shadowBase}

void main() {
  vec2 uv = gl_FragCoord.xy / SIZE;

  vec3 position = texture(gPosition, uv).rgb;
  vec3 normal = texture(gNormal, uv).rgb;
  vec3 albedo = texture(gAlbedo, uv).rgb;
  vec4 properties = texture(gProperties, uv);

  float blurFactor = properties.b;

  vec4 prevClipSpace = projectionMatrix * prevViewMatrix * vec4(position, 1.0);
  vec4 clipSpace = projectionMatrix * viewMatrix * vec4(position, 1.0);

  vec3 NDCPos = (clipSpace / clipSpace.w).xyz;
  vec3 PrevNDCPos = (prevClipSpace / prevClipSpace.w).xyz;
  vec2 mv = blurFactor * (NDCPos - PrevNDCPos).xy * 0.5 + 0.5;
  motionVector = vec4(mv, 0, 1);

  if (normal == vec3(0)) {
    discard;
  }

  #ifdef DEBUG_ALBEDO
  fragColor = vec4(albedo, 1);
  return;
  #endif

  #ifdef DEBUG_NORMAL
  fragColor = vec4(normal, 1);
  return;
  #endif

  float _ao = 1.;
  float _roughness = properties.r;
  float _metallic = properties.g;
  vec3 _emission = vec3(0);

  _roughness = clamp(_roughness, 0.01, 0.99);

  vec3 V = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - position);
  vec3 N = normal;
  vec3 R = reflect(-V, N);

  float f0 = 0.04;

  vec3 col = vec3(0);
  // col += ambientColor;

  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * vec4(position, 1);
  }
  float shadowAmount = getShadowAmount(position, dot(N, sunDirection.xyz));

  col += IBL(N, V, R, albedo, _metallic, _roughness, f0) * _ao * (environmentMinLight + shadowAmount * (1. - environmentMinLight));
  
  if (sunIntensity.xyz != vec3(0) && shadowAmount > 0.01) {
    col += DirectionalLight(position, N, V, sunDirection.xyz, sunIntensity.xyz, albedo, _metallic, _roughness, f0) * _ao * shadowAmount;
  }

  for (int i = 0; i < int(nrLights); i++) {
    LightInfo light = lights[i];
    if (light.type == 0) {
      col += PositionalLight(position, N, V, light.position, light.color, albedo.rgb, _metallic, _roughness, f0);
    }
    else if (light.type == 1) {
      col += Spotlight(position, N, V, light.position, light.direction, light.angle, light.color, albedo.rgb, _metallic, _roughness, f0);
    }
    else if (light.type == 2) {
      col += DirectionalLight(position, N, V, light.direction, light.color, albedo.rgb, _metallic, _roughness, f0);
    }
  }

  col += _emission;

  #ifdef USEFOG
    col = applyFog(col, position);
  #endif

  fragColor = vec4(col, 1);
}
`;

vertex = vertex.trim();
fragment = fragment.trim();

export {
  vertex,
  fragment
};