import * as lit from "../built-in/lit.glsl.mjs";

var vertex = lit.webgl2.litInstanced.vertex;
// var vertex = lit.webgl2.lit.vertex;

var fragment = `
${lit.shaderBase}

${lit.litAttributesAndUniforms}

${lit.litBase}

void main() {
  ${lit.motionBlurMain}

  vec4 albedo = texture(albedoTexture, vUV);
  if (albedo.a < 0.5) {
    discard;
  }

  vec3 tangentNormal = texture(normalTexture, vUV).rgb * 2. - 1.;
  vec3 worldNormal = normalize(vTBN * tangentNormal);
  // if (!gl_FrontFacing) {
  //   worldNormal *= -1.;
  // }
  worldNormal *= float(gl_FrontFacing) * 2. - 1.;

  worldNormal = mix(worldNormal, normalize(vPosition - (modelMatrix * vec4(0, 4., 0, 1)).xyz), 0.6);
  // worldNormal = normalize(vPosition - vec3(0, 4, 0));

  vec3 irradiance = texture(u_diffuseIBL, worldNormal).rgb;
  vec3 iblDiffuse = irradiance * albedo.rgb * environmentIntensity;
  iblDiffuse *= 1. - 0.04;
  vec3 diffuse = albedo.rgb * sunIntensity * max(dot(sunDirection, worldNormal), 0.) * 0.5;
  vec3 ambient = vec3(0.1, 0.03, 0.);

  fragColor = vec4(diffuse + iblDiffuse + ambient, 1);
}
`;

fragment = fragment.replace(/modelMatrix/g, "vModelMatrix");
fragment = fragment.replace(/uniform mat4 vModelMatrix/g, "in mat4 vModelMatrix");
// // bruh
fragment = fragment.replace(`motionVector = (NDCPos - PrevNDCPos).xy * 0.5 + 0.5;`, "motionVector = vec2(0.5);");

var webgl2 = {
  vertex,
  fragment
};

lit.trimStrings(webgl2);

export {
  webgl2
};