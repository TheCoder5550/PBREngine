export const vertex = `
  attribute vec3 position;

  varying vec3 localPos;

  uniform mat4 projectionMatrix;
  uniform mat4 viewMatrix;

  void main() {
    localPos = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(localPos, 1.0);
  }
`;

export const fragment = `
  precision highp float;

  varying vec3 localPos;

  uniform sampler2D equirectangularMap;

  const vec2 invAtan = vec2(0.1591, 0.3183);
  vec2 SampleSphericalMap(vec3 v) {
    vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
    uv *= invAtan;
    uv += 0.5;
    return uv;
  }

  void main() {
    vec2 uv = SampleSphericalMap(normalize(localPos)); // make sure to normalize localPos
    vec4 color = texture2D(equirectangularMap, uv);
    
    color.rgb *= pow(2., color.a * 255. - (128. + 8.)) * 255.;

    gl_FragColor = vec4(color.rgb, 1.0);
  }
`;