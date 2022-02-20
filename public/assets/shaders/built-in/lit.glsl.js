var shaderBase = `
#version 300 es
precision highp float;
precision mediump int;
`;

var litBase = `
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

vec2 hash( vec2 p ) { // replace this by something better
	p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
	return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec2 p ) {
  const float K1 = 0.366025404; // (sqrt(3)-1)/2;
  const float K2 = 0.211324865; // (3-sqrt(3))/6;

	vec2  i = floor( p + (p.x+p.y)*K1 );
  vec2  a = p - i + (i.x+i.y)*K2;
  float m = step(a.y,a.x); 
  vec2  o = vec2(m,1.0-m);
  vec2  b = a - o + K2;
	vec2  c = a - 1.0 + 2.0*K2;
  vec3  h = max( 0.5-vec3(dot(a,a), dot(b,b), dot(c,c) ), 0.0 );
	vec3  n = h*h*h*h*vec3( dot(a,hash(i+0.0)), dot(b,hash(i+o)), dot(c,hash(i+1.0)));
  return (dot( n, vec3(70.0) ) + 1.) / 2.;
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

// Shadow functions
bool inRange(vec3 projCoord) {
  return projCoord.x >= 0.0 &&
      projCoord.x <= 1.0 &&
      projCoord.y >= 0.0 &&
      projCoord.y <= 1.0 &&
      projCoord.z < 1.0;
}

float fadeOutShadow(float visibility, vec3 proj) {
  return mix(visibility, 1., clamp(pow(length(proj.xy - vec2(0.5, 0.5)) * 2., 5.), 0., 1.));
}

float fadeToNextShadowMap(float v1, float v2, vec3 proj) {
  return mix(v1, v2, clamp(pow(length(proj.xy - vec2(0.5, 0.5)) * 2., 30.), 0., 1.));
}

float random(vec3 seed, int i){
      vec4 seed4 = vec4(seed,i);
      float dot_product = dot(seed4, vec4(12.9898,78.233,45.164,94.673));
      return fract(sin(dot_product) * 43758.5453);
    }

float getShadowAmount(float cosTheta) {
  if (shadowQuality == 0) {
    return 1.;
  }

  if (shadowQuality == 1) {
    vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
    float currentDepth = proj.z + biases[0];
    float projectedDepth = texture(projectedTextures[0], proj.xy).r;
    bool inside = inRange(proj);
    
    if (inside) {
      return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
    }
    
    proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
    currentDepth = proj.z + biases[1];
    projectedDepth = texture(projectedTextures[1], proj.xy).r;
    inside = inRange(proj);

    if (inside) {
      return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
    }

    return 1.;
  }

  vec2 shadowStepSize = vec2(1) / vec2(textureSize(projectedTextures[0], 0));

  if (shadowQuality >= 2) {
    vec4 ShadowCoord = projectedTexcoords[0];
    vec3 proj = ShadowCoord.xyz / ShadowCoord.w;
    float bias = -biases[0];//0.00005 * tan(acos(cosTheta));
    // bias = clamp(bias, 0., 0.01);
    float currentDepth = proj.z - bias;
    bool inside = inRange(proj);

    if (inside) {
      // float visibility = 1.;
      // for (int i=0;i<16;i++){
      //   int index = int(16.0*random(floor(vPosition.xyz*1000.0), i))%16;
        
      //   if (texture(projectedTextures[0], proj.xy + poissonDisk[index] * shadowStepSize * 2.).r < currentDepth) {
      //     visibility -= 1. / 16.;
      //   }

      //   // visibility -= 0.2*(1.0-textureProj(projectedTextures[0], vec3(ShadowCoord.xy + poissonDisk[index]/700.0, (ShadowCoord.z-bias) / ShadowCoord.w)).r);
      // }
      // return visibility;

      float sum = 0.0;
      for (float j = -shadowKernalSize / 2. + 0.5; j <= shadowKernalSize / 2. - 0.5; j++) {
        for (float k = -shadowKernalSize / 2. + 0.5; k <= shadowKernalSize / 2. - 0.5; k++) {
          // float projectedDepth = texture(projectedTextures[0], proj.xy + shadowStepSize * hash(vec2(j, k) / 1000.)).r;
          float projectedDepth = texture(projectedTextures[0], proj.xy + shadowStepSize * vec2(j, k)).r;
          sum += 1. - step(projectedDepth, currentDepth);//(projectedDepth <= currentDepth ? shadowDarkness : 1.);// * shadowKernel[j + 1][k + 1];
        }
      }

      // bruh double calc
      vec3 projNext = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
      float depthNext = projNext.z + biases[1];
      float projectedDepthNext = texture(projectedTextures[1], projNext.xy).r;
      float nextVis = (projectedDepthNext <= depthNext ? shadowDarkness : 1.);

      return fadeToNextShadowMap(sum / float(shadowKernalSize * shadowKernalSize), nextVis, proj);
      // return sum / 16.;
    }

    proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
    inside = inRange(proj);

    if (inside) {
      currentDepth = proj.z + biases[1];
      
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
    
  vec3 irradiance = texture(u_diffuseIBL, N).rgb;
  // irradiance = pow(irradiance, vec3(2.2));

  vec3 diffuse  = irradiance * albedo;
    
  const float MAX_REFLECTION_LOD = 4.0;
  vec3 prefilteredColor = textureLod(u_specularIBL, R, roughness * MAX_REFLECTION_LOD).rgb;   
  // prefilteredColor = pow(prefilteredColor, vec3(2.2)); // should not be needed

  vec2 uv = vec2(max(dot(N, V), 0.), roughness);
  // uv.x = 1. - uv.x;
  uv.y = 1. - uv.y;

  // uv.xy = uv.yx;

  vec2 envBRDF = texture(u_splitSum, uv).rg;
  // envBRDF = pow(envBRDF, vec2(1. / 2.2));

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

  vec3 N;
  if (vTangent != vec3(0)) {
    N = normalize(vTBN * _tangentNormal);
  }
  else {
    N = normalize(mat3(modelMatrix) * vNormal);
  }

  if (!gl_FrontFacing) {
    N *= -1.;
  }

  vec3 R = reflect(-V, N);

  float f0 = 0.04;

  vec3 col = vec3(0);
  col += IBL(N, V, R, _albedo.rgb, _metallic, _roughness, f0) * _ao;
  
  if (sunIntensity.xyz != vec3(0)) {
    col += DirectionalLight(vPosition, N, V, sunDirection.xyz, sunIntensity.xyz, _albedo.rgb, _metallic, _roughness, f0) * _ao * getShadowAmount(dot(sunDirection.xyz, N));
  }

  for (int i = 0; i < int(nrLights); i++) {
    LightInfo light = lights[i];
    if (light.type == 0) {
      col += PositionalLight(vPosition, N, V, light.position, light.color, _albedo.rgb, _metallic, _roughness, f0);
    }
    else if (light.type == 1) {
      col += Spotlight(vPosition, N, V, light.position, light.direction, light.angle, light.color, _albedo.rgb, _metallic, _roughness, f0);
    }
    else if (light.type == 2) {
      col += DirectionalLight(vPosition, N, V, light.direction, light.color, _albedo.rgb, _metallic, _roughness, f0);
    }
  }

  col += _emission;

  return vec4(col, _albedo.a);
}
`;

