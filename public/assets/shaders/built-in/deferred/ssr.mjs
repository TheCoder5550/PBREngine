import { screenQuadVertex, shaderBase } from "../base.mjs";

var vertex = screenQuadVertex;

// var fragment = `
// ${shaderBase}

// uniform float scale;

// uniform mat4 lensProjection;
// uniform mat4 inverseViewMatrix;
// uniform mat4 viewMatrix;

// uniform sampler2D albedoTexture;
// uniform sampler2D positionTexture;
// uniform sampler2D normalTexture;
// uniform sampler2D propertiesTexture;

// uniform float maxRoughness;
// uniform float maxDistance;
// uniform float resolution;
// uniform int steps;
// uniform float thickness;

// // uniform sampler2D maskTexture;
// // uniform vec2 enabled;

// out vec4 fragColor;

// vec4 getSceneViewPos(vec2 uv) {
//   vec4 worldPos = texture(positionTexture, uv);
//   if (worldPos.xyz == vec3(0)) {
//     return vec4(0, 0, -1000, 0);
//   }

//   // return viewMatrix * vec4(worldPos.rgb, 1);
//   return worldPos;
// }

// bool isUVOutside(vec2 uv) {
//   return uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.;
// }

// float fadeOutUVBorder(vec2 uv, float falloffX, float falloffY) {
//   return smoothstep(0., falloffX, uv.x) * smoothstep(1., 1. - falloffX, uv.x) * smoothstep(0., falloffY, uv.y) * smoothstep(1., 1. - falloffY, uv.y);
// }

// float random(vec3 seed, int i){
//   vec4 seed4 = vec4(seed,i);
//   float dot_product = dot(seed4, vec4(12.9898,78.233,45.164,94.673));
//   return fract(sin(dot_product) * 43758.5453);
// }

// void main() {
//   // vec2 texSize = vec2(textureSize(positionTexture, 0).xy) * scale;
//   // vec2 texCoord = gl_FragCoord.xy / texSize;

//   // if (texture(propertiesTexture, texCoord).r > 0.5) {
//   //   fragColor = vec4(0);
//   //   return;
//   // }

//   // vec3 worldNormal = texture(normalTexture, texCoord).xyz;
//   // if (worldNormal == vec3(0)) {
//   //   fragColor = vec4(0);
//   //   return;
//   // }

//   // const float maxDistance = 64.;

//   // vec3 origin = getSceneViewPos(texCoord).xyz;
//   // vec3 viewNormal = normalize(mat3(viewMatrix) * worldNormal);
//   // vec3 cameraToWorld = normalize(origin);
//   // vec3 rayDirection = normalize(reflect(cameraToWorld, viewNormal));
//   // vec3 end = origin + rayDirection * maxDistance;
//   // // origin += rayDirection * 15.1;
//   // // origin += viewNormal * 0.1;

//   // const int initialSteps = 200;

//   // // fragColor = vec4(rayDirection, 1);
//   // // return;

//   // for (int i = 0; i < initialSteps; i++) {
//   //   vec3 currentView = mix(origin, end, float(i) / float(initialSteps - 1));

//   //   vec4 currentScreen = vec4(currentView, 1);
//   //   currentScreen = lensProjection * currentScreen;
//   //   currentScreen.xyz /= currentScreen.w;
//   //   currentScreen.xy = currentScreen.xy * 0.5 + 0.5;
//   //   // currentScreen.xy *= texSize;

//   //   if (isUVOutside(currentScreen.xy)) {
//   //     break;
//   //   }

//   //   float sceneDepth = getSceneViewPos(currentScreen.xy).z;
//   //   float deltaDepth = (sceneDepth - currentView.z);

//   //   if (deltaDepth > 0. && deltaDepth < 10.) {
//   //     fragColor = vec4(texture(albedoTexture, currentScreen.xy).rgb, 1);
//   //     // fragColor = vec4(float(i) / float(initialSteps - 1), 0, 0, 1);
//   //     return;
//   //   }
//   // }

//   // fragColor = vec4(0, 0, 1, 1);
//   // return;








//   vec2 texSize  = vec2(textureSize(positionTexture, 0).xy) * scale;
//   vec2 texCoord = gl_FragCoord.xy / texSize;

