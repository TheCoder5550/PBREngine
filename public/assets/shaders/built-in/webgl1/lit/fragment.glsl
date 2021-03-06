#extension GL_EXT_shader_texture_lod : enable
#extension GL_OES_standard_derivatives : enable

precision highp float;

#ifndef GL_EXT_shader_texture_lod
vec4 textureCubeLodEXT(samplerCube t, vec3 n, float lod) {
  return textureCube(t, n);
}
#endif

const float PI = 3.141592;

// Attributes
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying mat3 vTBN;

uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

// Material properties
uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform sampler2D normalTexture;
uniform bool useNormalTexture;
uniform sampler2D metallicRoughnessTexture;
uniform bool useMetallicRoughnessTexture;
uniform sampler2D emissiveTexture;
uniform bool useEmissiveTexture;
uniform sampler2D occlusionTexture;
uniform bool useOcclusionTexture;

uniform vec4 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissiveFactor;
float ao = 1.;
uniform bool opaque;
uniform float alphaCutoff;
uniform float normalStrength;
uniform bool doNoTiling;

// bruh make shared uniform into uniform block
// Light info
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

// Environment
uniform float environmentIntensity;
uniform samplerCube u_diffuseIBL;
uniform samplerCube u_specularIBL;
uniform sampler2D u_splitSum;

// Shadows
float shadowDarkness = 0.;
vec2 shadowStepSize = 1. / vec2(1024);
const int shadowKernalSize = 3;
mat3 shadowKernel = mat3(
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
);

const int levels = 2;
// in vec4 projectedTexcoords[levels];
uniform float biases[levels];
uniform sampler2D projectedTextures[levels];

// Debug
uniform sampler2D unsued2D;
uniform samplerCube unsued3D;

// No tiling
vec4 hash4(vec2 p);
vec2 hash(vec2 p);

// Texture sampling
vec4 sampleTexture(sampler2D samp, vec2 uv);

//Normal map
vec3 setNormalStrength(vec3 normal, float strength);

// Shadow functions
bool inRange(vec3 projCoord);
float getShadowAmount();

// PBR
vec3 fresnelSchlick(float cosTheta, vec3 F0);
vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness);
float DistributionGGX(vec3 N, vec3 H, float roughness);
float GeometrySchlickGGX(float NdotV, float roughness);
float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness);
vec3 IBL (vec3 N, vec3 V, vec3 R, vec3 albedo, float metallic, float roughness, float scalarF0);
vec3 DirectionalLight (vec3 worldPos, vec3 N, vec3 V, vec3 lightDir, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0);
vec3 PositionalLight (vec3 worldPos, vec3 N, vec3 V, vec3 lightPos, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0);
vec3 Spotlight (vec3 worldPos, vec3 N, vec3 V, vec3 lightPos, vec3 dir, float angle, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0);
vec4 lit(vec4 _albedo, float _alphaCutoff, vec3 _emission, vec3 _tangentNormal, float _metallic, float _roughness, float _ao);

void main() {
  vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo *= vec4(vec3(1) - vColor, 1);

  vec3 _emission = emissiveFactor;
  if (useEmissiveTexture) {
    _emission *= sampleTexture(emissiveTexture, vUV).rgb;
  }

  float _ao = ao;
  if (useOcclusionTexture) {
    _ao *= sampleTexture(occlusionTexture, vUV).r;
  }

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = sampleTexture(metallicRoughnessTexture, vUV).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }

  _roughness = clamp(_roughness, 0.01, 0.99);

  vec3 _tangentNormal = vec3(0, 0, 1);
  if (useNormalTexture) {
    _tangentNormal = sampleTexture(normalTexture, vUV).rgb * 2. - 1.;

    if (normalStrength != 0.) {
    _tangentNormal = setNormalStrength(_tangentNormal, normalStrength);
    }
  }

  gl_FragColor = lit(currentAlbedo, alphaCutoff, _emission, _tangentNormal, _metallic, _roughness, _ao);
}

// Texture sampling
vec4 sampleTexture(sampler2D samp, vec2 uv) {
  return texture2D(samp, uv);
}

