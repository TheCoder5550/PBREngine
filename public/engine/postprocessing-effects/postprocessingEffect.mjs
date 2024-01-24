/* eslint-disable no-unused-vars */

import Renderer from "../renderer.mjs";

export default class PostProcessingEffect {
  name = "";
  doesEffectNeedSplit = false;

  /**
   * Gets called when added effect to postprocessing effect stack with `addEffect`
   * @param {Renderer} renderer
   */
  initialize(renderer) {}

  dispose(renderer) {}

  /**
   * Gets called before doing postprocessing pass for this effect
   * @param {Renderer} renderer
   * @param {{
   *  framebuffer: WebGLFramebuffer | null;
   *  colorTexture: WebGLTexture | null;
   *  depthTexture: WebGLTexture | null;
   * }} inputBuffer The previous frame's buffer
   */
  prepass(renderer, inputBuffer) {}

  setUniforms(programContainer, gl) {}

  resizeFramebuffers(renderer) {}
  
  getFragmentSource() {
    return "";
  }
}