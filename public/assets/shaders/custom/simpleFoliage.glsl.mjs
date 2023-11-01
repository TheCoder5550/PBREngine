import * as lit from "../built-in/lit.glsl.mjs";

const vertexInstanced = lit.webgl2.litInstanced.vertex;
const vertex = lit.webgl2.lit.vertex;

let fragment = `
${lit.shaderBase}

${lit.litAttributesAndUniforms}

${lit.litBase}

uniform float ditherAmount;
uniform sampler2D ditherTexture;

void main() {
  ${lit.motionBlurMain}

  // Dither
  float dither = texture(ditherTexture, gl_FragCoord.xy / 8.).r;
  float d = 1. - ditherAmount;
  if (d + (d < 0. ? dither : -dither) < 0.) {
    discard;
  }

  vec4 albedo = texture(albedoTexture, vUV);
  if (albedo.a < 0.5) {
    discard;
  }

  // fragColor = albedo;
  // return;

  // vec3 tangentNormal = texture(normalTexture, vUV).rgb * 2. - 1.;
  vec3 tangentNormal = vec3(0, 0, 1);
  vec3 worldNormal = normalize(vTBN * tangentNormal);

  // fragColor = vec4(abs(worldNormal), 1);
  // return;

  // if (!gl_FrontFacing) {
  //   worldNormal *= -1.;
  // }
  // worldNormal *= float(gl_FrontFacing) * 2. - 1.;

  // worldNormal = mix(worldNormal, normalize(vPosition - (modelMatrix * vec4(0, 4., 0, 1)).xyz), 0.6);
  // worldNormal = normalize(vPosition - vec3(0, 4, 0));

  // worldNormal = vec3(0, 1, 0);

  vec3 irradiance = texture(u_diffuseIBL, worldNormal).rgb;
  vec3 iblDiffuse = irradiance * albedo.rgb * environmentIntensity;
  iblDiffuse *= 1. - 0.04;
  vec3 diffuse = albedo.rgb * sunIntensity * max(dot(sunDirection, worldNormal), 0.) * 0.5;
  vec3 ambient = vec3(0.1, 0.03, 0.);

  fragColor = vec4(diffuse + iblDiffuse + ambient * 0., 1);
}
`;
// bruh
fragment = fragment.replace("motionVector = (NDCPos - PrevNDCPos).xy * 0.5 + 0.5;", "motionVector = vec2(0.5);");

let fragmentInstanced = fragment;
fragmentInstanced = fragmentInstanced.replace(/modelMatrix/g, "vModelMatrix");
fragmentInstanced = fragmentInstanced.replace(/uniform mat4 vModelMatrix/g, "in mat4 vModelMatrix");

fragmentInstanced = fragmentInstanced.replace(/uniform float ditherAmount/g, "in float vDitherAmount");
fragmentInstanced = fragmentInstanced.replace(/ditherAmount/g, "vDitherAmount");

const instanced = {
  webgl2: {
    vertex: vertexInstanced,
    fragment: fragmentInstanced
  }
};

const basic = {
  webgl2: {
    vertex,
    fragment
  }
};

lit.trimStrings(instanced);
lit.trimStrings(basic);

export {
  instanced,
  basic
};