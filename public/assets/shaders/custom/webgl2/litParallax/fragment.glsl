#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

uniform sampler2D heightmapTexture;

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

uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

uniform samplerCube u_diffuseIBL;
uniform samplerCube u_specularIBL;
uniform sampler2D u_splitSum;

uniform vec3 sunDirection;
uniform vec3 sunIntensity;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
// in vec3 vTangentViewDirection;

uniform vec4 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissiveFactor;
float ao = 1.;

float alphaCutoff = 0.3;
float shadowDarkness = 0.;

const float PI = 3.141592;

vec4 sampleTexture(sampler2D samp, vec2 uv) {
  return texture(samp, uv);
}

//Normal map
vec3 normalStrength(vec3 normal, float strength) {
  return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
}

mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv) {
    // get edge vectors of the pixel triangle
    vec3 dp1 = dFdx( p );
    vec3 dp2 = dFdy( p );
    vec2 duv1 = dFdx( uv );
    vec2 duv2 = dFdy( uv );
 
    // solve the linear system
    vec3 dp2perp = cross( dp2, N );
    vec3 dp1perp = cross( N, dp1 );
    vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
 
    // construct a scale-invariant frame 
    float invmax = inversesqrt( max( dot(T,T), dot(B,B) ) );
    return mat3( T * invmax, B * invmax, N );
}

vec3 perturb_normal( vec3 N, vec3 V, vec2 texcoord, float strength ) {
  // assume N, the interpolated vertex normal and 
  // V, the view vector (vertex to eye)
  vec3 map = texture(normalTexture, texcoord ).xyz;
  map = map * 255./127. - 128./127.;
  map = normalStrength(map, strength);

  mat3 TBN = cotangent_frame(N, -V, texcoord);
  return normalize(TBN * map);
}

vec3 tangentToObject(vec3 normal, vec3 tangent, vec3 normalMapTangent) {
  vec3 bitangent = cross(normal, tangent);
  return normalMapTangent * mat3(
    tangent.x, bitangent.x, normal.x,
    tangent.y, bitangent.y, normal.y,
    tangent.z, bitangent.z, normal.z
  );
}

//Shadows
vec2 shadowStepSize = 1. / vec2(1024);
const int shadowKernalSize = 3;
mat3 shadowKernel = mat3(
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
);

const int levels = 2;
uniform float biases[levels];
uniform sampler2D projectedTextures[levels];
in vec4 projectedTexcoords[levels];

bool inRange(vec3 projCoord) {
  return projCoord.x >= 0.0 &&
      projCoord.x <= 1.0 &&
      projCoord.y >= 0.0 &&
      projCoord.y <= 1.0;
}

float getShadowAmount() {
  float shadowAmount = 1.0;
  //for (int i = 0; i < levels; i++) {
    vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
    float currentDepth = proj.z + biases[0];
    bool inside = inRange(proj);

    if (inside) {
      float sum = 0.0;
      for (int j = -shadowKernalSize / 2; j <= shadowKernalSize / 2; j++) {
        for (int k = -shadowKernalSize / 2; k <= shadowKernalSize / 2; k++) {
          float projectedDepth = texture(projectedTextures[0], proj.xy + shadowStepSize * vec2(j, k)).r;
          sum += (projectedDepth <= currentDepth ? 0.4 : 1.) * shadowKernel[j + 1][k + 1];
        }
      }

      shadowAmount = sum / 16.;
      //break;
    }
  //}

  if (!inside) {
    const int i = 1;
    proj = projectedTexcoords[i].xyz / projectedTexcoords[i].w;
    currentDepth = proj.z + biases[i];
    inside = inRange(proj);

    if (inside) {
      float sum = 0.0;
      for (int j = -shadowKernalSize / 2; j <= shadowKernalSize / 2; j++) {
        for (int k = -shadowKernalSize / 2; k <= shadowKernalSize / 2; k++) {
          float projectedDepth = texture(projectedTextures[i], proj.xy + shadowStepSize * vec2(j, k)).r;
          sum += (projectedDepth <= currentDepth ? 0.4 : 1.) * shadowKernel[j + 1][k + 1];
        }
      }

      shadowAmount = sum / 16.;
    }
  }

  return shadowAmount;
}