//Normal map
vec3 setNormalStrength(vec3 normal, float strength) {
  return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
}

// Shadow functions
bool inRange(vec3 projCoord) {
  return projCoord.x >= 0.0 &&
      projCoord.x <= 1.0 &&
      projCoord.y >= 0.0 &&
      projCoord.y <= 1.0;
}

float getShadowAmount() {
  return 1.;
}

// PBR
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(max(1.0 - cosTheta, 0.0), 5.0);
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
    
  vec3 irradiance = textureCube(u_diffuseIBL, N).rgb;
  vec3 diffuse  = irradiance * albedo;
    
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 prefilteredColor = textureCubeLodEXT(u_specularIBL, R, roughness * MAX_REFLECTION_LOD).rgb;   
  vec2 envBRDF = texture2D(u_splitSum, vec2(max(dot(N, V), 0.), roughness)).rg;
  vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
    
  vec3 ambient = (kD * diffuse + specular) * ao;

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
  return (kD * albedo / PI + specular) * radiance * NdotL;  
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

vec4 lit(vec4 _albedo, float _alphaCutoff, vec3 _emission, vec3 _tangentNormal, float _metallic, float _roughness, float _ao) {
  if (_albedo.a <= _alphaCutoff) {
    discard;
  }

  if (opaque) {
    _albedo.a = 1.;
  }

  // vec3 N = normalize(mat3(modelMatrix) * vNormal);
  vec3 V = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);

  vec3 N = normalize(vTBN * _tangentNormal);
  if (!gl_FrontFacing) {
    N *= -1.;
  }

  vec3 R = reflect(-V, N);

  float f0 = 0.04;

  vec3 col = vec3(0);
  col += IBL(N, V, R, _albedo.rgb, _metallic, _roughness, f0) * _ao * environmentIntensity;
  
  if (sunIntensity != vec3(0)) {
    col += DirectionalLight(vPosition, N, V, sunDirection, sunIntensity, _albedo.rgb, _metallic, _roughness, f0) * _ao * getShadowAmount();
  }

  for (int i = 0; i < maxLights; i++) {
    if (i < nrLights) {
      LightInfo light = lights[i];
      if (light.type == 0) {
        col += PositionalLight(vPosition, N, V, light.position, light.color, _albedo.rgb, _metallic, _roughness, f0);
      }
      else if (light.type == 1) {
        col += Spotlight(vPosition, N, V, light.position, light.direction, light.angle, light.color, _albedo.rgb, _metallic, _roughness, f0);
      }
    }
  }

  // if (nrLights >= 1) {
  //   const int i = 0;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 2) {
  //   const int i = 1;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 3) {
  //   const int i = 2;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 4) {
  //   const int i = 3;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 5) {
  //   const int i = 4;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 6) {
  //   const int i = 5;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 7) {
  //   const int i = 6;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }
  // if (nrLights >= 8) {
  //   const int i = 7;
  //   if (lights[i].type == 0)      col += PositionalLight(vPosition, N, V, lights[i].position, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  //   else if (lights[i].type == 1) col += Spotlight(vPosition, N, V, lights[i].position, lights[i].direction, lights[i].angle, lights[i].color, _albedo.rgb, _metallic, _roughness, f0);
  // }

  col += _emission;

  return vec4(col, _albedo.a);
}








// #extension GL_EXT_shader_texture_lod : enable
// precision highp float;

// #ifndef GL_EXT_shader_texture_lod
// vec4 textureCubeLodEXT(samplerCube t, vec3 n, float lod) {
//   return textureCube(t, n);
// }
// #endif

// varying vec3 vPosition;
// varying vec3 vNormal;
// varying vec3 vTangent;
// varying vec3 vColor;
// varying vec2 vUV;
// varying mat3 vTBN;

// uniform sampler2D albedoTexture;
// uniform bool useTexture;
// uniform sampler2D normalTexture;
// uniform bool useNormalTexture;
// uniform sampler2D metallicRoughnessTexture;
// uniform bool useMetallicRoughnessTexture;
// uniform sampler2D emissiveTexture;
// uniform bool useEmissiveTexture;
// uniform sampler2D occlusionTexture;
// uniform bool useOcclusionTexture;