//   vec4 uv = vec4(0.0);

//   vec4 positionFrom = getSceneViewPos(texCoord);
//   // vec4 positionFrom = texture(positionTexture, texCoord);
//   // positionFrom.y *= -1.;
//   // vec4 mask         = texture(maskTexture,     texCoord);

//   // fragColor = vec4(getSceneViewPos(texCoord).z * 0.01, 0, 0, 1);
//   // return;

//   // fragColor = vec4(texture(albedoTexture, texCoord).rgb, 1);
//   // return;

//   // fragColor = texture(positionTexture, texCoord);
//   // // fragColor = viewMatrix * vec4(texture(positionTexture, texCoord).rgb, 1);
//   // return;

//   // fragColor = vec4(texCoord, 0, 1);
//   // return;

//   // fragColor = vec4(texture(propertiesTexture, texCoord).rgb, 1);
//   // return;

//   float roughness = texture(propertiesTexture, texCoord).r;
//   if (
//     // positionFrom.w <= 0.0
//     //  || enabled.x      != 1.0
//     //  || mask.r         <= 0.0
//     roughness > maxRoughness || positionFrom.a == 0.
//   ) {
//     fragColor = vec4(0);
//     return;

//     // fragColor = uv;
//     fragColor = vec4(texture(albedoTexture, texCoord).rgb, 1);
//     return;
//   }

//   vec3 worldNormal = texture(normalTexture, texCoord).xyz;
//   if (worldNormal == vec3(0)) {
//     fragColor = vec4(0);
//     return;

//     fragColor = vec4(texture(albedoTexture, texCoord).rgb, 1);
//     return;
//   }

//   vec3 unitPositionFrom = normalize(positionFrom.xyz);
//   vec3 normal           = normalize(mat3(viewMatrix) * worldNormal);

//   // fragColor = vec4(normal, 1);
//   // return;

//   vec3 pivot            = normalize(reflect(unitPositionFrom, normal));
  
//   vec4 positionTo = positionFrom;

//   vec4 startView = vec4(positionFrom.xyz + (pivot *         (0.01)), 1.0);
//   vec4 endView   = vec4(positionFrom.xyz + (pivot * maxDistance), 1.0);

//   // if (endView.z > 0.) {
//   //   fragColor = vec4(1, 0.5, 0, 1);
//   //   return;
//   // }

//   vec2 poissonDisk[16] = vec2[]( 
//     vec2( -0.94201624, -0.39906216 ), 
//     vec2( 0.94558609, -0.76890725 ), 
//     vec2( -0.094184101, -0.92938870 ), 
//     vec2( 0.34495938, 0.29387760 ), 
//     vec2( -0.91588581, 0.45771432 ), 
//     vec2( -0.81544232, -0.87912464 ), 
//     vec2( -0.38277543, 0.27676845 ), 
//     vec2( 0.97484398, 0.75648379 ), 
//     vec2( 0.44323325, -0.97511554 ), 
//     vec2( 0.53742981, -0.47373420 ), 
//     vec2( -0.26496911, -0.41893023 ), 
//     vec2( 0.79197514, 0.19090188 ), 
//     vec2( -0.24188840, 0.99706507 ), 
//     vec2( -0.81409955, 0.91437590 ), 
//     vec2( 0.19984126, 0.78641367 ), 
//     vec2( 0.14383161, -0.14100790 ) 
//   );

//   // int index = int(16.0*random(floor(startView.xyz*1000.0), 0))%16;
//   // startView.xy += poissonDisk[index] * 0.05;

//   vec4 startFrag      = startView;
//        startFrag      = lensProjection * startFrag;
//        startFrag.xyz /= startFrag.w;
//        startFrag.xy   = startFrag.xy * 0.5 + 0.5;
//        startFrag.xy  *= texSize;

//   vec4 endFrag      = endView;
//        endFrag      = lensProjection * endFrag;
//        endFrag.xyz /= endFrag.w;
//        endFrag.xy   = endFrag.xy * 0.5 + 0.5;
//        endFrag.xy  *= texSize;

//   vec2 frag  = startFrag.xy;
//        uv.xy = frag / texSize;

