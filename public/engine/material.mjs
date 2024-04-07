import Renderer from "./renderer.mjs";

export class NewMaterial {
  constructor(programContainer, uniforms = {}) {
    if (typeof uniforms !== "object" || uniforms === null || Array.isArray(uniforms)) {
      throw new Error("Uniforms is not a dictionary (object)");
    }
    
    if (programContainer !== null && !(programContainer instanceof Renderer.ProgramContainer)) {
      console.error(programContainer);
      throw new Error("Could not create material. Not a program container: " + programContainer);
    }
    this.programContainer = programContainer;

    if (programContainer === null) {
      console.warn("Program container is null");
    }
    else {
      // bruh spams console when copying gameobjects
      // for (var uniformName in uniforms) {
      //   if (!this.programContainer.activeUniforms[uniformName]) {
      //     console.warn("[constructor] Uniform does not exist on current shader-program: " + uniformName);
      //   }
      // }
    }

    this.name = "No name";
    this.doubleSided = false;
    this.doubleSidedShadows = true;
    this.uniforms = uniforms;
    this.opaque = true;
  }

  setUniform(name, values) {
    if (this.programContainer && !this.programContainer.activeUniforms[name]) {
      console.warn("[setUniform] Uniform does not exist on current shader-program: " + name);
    }

    this.uniforms[name] = values;
  }

  getUniform(name) {
    return this.uniforms[name];
  }

  isOpaque() {
    return this.opaque;
  }

  getUniformLocation(name) {
    if (!this.programContainer) {
      throw new Error("Material does not have a program container associated with it");
    }
    
    return this.programContainer.getUniformLocation(name);
  }

  copy() {
    return copy.call(this, NewMaterial);
  }
}

export class NewLitMaterial extends NewMaterial {
  constructor(programContainer, uniforms = {}) {
    super(programContainer, uniforms);

    this.isLit = true;

    this.uniforms["albedo"] = this.uniforms["albedo"] ?? [1, 1, 1, 1];
    this.uniforms["emissiveFactor"] = this.uniforms["emissiveFactor"] ?? [0, 0, 0];
    this.uniforms["metallic"] = this.uniforms["metallic"] ?? 0;
    this.uniforms["roughness"] = this.uniforms["roughness"] ?? 1;
    this.uniforms["alphaCutoff"] = this.uniforms["alphaCutoff"] ?? 0.5;
    this.uniforms["doNoTiling"] = this.uniforms["doNoTiling"] ?? false;
    this.uniforms["normalStrength"] = this.uniforms["normalStrength"] ?? 1;
  
    this.uniforms["useVertexColor"] = this.uniforms["useVertexColor"] ?? true;
    this.uniforms["useTexture"] = !!this.uniforms["albedoTexture"];
    this.uniforms["useNormalTexture"] = !!this.uniforms["normalTexture"];
    this.uniforms["useMetallicRoughnessTexture"] = !!this.uniforms["metallicRoughnessTexture"];
    this.uniforms["useEmissiveTexture"] = !!this.uniforms["emissiveTexture"];
    this.uniforms["useOcclusionTexture"] = !!this.uniforms["occlusionTexture"];

    if ("opaque" in this.uniforms) {
      this.opaque = !!this.uniforms["opaque"];
      delete this.uniforms["opaque"];
    }
  }

  setUniform(name, values) {
    super.setUniform(name, values);

    if (name == "albedoTexture") {
      this.uniforms["useTexture"] = !!values;
    }
    else if (name == "normalTexture") {
      this.uniforms["useNormalTexture"] = !!values;
    }
    else if (name == "metallicRoughnessTexture") {
      this.uniforms["useMetallicRoughnessTexture"] = !!values;
    }
    else if (name == "emissiveTexture") {
      this.uniforms["useEmissiveTexture"] = !!values;
    }
    else if (name == "occlusionTexture") {
      this.uniforms["useOcclusionTexture"] = !!values;
    }
  }

  copy() {
    return copy.call(this, NewLitMaterial);
  }
}

/**
 * 
 * @param {RegExp} name 
 * @param {GameObject} obj 
 * @param {NewMaterial[]} output 
 * @returns 
 */
export function FindMaterials(name, obj, output = []) {
  if (obj.meshRenderer) {
    for (const mat of obj.meshRenderer.materials) {
      if (mat.name.match(name)) {
        output.push(mat);
      }
    }
  }

  for (const child of obj.children) {
    FindMaterials(name, child, output);
  }

  return output;
}

function copy(constr) {
  var newUniforms = {};
  for (var uniformName in this.uniforms) {
    let oldUniform = this.uniforms[uniformName];
    if (oldUniform instanceof WebGLTexture) {
      newUniforms[uniformName] = oldUniform;
    }
    else {
      newUniforms[uniformName] = typeof oldUniform === "undefined" ? oldUniform : JSON.parse(JSON.stringify(oldUniform));
    }
  }

  var m = new constr(this.programContainer, newUniforms);

  m.name = this.name;
  m.doubleSided = this.doubleSided;
  m.doubleSidedShadows = this.doubleSidedShadows;
  m.opaque = this.opaque;

  return m;
}