// uniform mat4 inverseViewMatrix;
// uniform mat4 modelMatrix;

// uniform samplerCube u_diffuseIBL;
// uniform samplerCube u_specularIBL;
// uniform sampler2D u_splitSum;

// uniform vec3 sunDirection;
// uniform vec3 sunIntensity;

// float shadowDarkness = 0.;

// uniform vec4 albedo;
// uniform float metallic;
// uniform float roughness;
// uniform vec3 emissiveFactor;
// float ao = 1.;

// uniform bool opaque;
// uniform float alphaCutoff;

// uniform bool doNoTiling;

// const float PI = 3.141592;

// vec2 hash( vec2 p ) // replace this by something better
// {
// 	p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
// 	return -1.0 + 2.0*fract(sin(p)*43758.5453123);
// }

// float noise( in vec2 p )
// {
//   const float K1 = 0.366025404; // (sqrt(3)-1)/2;
//   const float K2 = 0.211324865; // (3-sqrt(3))/6;

// 	vec2  i = floor( p + (p.x+p.y)*K1 );
//   vec2  a = p - i + (i.x+i.y)*K2;
//   float m = step(a.y,a.x); 
//   vec2  o = vec2(m,1.0-m);
//   vec2  b = a - o + K2;
// 	vec2  c = a - 1.0 + 2.0*K2;
//   vec3  h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
// 	vec3  n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
//   return (dot( n, vec3(70.0) ) + 1.) / 2.;
// }

// // Texture sampling
// vec4 sampleTexture(sampler2D samp, vec2 uv) {
//   return texture2D(samp, uv);
// }

// //Shadows
// vec2 shadowStepSize = 1. / vec2(1024);
// const int shadowKernalSize = 3;
// mat3 shadowKernel = mat3(
//   1, 2, 1,
//   2, 4, 2,
//   1, 2, 1
// );

// const int levels = 2;
// uniform float biases[levels];
// uniform sampler2D projectedTextures[levels];
// // varying vec4 projectedTexcoords[levels];

// bool inRange(vec3 projCoord) {
//   return projCoord.x >= 0.0 &&
//       projCoord.x <= 1.0 &&
//       projCoord.y >= 0.0 &&
//       projCoord.y <= 1.0;
// }

// float getShadowAmount() {
//   // vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
//   // float currentDepth = proj.z + biases[0];
//   // float projectedDepth = texture2D(projectedTextures[0], proj.xy).r;
//   // bool inside = inRange(proj);
  
//   // if (inside) {
//   //   return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
//   // }
  
//   // proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
//   // currentDepth = proj.z + biases[1];
//   // projectedDepth = texture2D(projectedTextures[1], proj.xy).r;
//   // inside = inRange(proj);

//   // if (inside) {
//   //   return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
//   // }

//   return 1.;
// }

// // PBR
// vec3 fresnelSchlick(float cosTheta, vec3 F0) {
//   return F0 + (1.0 - F0) * pow(max(1.0 - cosTheta, 0.0), 5.0);
// }

// vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
//   return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
// } 

// float DistributionGGX(vec3 N, vec3 H, float roughness) {
//   float a      = roughness*roughness;
//   float a2     = a*a;
//   float NdotH  = max(dot(N, H), 0.0);
//   float NdotH2 = NdotH*NdotH;

//   float num   = a2;
//   float denom = (NdotH2 * (a2 - 1.0) + 1.0);
//   denom = PI * denom * denom;

//   return num / denom;
// }

// float GeometrySchlickGGX(float NdotV, float roughness) {
//   float r = (roughness + 1.0);
//   float k = (r*r) / 8.0;

//   float num   = NdotV;
//   float denom = NdotV * (1.0 - k) + k;

//   return num / denom;
// }

// float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
//   float NdotV = max(dot(N, V), 0.0);
//   float NdotL = max(dot(N, L), 0.0);
//   float ggx2  = GeometrySchlickGGX(NdotV, roughness);
//   float ggx1  = GeometrySchlickGGX(NdotL, roughness);