//   float deltaX    = endFrag.x - startFrag.x;
//   float deltaY    = endFrag.y - startFrag.y;
//   float useX      = abs(deltaX) >= abs(deltaY) ? 1.0 : 0.0;
//   float delta     = mix(abs(deltaY), abs(deltaX), useX) * clamp(resolution, 0.0, 1.0);
//   vec2  increment = vec2(deltaX, deltaY) / max(delta, 0.001);

//   float search0 = 0.;
//   float search1 = 0.;

//   int hit0 = 0;
//   int hit1 = 0;

//   float viewDistance = startView.y;
//   float depth        = thickness;

//   int i = 0;

//   for (i = 0; i < int(min(delta, 1000.)); ++i) {
//     frag      += increment;
//     uv.xy      = frag / texSize;

//     if (uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1.) {
//       // fragColor = vec4(0);
//       // return;
      
//       fragColor = vec4(texture(albedoTexture, texCoord).rgb, 1);
//       fragColor = vec4(0, 1, 0, 1);
//       return;
//     }

//     // vec4 worldPos = texture(positionTexture, uv.xy);
//     // positionTo = viewMatrix * vec4(worldPos.rgb, 1);
//     // // positionTo = texture(positionTexture, uv.xy);
//     // // positionTo.y *= -1.;

//     positionTo = getSceneViewPos(uv.xy);

//     search1 =
//       mix
//         ( (frag.y - startFrag.y) / deltaY
//         , (frag.x - startFrag.x) / deltaX
//         , useX
//         );

//     search1 = clamp(search1, 0.0, 1.0);

//     viewDistance = -sign(endView.z) * (startView.z * endView.z) / mix(endView.z, startView.z, search1);
//     depth        = -(viewDistance - positionTo.z);

//     if (viewDistance > 0.) {
//       break;
//     }

//     // viewDistance = (startView.y * endView.y) / mix(endView.y, startView.y, search1);
//     // depth        = viewDistance - positionTo.y;

//     if (depth > 0. && depth < thickness) {
//       hit0 = 1;

//       // // // fragColor = vec4(uv.xy, 0, 1);
//       // fragColor = vec4(0, 0, depth, 1);
//       // // fragColor = vec4(texture(albedoTexture, uv.xy).rgb * vec3(1, 0.5, 0.5), 1);
//       // return;

//       break;
//     } else {
//       search0 = search1;
//     }
//   }

//   // fragColor = vec4(uv.xy, 0, 1);
//   // return;

//   search1 = search0 + ((search1 - search0) / 2.0);

//   int currentSteps = steps;
//   currentSteps *= hit0;

//   for (i = 0; i < currentSteps; ++i) {
//     frag       = mix(startFrag.xy, endFrag.xy, search1);
//     uv.xy      = frag / texSize;

//     // // positionTo = viewMatrix * vec4(texture(positionTexture, uv.xy).rgb, 1);
//     // // // positionTo = texture(positionTexture, uv.xy);
//     // // // positionTo.y *= -1.;

//     // vec4 worldPos = texture(positionTexture, uv.xy);
//     // positionTo = viewMatrix * vec4(worldPos.rgb, 1);
//     // // positionTo = texture(positionTexture, uv.xy);

//     // if (worldPos.a < 0.01) {
//     //   positionTo = vec4(vec3(1000), 0);
//     // }

//     positionTo = getSceneViewPos(uv.xy);

//     viewDistance = (startView.z * endView.z) / mix(endView.z, startView.z, search1);
//     depth        = -(viewDistance - positionTo.z);

//     // viewDistance = (startView.y * endView.y) / mix(endView.y, startView.y, search1);
//     // depth        = viewDistance - positionTo.y;

//     float fineThickness = 0.1;
//     if (depth > -fineThickness * 0.05 && depth < fineThickness) {
//       hit1 = 1;
//       // break;
//     }

//     if (depth > 0. && depth < thickness) {
//       search1 = search0 + ((search1 - search0) / 2.);
//     } else {
//       float temp = search1;
//       search1 = search1 + ((search1 - search0) / 2.);
//       search0 = temp;
//     }
//   }

