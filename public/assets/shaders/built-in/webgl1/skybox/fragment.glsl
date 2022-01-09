precision mediump float;

varying vec4 vPosition;
 
uniform samplerCube skybox;
uniform mat4 viewDirectionProjectionInverse;

void main() {
  vec4 t = viewDirectionProjectionInverse * vPosition;
  vec3 col = textureCube(skybox, normalize(t.xyz / t.w)).rgb;

  gl_FragColor = vec4(col, 1);
}