//   return ggx1 * ggx2;
// }

// vec3 IBL (vec3 N, vec3 V, vec3 R, vec3 albedo, float metallic, float roughness, float scalarF0) {
//   vec3 F0 = vec3(scalarF0); 
//   F0 = mix(F0, albedo, metallic);
//   vec3 F = fresnelSchlickRoughness(max(dot(N, V), 0.), F0, roughness);

//   vec3 kS = F;
//   vec3 kD = 1.0 - kS;
//   kD *= 1.0 - metallic;
    
//   vec3 irradiance = textureCube(u_diffuseIBL, N).rgb;
//   vec3 diffuse  = irradiance * albedo;
    
//   const float MAX_REFLECTION_LOD = 4.0;
//   vec3 prefilteredColor = textureCubeLodEXT(u_specularIBL, R, roughness * MAX_REFLECTION_LOD).rgb;   
//   vec2 envBRDF = texture2D(u_splitSum, vec2(max(dot(N, V), 0.), roughness)).rg;
//   vec3 specular = prefilteredColor * (F * envBRDF.x + envBRDF.y);
    
//   vec3 ambient = (kD * diffuse + specular) * ao;

//   return ambient;
// }

// vec3 DirectionalLight (vec3 worldPos, vec3 N, vec3 V, vec3 lightDir, vec3 lightColor, vec3 albedo, float metallic, float roughness, float scalarF0) {
//   vec3 L = normalize(lightDir);  
//   vec3 H = normalize(V + L);  
//   vec3 radiance     = lightColor;     
//   vec3 F0 = vec3(scalarF0); 
//   F0      = mix(F0, albedo, metallic);
//   vec3 F  = fresnelSchlick(max(dot(H, V), 0.0), F0);    
//   float NDF = DistributionGGX(N, H, roughness);       
//   float G   = GeometrySmith(N, V, L, roughness);     
//   vec3 nominator    = NDF * G * F;
//   float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.001; 
//   vec3 specular     = nominator / denominator;       
//   vec3 kS = F;
//   vec3 kD = vec3(1.0) - kS;
    
//   kD *= 1.0 - metallic;     
//   float NdotL = max(dot(N, L), 0.0);        
//   return (kD * albedo / PI + specular) * radiance * NdotL;  
// }

// void main() {
//   vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, vUV) : vec4(1);
//   currentAlbedo *= albedo;

//   if (currentAlbedo.a <= alphaCutoff) {
//     discard;
//   }

//   if (opaque) {
//     currentAlbedo.a = 1.;
//   }

//   float _metallic = metallic;
//   float _roughness = roughness;
//   if (useMetallicRoughnessTexture) {
//     vec3 ts = sampleTexture(metallicRoughnessTexture, vUV).rgb;
//     _metallic *= ts.b;
//     _roughness *= ts.g;
//   }

//   _roughness = clamp(_roughness, 0.01, 0.99);

//   float _ao = ao;
//   if (useOcclusionTexture) {
//     _ao *= sampleTexture(occlusionTexture, vUV).r;
//   }

//   vec3 N = normalize(mat3(modelMatrix) * vNormal);
//   vec3 V = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);

//   if (useNormalTexture && vTangent != vec3(0)) {
//     vec3 tangentNormal = sampleTexture(normalTexture, vUV).rgb * 2. - 1.;
//     N = normalize(vTBN * tangentNormal);
//   }

//   if (!gl_FrontFacing) {
//     N *= -1.;
//   }

//   vec3 R = reflect(-V, N);

//   float f0 = 0.04;

//   vec3 col = vec3(0);
//   col += IBL(N, V, R, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao;
//   if (sunIntensity != vec3(0)) {
//     col += DirectionalLight(vPosition, N, V, sunDirection, sunIntensity, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao * getShadowAmount();
//   }

//   if (useEmissiveTexture) {
//     col += sampleTexture(emissiveTexture, vUV).rgb * emissiveFactor;
//   }
//   else {
//     col += emissiveFactor;
//   }

//   gl_FragColor = vec4(col, currentAlbedo.a);
//   return;
// }