//   float visibility =
//     1.
//     // * float(hit1)
//     // * positionTo.w
//     // * ( 1. - max(dot(-unitPositionFrom, pivot), 0.))
//     // * ( 1. - clamp(depth / thickness, 0., 1.))
//     // * ( 1. - clamp(length(positionTo.xyz - positionFrom.xyz) / maxDistance, 0., 1.))
//     // * fadeOutUVBorder(uv.xy, 0.1, 0.1)
//     * (1. - roughness);

//   visibility = clamp(visibility, 0., 1.);

//   vec3 reflectedColor = texture(albedoTexture, uv.xy).rgb;
//   fragColor = vec4(mix(vec3(0), reflectedColor, visibility), visibility);

//   // uv.ba = vec2(visibility);
//   // uv.ba = vec2(1);

//   // fragColor = uv;

//   // vec3 baseColor = texture(albedoTexture, texCoord.xy).rgb;
//   // vec3 reflectedColor = texture(albedoTexture, uv.xy).rgb;

//   // fragColor = vec4(mix(baseColor, reflectedColor, visibility), 1);

//   // fragColor = vec4(baseColor, 1);
// }
// `;

const fragment = `
${shaderBase}

uniform sampler2D u_splitSum;

uniform sampler2D albedoTexture;
uniform sampler2D positionTexture;
uniform sampler2D normalTexture;
// uniform sampler2D gExtraComponents;
// uniform sampler2D ColorBuffer;
uniform sampler2D propertiesTexture;

uniform mat4 inverseViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 lensProjection;
// uniform mat4 invprojection;

// in vec2 TexCoords;

out vec4 outColor;

const float maxRoughness = 0.8;

const float step = 0.1;
const float minRayStep = 0.1;
const int maxSteps = 30;
const int numBinarySearchSteps = 5;
const float reflectionSpecularFalloffExponent = 3.0;

#define Scale vec3(.8, .8, .8)
#define K 19.19

// vec3 PositionFromDepth(float depth);

vec3 BinarySearch(inout vec3 dir, inout vec3 hitCoord, inout float dDepth);
 
vec4 RayMarch(vec3 dir, inout vec3 hitCoord, out float dDepth);

vec3 fresnelSchlick(float cosTheta, vec3 F0);

// vec3 hash(vec3 a);

vec3 hash(vec2 p)
{
	vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz+33.33);
    return fract((p3.xxy+p3.yzz)*p3.zyx);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main()
{
    vec2 texSize = vec2(textureSize(positionTexture, 0).xy);
    vec2 TexCoords = gl_FragCoord.xy / texSize;

    vec4 properties = texture(propertiesTexture, TexCoords);

    float roughness = properties.r;
    float metallic = properties.g;

    // if(metallic < 0.01)
    //     discard;

    // Don't do expensive ssr calculation on rough surfaces
    if (roughness > maxRoughness) {
        outColor = vec4(0);
        return;
    }
 
    vec3 viewNormal = vec3(vec4(texture(normalTexture, TexCoords).xyz, 0) * inverseViewMatrix);
    vec3 viewPos = textureLod(positionTexture, TexCoords, 2.0).xyz;
    vec3 albedo = texture(albedoTexture, TexCoords).rgb;

    // vec3 F0 = vec3(0.04); 
    // F0      = mix(F0, albedo, metallic);
    // vec3 Fresnel = fresnelSchlick(max(dot(normalize(viewNormal), -normalize(viewPos)), 0.0), vec3(0.04));

    // outColor = vec4(Fresnel, 1);
    // return;

    // Reflection vector
    vec3 reflected = normalize(reflect(normalize(viewPos), normalize(viewNormal)));


    vec3 hitPos = viewPos;
    float dDepth;
 
    vec3 wp = vec3(vec4(viewPos, 1.0) * inverseViewMatrix);
    vec3 jitt = mix(vec3(0.0), vec3(hash(gl_FragCoord.xy) - 0.5) * 2., roughness);
    vec4 coords = RayMarch((vec3(jitt) + reflected * max(minRayStep, -viewPos.z)), hitPos, dDepth);

    vec2 dCoords = smoothstep(0.2, 0.6, abs(vec2(0.5, 0.5) - coords.xy));

    // outColor = vec4(dCoords.xy, 0, 1);
    // return;

    float screenEdgefactor = clamp(1.0 - (dCoords.x + dCoords.y), 0.0, 1.0);

    // float ReflectionMultiplier = pow(metallic, reflectionSpecularFalloffExponent) * screenEdgefactor * -reflected.z;



    float cosTheta = max(dot(normalize(viewNormal), -normalize(viewPos)), 0.0);

    float scalarF0 = 0.04;
    vec3 F0 = vec3(scalarF0);
    F0 = mix(F0, albedo, metallic);
    vec3 F = fresnelSchlickRoughness(cosTheta, F0, roughness);

    vec2 uv = vec2(cosTheta, roughness);
    uv.y = 1. - uv.y;
    vec2 envBRDF = texture(u_splitSum, uv).rg;

    vec3 ssrColor = textureLod(albedoTexture, coords.xy, 0.0).rgb;
    ssrColor = ssrColor * (F * envBRDF.x + envBRDF.y);
    ssrColor = ssrColor * screenEdgefactor * -reflected.z;
    ssrColor = max(ssrColor, 0.0);
    outColor = vec4(ssrColor, 1.0);

    // // Get color
    // vec3 SSR = textureLod(albedoTexture, coords.xy, 0.0).rgb;// * clamp(ReflectionMultiplier, 0.0, 0.9) * Fresnel;  
}

// vec3 PositionFromDepth(float depth) {
//     float z = depth * 2.0 - 1.0;

//     vec2 texSize  = vec2(textureSize(positionTexture, 0).xy);
//     vec2 TexCoords = gl_FragCoord.xy / texSize;

//     vec4 clipSpacePosition = vec4(TexCoords * 2.0 - 1.0, z, 1.0);
//     vec4 viewSpacePosition = inverse(lensProjection)/*invprojection*/ * clipSpacePosition;

//     // Perspective division
//     viewSpacePosition /= viewSpacePosition.w;

//     return viewSpacePosition.xyz;
// }

vec3 BinarySearch(inout vec3 dir, inout vec3 hitCoord, inout float dDepth)
{
    float depth;

    vec4 projectedCoord;
 
    for(int i = 0; i < numBinarySearchSteps; i++)
    {

        projectedCoord = lensProjection * vec4(hitCoord, 1.0);
        projectedCoord.xy /= projectedCoord.w;
        projectedCoord.xy = projectedCoord.xy * 0.5 + 0.5;
 
        depth = textureLod(positionTexture, projectedCoord.xy, 2.0).z;

 
        dDepth = hitCoord.z - depth;

        dir *= 0.5;
        if(dDepth > 0.0)
            hitCoord += dir;
        else
            hitCoord -= dir;    
    }

    projectedCoord = lensProjection * vec4(hitCoord, 1.0);
    projectedCoord.xy /= projectedCoord.w;
    projectedCoord.xy = projectedCoord.xy * 0.5 + 0.5;
 
    return vec3(projectedCoord.xy, depth);
}

vec4 RayMarch(vec3 dir, inout vec3 hitCoord, out float dDepth)
{

    dir *= step;
 
 
    float depth;
    int steps;
    vec4 projectedCoord;

 
    for(int i = 0; i < maxSteps; i++)
    {
        hitCoord += dir;
 
        projectedCoord = lensProjection * vec4(hitCoord, 1.0);
        projectedCoord.xy /= projectedCoord.w;
        projectedCoord.xy = projectedCoord.xy * 0.5 + 0.5;
 
        depth = textureLod(positionTexture, projectedCoord.xy, 2.0).z;
        if(depth > 1000.0)
            continue;
 
        dDepth = hitCoord.z - depth;

        if((dir.z - dDepth) < 1.2)
        {
            if(dDepth <= 0.0)
            {   
                vec4 Result;
                Result = vec4(BinarySearch(dir, hitCoord, dDepth), 1.0);

                return Result;
            }
        }
        
        steps++;
    }
 
    
    return vec4(projectedCoord.xy, depth, 0.0);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0)
{
    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}


// vec3 hash(vec3 a)
// {
//     a = fract(a * Scale);
//     a += dot(a, a.yxz + K);
//     return fract((a.xxy + a.yxx)*a.zyx);
// }
`;

export {
  vertex,
  fragment
};