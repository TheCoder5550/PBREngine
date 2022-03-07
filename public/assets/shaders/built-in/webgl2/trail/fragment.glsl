#version 300 es
precision highp float;

layout (location = 0) out vec4 fragColor;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vColor;
in vec2 vUV;
in mat3 vTBN;
in float vAlpha;

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

float alphaCutoff = 0.3;
float shadowDarkness = 0.;

uniform vec4 albedo;
uniform float metallic;
uniform float roughness;
uniform vec3 emissiveFactor;
float ao = 1.;

uniform bool doNoTiling;

const float PI = 3.141592;

// No tiling
vec4 hash4( vec2 p ) { return fract(sin(vec4( 1.0+dot(p,vec2(37.0,17.0)), 
                                              2.0+dot(p,vec2(11.0,47.0)),
                                              3.0+dot(p,vec2(41.0,29.0)),
                                              4.0+dot(p,vec2(23.0,31.0))))*103.0); }


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

vec2 hash( vec2 p ) // replace this by something better
{
	p = vec2( dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)) );
	return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec2 p )
{
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
// vec3 normalStrength(vec3 normal, float strength) {
//   return vec3(normal.xy * strength, mix(1., normal.z, clamp(strength, 0., 1.)));
// }

// mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv) {
//     // get edge vectors of the pixel triangle
//     vec3 dp1 = dFdx( p );
//     vec3 dp2 = dFdy( p );
//     vec2 duv1 = dFdx( uv );
//     vec2 duv2 = dFdy( uv );
 
//     // solve the linear system
//     vec3 dp2perp = cross( dp2, N );
//     vec3 dp1perp = cross( N, dp1 );
//     vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
//     vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
 
//     // construct a scale-invariant frame 
//     float invmax = inversesqrt( max( dot(T,T), dot(B,B) ) );
//     return mat3( T * invmax, B * invmax, N );
// }

// vec3 perturb_normal( vec3 N, vec3 V, vec2 texcoord, float strength ) {
//   // assume N, the interpolated vertex normal and 
//   // V, the view vector (vertex to eye)
//   vec3 map = sampleTexture(normalTexture, texcoord).xyz;
//   map = map * 255./127. - 128./127.;
//   map = normalStrength(map, strength);

//   mat3 TBN = cotangent_frame(N, V, texcoord);
//   return normalize(TBN * map);
// }

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


  // vec3 proj = projectedTexcoords[0].xyz / projectedTexcoords[0].w;
  // float currentDepth = proj.z + biases[0];
  // bool inside = inRange(proj);

  // if (inside) {
  //   float sum = 0.0;
  //   for (int j = -shadowKernalSize / 2; j <= shadowKernalSize / 2; j++) {
  //     for (int k = -shadowKernalSize / 2; k <= shadowKernalSize / 2; k++) {
  //       float projectedDepth = 0.;//texture(projectedTextures[0], proj.xy + shadowStepSize * vec2(j, k)).r;
  //       sum += (projectedDepth <= currentDepth ? shadowDarkness : 1.) * shadowKernel[j + 1][k + 1];
  //     }
  //   }

  //   return sum / 16.;
  // }

  // proj = projectedTexcoords[1].xyz / projectedTexcoords[1].w;
  // currentDepth = proj.z + biases[1];
  // float projectedDepth = texture(projectedTextures[1], proj.xy).r;
  // inside = inRange(proj);

  // if (inside) {
  //   return (projectedDepth <= currentDepth ? shadowDarkness : 1.);
  // }

  // return 1.;




  // if (!inside) {
  //   const int i = 1;
  //   proj = projectedTexcoords[i].xyz / projectedTexcoords[i].w;
  //   currentDepth = proj.z + biases[i];
  //   inside = inRange(proj);

  //   if (inside) {
  //     float sum = 0.0;
  //     for (int j = -shadowKernalSize / 2; j <= shadowKernalSize / 2; j++) {
  //       for (int k = -shadowKernalSize / 2; k <= shadowKernalSize / 2; k++) {
  //         float projectedDepth = texture(projectedTextures[i], proj.xy + shadowStepSize * vec2(j, k)).r;
  //         sum += (projectedDepth <= currentDepth ? shadowDarkness : 1.) * shadowKernel[j + 1][k + 1];
  //       }
  //     }

  //     shadowAmount = sum / 16.;
  //   }
  // }

  // return shadowAmount;
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

void main() {
  // fragColor = vec4(1, 0, 0, vAlpha);
  // return;

  vec4 currentAlbedo = useTexture ? sampleTexture(albedoTexture, vUV) : vec4(1);
  currentAlbedo *= albedo;
  currentAlbedo *= vec4(1, 1, 1, vAlpha);

  // if (doNoTiling) {
  //   currentAlbedo = mix(vec3(0.2), currentAlbedo, noise(vUV / 5.));
  // }

  // if (currentAlbedo.a < alphaCutoff) {
  //   discard;
  // }

  float _metallic = metallic;
  float _roughness = roughness;
  if (useMetallicRoughnessTexture) {
    vec3 ts = sampleTexture(metallicRoughnessTexture, vUV).rgb;
    _metallic *= ts.b;
    _roughness *= ts.g;
  }

  _roughness = clamp(_roughness, 0.01, 0.99);

  float _ao = ao;
  if (useOcclusionTexture) {
    _ao *= sampleTexture(occlusionTexture, vUV).r;
  }

  vec3 N = normalize(mat3(modelMatrix) * vNormal);
  vec3 V = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition);

  if (useNormalTexture && vTangent != vec3(0)) {
    vec3 tangentNormal = sampleTexture(normalTexture, vUV).grb * 2. - 1.;
    N = normalize(vTBN * tangentNormal);

    // N = perturb_normal(N, V, vUV, 1.);

    // fragColor = vec4(transpose(vTBN) * (N - (-normalize(mat3(modelMatrix) * vNormal))), 1.);
    // fragColor = vec4(abs(tangentNormal), 1);
    // return;
  }

  if (!gl_FrontFacing) {
    N *= -1.;
  }

  // fragColor = vec4(vec3(max(dot(N, sunDirection), 0.)), 1);
  // fragColor = vec4(max(vec3(0), N), 1);
  // return;

  vec3 R = reflect(-V, N);

  float f0 = 0.04;

  vec3 col = vec3(0);
  col += IBL(N, V, R, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao;
  if (sunIntensity != vec3(0)) {
    col += DirectionalLight(vPosition, N, V, sunDirection, sunIntensity, currentAlbedo.rgb, _metallic, _roughness, f0) * _ao * getShadowAmount();
  }

  if (useEmissiveTexture) {
    col += sampleTexture(emissiveTexture, vUV).rgb * emissiveFactor;
  }
  else {
    col += emissiveFactor;
  }

  fragColor = vec4(col, currentAlbedo.a);
  return;


  // // vec4 baseColor = texture(albedoTexture, vUV);
  // vec4 baseColor = useTexture ? texture(albedoTexture, vUV) : vec4(1);
  // if (baseColor.a < 0.1) {
  //   discard;
  // }

  // vec3 viewDirection = normalize(vec3(inverseViewMatrix * vec4(0, 0, 0, 1)) - vPosition); 
  // vec3 H = normalize(sunDirection + viewDirection);

  // vec3 worldNormal = normalize(mat3(modelMatrix) * vNormal);
  // if (useNormalTexture) {
  //   // vec3 worldTangent = normalize(mat3(modelMatrix) * vTangent);

  //   // float normalMapStrength = 0.3;
  //   // vec3 normalMap = tangentToObject(worldNormal, worldTangent, normalStrength(vec3(texture(normalTexture, vUV)) * 2. - 1., normalMapStrength));
  //   // worldNormal = normalMap;

  //   worldNormal = perturb_normal(worldNormal, viewDirection, vUV);
  // }

  // float shadowAmount = getShadowAmount();

  // float reflectionSharpness = 0.;//10.
  // vec3 reflection = textureLod(u_specularIBL, reflect(-viewDirection, worldNormal), reflectionSharpness).xyz;
  // vec3 specular = vec3(specularIntensity) * pow(clamp(dot(worldNormal, H), 0., 1.), specularSharpness) * 1.5;

  // float shade = (dot(worldNormal, sunDirection) * 0.5 + 0.5) * 1.2;
  // // float shade = clamp(dot(worldNormal, sunDirection), 0.3, 1.) * 1.7;
  // vec3 shadowColor = vec3(39, 38, 43) / 255.;
  // vec3 color = (float(shadowAmount == 1.) * specular + albedo * baseColor.rgb * shade * 1.5) * mix(shadowColor, vec3(1), shadowAmount);

  // vec3 outputColor = color + reflection * 0.1;
  // fragColor = vec4(outputColor, 1);
}