// PBR
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(max(1.0 - cosTheta, 0.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(1.0 - cosTheta, 5.0);
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
    
  const float MAX_REFLECTION_LOD = 5.0;
  vec3 prefilteredColor = textureLod(u_specularIBL, R, roughness * MAX_REFLECTION_LOD).rgb;   
  vec2 envBRDF = texture(u_splitSum, vec2(max(dot(N, V), 0.), roughness)).rg;
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

vec2 ParallaxMapping(vec2 texCoords, vec3 viewDir);

void main() {
  vec3 T   = normalize(mat3(modelMatrix) * vTangent);
  vec3 B   = normalize(mat3(modelMatrix) * cross(vNormal, vTangent));
  vec3 Nm   = normalize(mat3(modelMatrix) * vNormal);
  mat3 TBN = transpose(mat3(T, B, Nm));

  vec3 tangentFragPos = TBN * vPosition;
  vec3 tangentViewPos = TBN * vec3(inverseViewMatrix * vec4(0, 0, 0, 1));

  // TBN * normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition)

  vec3 tangentViewDir = normalize(tangentViewPos - tangentFragPos);

  vec2 texCoords = ParallaxMapping(vUV, tangentViewDir);

  if (texCoords.x > 1.0 || texCoords.y > 1.0 || texCoords.x < 0.0 || texCoords.y < 0.0) {
    discard;
  }

  vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, texCoords) : vec4(1);
  currentAlbedo *= albedo;

  if (currentAlbedo.a < alphaCutoff) {
    discard;
  }

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = sampleTexture(metallicRoughnessTexture, texCoords).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }

  _roughness = clamp(_roughness, 0.01, 0.99);

  float _ao = ao;
  if (useOcclusionTexture) {
    _ao *= sampleTexture(occlusionTexture, texCoords).r;
  }

  vec3 N = -normalize(mat3(modelMatrix) * vNormal);
  vec3 V = -normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);

  if (!gl_FrontFacing) {
    N *= -1.;
  }

  if (useNormalTexture) {
    // vec3 worldTangent = normalize(mat3(modelMatrix) * vTangent);

    // float normalMapStrength = 1.;
    // vec3 normalMap = tangentToObject(N, -worldTangent, normalStrength(vec3(sampleTexture(normalTexture, texCoords)) * 2. - 1., normalMapStrength));
    // N = normalMap;

    N = perturb_normal(N, V, texCoords, 1.);
  }

  vec3 R = reflect(-V, N);

  float f0 = 0.04;

  vec3 col = vec3(0);
  col += IBL(N, V, R, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao;
  if (sunIntensity != vec3(0)) {
    col += DirectionalLight(vPosition, N, V, -sunDirection, sunIntensity, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao * getShadowAmount();
  }

  if (useEmissiveTexture) {
    col += sampleTexture(emissiveTexture, texCoords).rgb * emissiveFactor;
  }
  else {
    col += emissiveFactor;
  }

  fragColor = vec4(col, currentAlbedo.a);
  return;
}

vec2 ParallaxMapping(vec2 texCoords, vec3 viewDir)
{
  float heightScale = 0.1;
  
  // number of depth layers
    const float minLayers = 8.;
    const float maxLayers = 32.;
    float numLayers = mix(maxLayers, minLayers, abs(dot(vec3(0.0, 0.0, 1.0), viewDir)));  
    // calculate the size of each layer
    float layerDepth = 1.0 / numLayers;
    // depth of current layer
    float currentLayerDepth = 0.0;
    // the amount to shift the texture coordinates per layer (from vector P)
    vec2 P = viewDir.xy / viewDir.z * heightScale; 
    vec2 deltaTexCoords = P / numLayers;
  
    // get initial values
    vec2  currentTexCoords     = texCoords;
    float currentDepthMapValue = texture(heightmapTexture, currentTexCoords).r;
      
    while(currentLayerDepth < currentDepthMapValue)
    {
        // shift texture coordinates along direction of P
        currentTexCoords -= deltaTexCoords;
        // get depthmap value at current texture coordinates
        currentDepthMapValue = texture(heightmapTexture, currentTexCoords).r;  
        // get depth of next layer
        currentLayerDepth += layerDepth;  
    }
    
    // get texture coordinates before collision (reverse operations)
    vec2 prevTexCoords = currentTexCoords + deltaTexCoords;

    // get depth after and before collision for linear interpolation
    float afterDepth  = currentDepthMapValue - currentLayerDepth;
    float beforeDepth = texture(heightmapTexture, prevTexCoords).r - currentLayerDepth + layerDepth;
 
    // interpolation of texture coordinates
    float weight = afterDepth / (afterDepth - beforeDepth);
    vec2 finalTexCoords = prevTexCoords * weight + currentTexCoords * (1.0 - weight);

    return finalTexCoords;
} 