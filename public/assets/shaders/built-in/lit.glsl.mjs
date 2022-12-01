/*

  Shader bases

*/

function trimStrings(obj) {
  for (var key in obj) {
    var e = obj[key];
    if (typeof e === "object") {
      trimStrings(e);
    }
    else if (typeof e === "string") {
      obj[key] = obj[key].trim();
    }
  }
}

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

const int OCTAVES = 4;
float LayeredNoise(vec2 p) {
  float _noise = 0.;
  float frequency = 1.;
  float factor = 1.;

  float persistance = 0.45;
  float roughness = 3.;

  for (int i = 0; i < OCTAVES; i++) {
    _noise += noise(p * frequency + float(i) * 0.72354) * factor;
    factor *= persistance;
    frequency *= roughness;
  }

  return _noise;
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
        
      //   if (texture(projectedTextures[0], proj.xy + poissonDisk[index] * shadowStepSize * 3.).r < currentDepth) {
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

      return sum / float(shadowKernalSize * shadowKernalSize);

      // // bruh double calc
      // vec3 projNext = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
      // float depthNext = projNext.z + biases[1];
      // float projectedDepthNext = texture(projectedTextures[1], projNext.xy).r;
      // float nextVis = (projectedDepthNext <= depthNext ? shadowDarkness : 1.);

      // return fadeToNextShadowMap(sum / float(shadowKernalSize * shadowKernalSize), nextVis, proj);
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

var fogBase = `
const vec4 fogColor = vec4(0.23, 0.24, 0.26, 1);
const float density = 0.005;

vec4 applyFog(vec4 color) {
  float distance = length(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);
  float fogAmount = exp(-pow(distance * density, 2.));
  
  return mix(fogColor, color, fogAmount);
}
`;

/*

  Webgl 2

*/

// vertex
var webgl2Vertex = `
${shaderBase}

in vec3 position;
in vec3 normal;
in vec3 tangent;
in vec3 color;
in vec2 uv;
//#in

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vColor;
out vec2 vUV;
out mat3 vTBN;
//#out

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
  //#main

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

var webgl2VertexSkinned = `
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
out mat4 vSkin;

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

//Skinning
in vec4 weights;
in vec4 joints;

uniform sampler2D u_jointTexture;
uniform float u_numJoints;

// these offsets assume the texture is 4 pixels across
#define ROW0_U ((0.5 + 0.0) / 4.)
#define ROW1_U ((0.5 + 1.0) / 4.)
#define ROW2_U ((0.5 + 2.0) / 4.)
#define ROW3_U ((0.5 + 3.0) / 4.)
 
mat4 getBoneMatrix(float jointNdx) {
  float v = (jointNdx + 0.5) / u_numJoints;
  return mat4(
    texture(u_jointTexture, vec2(ROW0_U, v)),
    texture(u_jointTexture, vec2(ROW1_U, v)),
    texture(u_jointTexture, vec2(ROW2_U, v)),
    texture(u_jointTexture, vec2(ROW3_U, v))
  );
}

//Shadows
uniform mat4 textureMatrices[levels];
out vec4 projectedTexcoords[levels];

void main() {
  vTangent = tangent;
  vUV = uv;
  vColor = color;

  mat4 skinMatrix = getBoneMatrix(joints[0]) * weights[0] +
                    getBoneMatrix(joints[1]) * weights[1] +
                    getBoneMatrix(joints[2]) * weights[2] +
                    getBoneMatrix(joints[3]) * weights[3];
  
  mat4 world = modelMatrix * skinMatrix;
  // mat4 world = skinMatrix * modelMatrix;
  // mat4 world = modelMatrix;

  mat4 TBNWorld = modelMatrix * skinMatrix * modelMatrix;
  vec3 _T = normalize(vec3(TBNWorld * vec4(tangent, 0.0)));
  vec3 _B = normalize(vec3(TBNWorld * vec4(cross(normal, tangent), 0.0)));
  vec3 _N = normalize(vec3(TBNWorld * vec4(normal, 0.0)));
  vTBN = mat3(_T, _B, _N);

  vec4 worldPosition = world * vec4(position, 1.0);
  for (int i = 0; i < levels; i++) {
    projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  }
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  vPosition = worldPosition.xyz;
  vNormal = normal;
  // vNormal = mat3(inverse(modelMatrix * skinMatrix)) * normal;
  // vNormal = mat3(world * inverse(modelMatrix)) * normal;

  vSkin = skinMatrix;
}
`;

var webgl2VertexTrail = webgl2Vertex;
webgl2VertexTrail = webgl2VertexTrail.replace("//#in", "in float alpha;");
webgl2VertexTrail = webgl2VertexTrail.replace("//#out", "out float vAlpha;");
webgl2VertexTrail = webgl2VertexTrail.replace("//#main", "vAlpha = alpha;");

// Fragment
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
//#in

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

uniform int shadowQuality; // = 2;
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

${fogBase}

void main() {
  // fragColor = vec4(vNormal, 1);
  // return;

  vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo.xyz *= vec3(1) - vColor;
  //#currentAlbedo

  if (doNoTiling) {
    currentAlbedo.rgb *= mix(vec3(1.0), vec3(0.4, 0.7, 0.4), clamp(LayeredNoise(vUV / 40.), 0., 1.));
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
  if (useNormalTexture) {
    _tangentNormal = sampleTexture(normalTexture, vUV).rgb * 2. - 1.;
    _tangentNormal = setNormalStrength(_tangentNormal, normalStrength);
  }

  vec4 litColor = lit(currentAlbedo, alphaCutoff, _emission, _tangentNormal, _metallic, _roughness, _ao);
 
  #ifdef USEFOG
    litColor = applyFog(litColor);
  #endif

  fragColor = litColor;
}
`;

var webgl2FragmentInstanced = webgl2Fragment;
webgl2FragmentInstanced = webgl2FragmentInstanced.replace(/modelMatrix/g, "vModelMatrix");
webgl2FragmentInstanced = webgl2FragmentInstanced.replace(/uniform mat4 vModelMatrix/g, "in mat4 vModelMatrix");

var webgl2FragmentSkinned = webgl2Fragment;

var webgl2FragmentTrail = webgl2Fragment;
webgl2FragmentTrail = webgl2FragmentTrail.replace("//#in", "in float vAlpha;");
webgl2FragmentTrail = webgl2FragmentTrail.replace("//#currentAlbedo", "currentAlbedo *= vec4(1, 1, 1, vAlpha);");

/*

  Webgl 1

*/

var webglVertex = `
// lit - vertex.glsl
attribute vec3 position;
attribute vec3 normal;
attribute vec3 tangent;
attribute vec3 color;
attribute vec2 uv;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vColor;
varying vec2 vUV;
varying mat3 vTBN;

//Shadows
const int levels = 2;
uniform mat4 textureMatrices[levels];
// varying vec4 projectedTexcoords[levels];

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
  // for (int i = 0; i < levels; i++) {
  //   projectedTexcoords[i] = textureMatrices[i] * worldPosition;
  // }

  vPosition = vec3(worldPosition);
  
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

var webglFragment = `
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
  
  // vec2 envBRDF = texture2D(u_splitSum, vec2(max(dot(N, V), 0.), roughness)).rg;

  vec2 uv = vec2(max(dot(N, V), 0.), roughness);
  uv.y = 1. - uv.y;
  vec2 envBRDF = texture2D(u_splitSum, uv).rg;
  
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
`;

/*

  Export

*/

webgl2Vertex = webgl2Vertex.trim();
webgl2VertexInstanced = webgl2VertexInstanced.trim();
webgl2VertexSkinned = webgl2VertexSkinned.trim();
webgl2VertexTrail = webgl2VertexTrail.trim();

webgl2Fragment = webgl2Fragment.trim();
webgl2FragmentInstanced = webgl2FragmentInstanced.trim();
webgl2FragmentSkinned = webgl2FragmentSkinned.trim();
webgl2FragmentTrail = webgl2FragmentTrail.trim();

webglVertex = webglVertex.trim();
webglFragment = webglFragment.trim();

var webgl1 = {
  lit: {
    vertex: webglVertex,
    fragment: webglFragment
  }
};
var webgl2 = {
  lit: {
    vertex: webgl2Vertex,
    fragment: webgl2Fragment
  },
  litInstanced: {
    vertex: webgl2VertexInstanced,
    fragment: webgl2FragmentInstanced
  },
  litSkinned: {
    vertex: webgl2VertexSkinned,
    fragment: webgl2FragmentSkinned
  },
  litTrail: {
    vertex: webgl2VertexTrail,
    fragment: webgl2FragmentTrail
  },
};

export {
  trimStrings,
  shaderBase,
  litBase,
  fogBase,
  webgl1,
  webgl2
};