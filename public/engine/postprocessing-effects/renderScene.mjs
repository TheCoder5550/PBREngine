import PostProcessingEffect from "./postprocessingEffect.mjs";

export default class RenderScene extends PostProcessingEffect {
  getMain() {
    return `
      vec4 sceneColor = texture(sceneTexture, uv);
      outColor = sceneColor;
    `;
  }
}