var webgl2Vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;

const int levels = 2;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

//Shadows
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

var webgl2VertexInstanced = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;
in mat4 modelMatrix;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat4 vModelMatrix;
out mat3 vTBN;

const int levels = 2;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

//Shadows
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

void main() {
  vNormal = normal;
  vTangent = tangent;
  vUV = uv;
  vColor = color;
  vModelMatrix = modelMatrix;

  vec3 _T = normalize(vec3(modelMatrix * vec4(vTangent, 0.0)));
  vec3 _B = normalize(vec3(modelMatrix * vec4(cross(vNormal, vTangent), 0.0)));
  vec3 _N = normalize(vec3(modelMatrix * vec4(vNormal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

var webgl2Fragment = `
${shaderBase}

layout (location = 0) out vec4 fragColor;

// Attributes
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
in mat3 vTBN;

// Material properties
uniform sampler2D albedoTexture;
uniform bool useTexture;
uniform sampler2D normalTexture;
uniform bool useNormalMap;
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
const int maxLights = 16;
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
const int levels = 2;
in vec4 projectedTexcoords[levels];
// uniform float biases[levels];
uniform sampler2D projectedTextures[levels];

int shadowQuality = 2;
float shadowDarkness = 0.;
// vec2 shadowStepSize = 1. / vec2(1024) * 10.; // bruh
const float shadowKernalSize = 2.;
mat3 shadowKernel = mat3(
  1, 2, 1,
  2, 4, 2,
  1, 2, 1
);
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

// uniform mat4 inverseViewMatrix;
uniform mat4 modelMatrix;

uniform sharedPerScene {
  mat4 projectionMatrix;
  mat4 viewMatrix;
  mat4 inverseViewMatrix;
  float biases[levels];
};

${litBase}

void main() {
  vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor;

  if (doNoTiling) {
    currentAlbedo.rgb = mix(vec3(0.2), currentAlbedo.rgb, noise(vUV / 5.));
  }

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
  if (useNormalMap) {
    _tangentNormal = sampleTexture(normalTexture, vUV).rgb * 2. - 1.;
    _tangentNormal = setNormalStrength(_tangentNormal, normalStrength);
  }

  fragColor = lit(currentAlbedo, alphaCutoff, _emission, _tangentNormal, _metallic, _roughness, _ao);
}
`;

var webgl2FragmentInstanced = webgl2Fragment;
webgl2FragmentInstanced = webgl2FragmentInstanced.replaceAll("modelMatrix", "vModelMatrix");
webgl2FragmentInstanced = webgl2FragmentInstanced.replaceAll("uniform mat4 vModelMatrix", "in mat4 vModelMatrix");

var webglVertex = `
`;

var webglFragment = `
`;

webgl2Vertex = webgl2Vertex.trim();
webgl2VertexInstanced = webgl2VertexInstanced.trim();
webgl2Fragment = webgl2Fragment.trim();
webgl2FragmentInstanced = webgl2FragmentInstanced.trim();
webglVertex = webglVertex.trim();
webglFragment = webglFragment.trim();

var webgl1 = {
  vertex: webglVertex,
  fragment: webglFragment
};
var webgl2 = {
  lit: {
    vertex: webgl2Vertex,
    fragment: webgl2Fragment
  },
  litInstanced: {
    vertex: webgl2VertexInstanced,
    fragment: webgl2FragmentInstanced
  }
};

export {
  webgl1,
  webgl2
};