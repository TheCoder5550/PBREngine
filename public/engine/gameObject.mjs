import * as ENUMS from "./constants.mjs";
import { Transform } from "./transform.mjs";
import Renderer from "./renderer.mjs";
import Matrix from "./matrix.mjs";
import { AABB } from "./physics.mjs";
import { Scene } from "./scene.mjs";
// import { AABB, GetMeshAABB } from "./physics.mjs";
// import Vector from "./vector.mjs";

function GameObject(name = "Unnamed", options = {}) {
  var _this = this;

  /**
   * @type {string}
   */
  this.name = name;
  /**
   * @type {GameObject[]}
   */
  this.children = def(options.children, []); 
  /**
   * @type {GameObject}
   */
  this.parent = null;

  this.transform = new Transform(options.matrix, options.position, options.rotation, options.scale);
  this.transform.gameObject = this;
  this.prevModelMatrix = Matrix.copy(this.transform.worldMatrix);
  this.traverse = function(func) {
    func(this);
    for (var child of this.children) {
      child.traverse(func);
    }
  };
  this.transform.matrix = this.transform.matrix;

  this.isCulled = false;
  var _aabb = null;//new AABB(Vector.fill(-1), Vector.fill(1));
  this._aabbNeedsUpdating = true;

  let onUpdateAABB = () => {
    this._aabbNeedsUpdating = true;
  };

  /**
   * @returns {AABB}
   */
  this.getAABB = function() {
    return _aabb;
  };

  this.forceAABBUpdate = function() {
    if (this.meshRenderer && this.meshRenderer.getAABB) {
      if (!_aabb) {
        _aabb = new AABB();
      }

      this.meshRenderer.getAABB(_aabb);
      if (!(this.meshRenderer instanceof Renderer.MeshInstanceRenderer)) {
        _aabb.approxTransform(this.transform.worldMatrix);
      }

      this._aabbNeedsUpdating = false;
    }
  };

  this.transform.on("transformChange", onUpdateAABB);

  this.customData = {};
  this.layer = 0b1;
  this.visible = def(options.visible, true);
  this.castShadows = def(options.castShadows, true);
  this.receiveShadows = def(options.receiveShadows, true);
  this.disableFrustumCulling = def(options.disableFrustumCulling, false);
  this.runUpdate = def(options.runUpdate, true);
  this.active = def(options.active, true);

  this.animationController = null;
  var _components = [];

  var oldMats;
  var _meshRenderer;
  Object.defineProperty(this, "meshRenderer", {
    get: () => {
      return _meshRenderer;
    },
    set: (val) => {
      if (_meshRenderer && typeof _meshRenderer.off === "function") {
        _meshRenderer.off("updateAABB", onUpdateAABB);
      }

      _meshRenderer = val;

      if (_meshRenderer) {
        _meshRenderer.gameObject = this;
      }

      if (_meshRenderer && _meshRenderer.materials) {
        oldMats = new Array(_meshRenderer.materials.length);
      }

      if (_meshRenderer && typeof _meshRenderer.on === "function") {
        _meshRenderer.on("updateAABB", onUpdateAABB);
      }
    }
  });
  this.meshRenderer = def(options.meshRenderer, null);

  /**
   * Recursively apply `func` on this gameObject and its children 
   * @param {(obj: GameObject) => void} func 
   */
  this.traverse = function(func) {
    func(this);
    for (var child of this.children) {
      child.traverse(func);
    }
  };

  /**
   * 
   * @param {(obj: GameObject) => void} func 
   * @param {(child: GameObject) => boolean} condition 
   */
  this.traverseCondition = function(func, condition = () => true) {
    func(this);
    for (var child of this.children) {
      if (condition(child)) {
        child.traverseCondition(func, condition);
      }
    }
  };

  this.setReceiveShadows = function(receiveShadows, changeChildren = false) {
    if (changeChildren) {
      this.traverse(o => {
        o.receiveShadows = receiveShadows;
      });
    }
    else {
      this.receiveShadows = receiveShadows;
    }
  };

  this.setLayer = function(layer, changeChildren = false) {
    if (changeChildren) {
      this.traverse(o => {
        o.layer = layer;
      });
    }
    else {
      this.layer = layer;
    }
  };

  /**
   * @description Add component to gameobject. Returns the added component
   * @template T
   * @param {T} comp 
   * @returns {T}
   */
  this.addComponent = function(comp) {
    comp.gameObject = this;
    _components.push(comp);
    comp.onAdd?.(this);

    return comp;
  };

  /**
   * @description Remove component from gameobject. Returns the removed component
   * @template T
   * @param {T} comp 
   * @returns {T | null}
   */
  this.removeComponent = function(comp) {
    const index = _components.indexOf(comp);
    if (index === -1) {
      return null;
    }

    _components.splice(index, 1);
    delete comp.gameObject;

    return comp;
  };

  /**
   * Find all components matching `type`
   * @param {string} type Type of component
   * @returns {any[]}
   */
  this.findComponents = function(type) {
    return _components.filter((c) => c.componentType === type);
  };
  this.getComponents = this.findComponents.bind(this);

  /**
   * Find first component matching `type`
   * @param {string} type Type of component
   * @returns {any}
   */
  this.findComponent = function(type) {
    return _components.find((c) => c.componentType === type);
  };
  this.getComponent = this.findComponent.bind(this);

  /**
   * Get all components on this gameobject
   * @returns {any[]}
   */
  this.getAllComponents = function() {
    return _components;
  };

  // Bruh
  /**
   * Returns a copy of this gameobject
   * @param {boolean} __parent Internal variable
   * @returns {GameObject}
   */
  this.copy = function(__parent = true) {
    var newThis = new GameObject(this.name + (__parent ? " (Copy)" : ""));
    newThis.layer = this.layer;
    newThis.visible = this.visible;
    newThis.castShadows = this.castShadows;
    newThis.transform.matrix = _this.transform.matrix;
    newThis.customData = { ...this.customData };
 
    if (this.meshRenderer) {
      newThis.meshRenderer = this.meshRenderer.copy();
    }

    if (this.animationController) {
      newThis.animationController = this.animationController.copy();
    }

    for (var c of _components) {
      if (c.copy) {
        newThis.addComponent(c.copy(newThis));
      }
      else {
        newThis.addComponent(c);
      }
    }

    for (var child of this.children) {
      newThis.addChild(child.copy(false));
    }

    // Fix skin reference
    var oldGameObject = this;
    var newGameObject = newThis;

    newGameObject.traverse(g => {
      if (g != newGameObject && g.meshRenderer && g.meshRenderer.skin) {
        var joints = [];
        for (var joint of g.meshRenderer.skin.joints) {
          let path = joint.getHierarchyPath(oldGameObject);
          joints.push(newGameObject.getChildFromHierarchyPath(path));
        }

        var oldSkin = g.meshRenderer.skin;
        var Skin = oldSkin.constructor; // bruh literally cursed
        var newSkin = new Skin(joints, oldSkin.inverseBindMatrixData);

        var path = oldSkin.parentNode.getHierarchyPath(oldGameObject);
        newSkin.parentNode = newGameObject.getChildFromHierarchyPath(path);

        g.meshRenderer.skin = newSkin;
      }
    });

    // Fix animation reference
    if (oldGameObject.animationController) {
      for (var i = 0; i < oldGameObject.animationController.animations.length; i++) {
        var animation = oldGameObject.animationController.animations[i];
        for (var j = 0; j < animation.data.length; j++) {
          var data = animation.data[j];
          var childPath = data.target.getHierarchyPath(oldGameObject);
          var newTarget = newGameObject.getChildFromHierarchyPath(childPath);

          newGameObject.animationController.animations[i].data[j].target = newTarget;
        }
      }
    }

    return newThis;
  };

  /**
   * Checks if `child` is descendent of parent\nthis.contains(this) will return true
   * @param {GameObject} child The object to test for containment
   */
  this.contains = function(child) {
    do {
      if (child == this) {
        return true;
      }
      child = child.parent;
    }
    while (child.parent);

    return false;
  };

  /**
   * Find all children with custom data property matching `key`
   * @param {string} key Match properties with this key
   * @returns {GameObject[]}
   */
  this.getChildrenWithCustomData = function(key) {
    var output = [];

    this.traverse(o => {
      if (o.customData && key in o.customData) {
        output.push(o);
      }
    });

    return output;
  };

  /**
   * Finds the first child matching the given regex
   * @param {RegExp} name Finds the first child matching this regex
   * @param {boolean} recursive Search in grandchildren too?
   * @returns {GameObject}
   */
  this.getChild = function(name, recursive = false) {
    if (recursive) {
      var found;
      
      this.traverse(o => {
        if (o.name.match(name) && !found) {
          found = o;
        }
      });

      return found;
    }
    else {
      return this.children.find(e => e.name.match(name));
    }
  };

  /**
   * Finds all children matching the given regex
   * @param {RegExp} name 
   * @param {boolean} recursive 
   * @returns {GameObject[]}
   */
  this.getChildren = function(name, recursive = false) {
    if (recursive) {
      var found = [];
      
      this.traverse(o => {
        if (o.name.match(name)) {
          found.push(o);
        }
      });

      return found;
    }
    else {
      return this.children.every(e => e.name.match(name));
    }
  };

  /**
   * @description Add {@link GameObject} as child
   * @param {GameObject} child
   * @returns {GameObject}
  **/
  this.addChild = function(child) {
    if (!(child instanceof GameObject)) {
      console.error(child);
      throw new Error("Child is not GameObject");
    }

    if (child.parent == null) {
      child.parent = this;
      this.children.push(child);

      child.transform.onChangeParent();

      return child;
    }

    throw new Error("Can't add child! Child already has parent");
  };
  this.add = this.addChild;

  /**
   * @description Add multiple children
   * @param {GameObject[]} children
   * @returns {GameObject[]}
  **/
  this.addChildren = function(children) {
    for (var i = 0; i < children.length; i++) {
      this.addChild(children[i]);
    }
    
    return children;
  };

  this.removeChild = function(child) {
    var index = this.children.indexOf(child);
    if (index !== -1) {
      child.parent = null;
      this.children.splice(index, 1);

      child.transform.onChangeParent();
    }
  };

  this.setParent = function(parent) {
    if (this.parent != null) {
      this.parent.removeChild(this);
    }

    if (parent == null) {
      this.parent = null;
      this.transform.onChangeParent();
      return;
    }

    if (parent instanceof Scene) {
      const scene = parent;
      scene.add(this);
      this.transform.onChangeParent();
      return;
    }

    this.parent = parent;
    parent.children.push(this);

    this.transform.onChangeParent();
  };

  this.delete = this.destroy = this.remove = function() {
    if (!this.parent) {
      return;
    }
    
    this.parent.removeChild(this);
  };

  this.getChildFromHierarchyPath = function(path) {
    var currentParent = this;
    for (var index of path) {
      currentParent = currentParent.children[index];
    }
    return currentParent;
  };

  this.getHierarchyPath = function(parent) {
    var list = [];
    _getHierarchyPathRec(this, parent, list);
    return list.reverse();
  };

  function _getHierarchyPathRec(gameObject, stopParent, list) {
    if (gameObject.parent && gameObject != stopParent) {
      list.push(gameObject.parent.children.indexOf(gameObject));
      _getHierarchyPathRec(gameObject.parent, stopParent, list);
    }
  }

  this.update = function(dt, frameNumber) {
    if (!this.runUpdate || !this.active) return;

    if (this._aabbNeedsUpdating && this.meshRenderer && this.meshRenderer.getAABB) {
      if (!_aabb) {
        _aabb = new AABB();
      }

      this.meshRenderer.getAABB(_aabb);
      if (!(this.meshRenderer instanceof Renderer.MeshInstanceRenderer)) {
        _aabb.approxTransform(this.transform.worldMatrix);
      }

      this._aabbNeedsUpdating = false;
    }

    if (this.animationController) {
      this.animationController.update(dt, frameNumber);
    }

    this.meshRenderer?.update?.(dt, frameNumber);

    for (var component of _components) {
      component.update?.(dt, frameNumber);
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].update(dt, frameNumber);
    }
  };

  this.render = function(camera, settings = {}) {
  // this.render = function(camera, materialOverride, shadowPass = false, opaquePass = true) {
    if (!this.visible || !this.active) {
      return;
    }

    const shadowPass = settings.renderPass ? ENUMS.RENDERPASS.SHADOWS & settings.renderPass ? true : false : false;
    const opaquePass = settings.renderPass ? ENUMS.RENDERPASS.ALPHA & settings.renderPass ? false : true : true;
    const downscaledPass = settings.renderPass ? ENUMS.RENDERPASS.DOWNSCALED & settings.renderPass ? true : false : false;

    if (shadowPass && !this.castShadows) {
      return;
    }

    const cameraLayer = camera.layer ?? 0b1111111111111111;
    if (cameraLayer & this.layer) {
      // var currentMatrix = this.transform.worldMatrix;

      // if (this.meshRenderer) {
      //   if (!(shadowPass && !this.castShadows)) {
      //     var oldMats = [];
      //     if (settings.materialOverride) {
      //       for (var i = 0; i < this.meshRenderer.materials.length; i++) {
      //         oldMats[i] = this.meshRenderer.materials[i];
      //         this.meshRenderer.materials[i] = settings.materialOverride;
      //       }
      //     }

      //     this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass);

      //     if (oldMats.length > 0) {
      //       for (var i = 0; i < this.meshRenderer.materials.length; i++) {
      //         this.meshRenderer.materials[i] = oldMats[i];
      //       }
      //     }
      //   }
      // }

      if (this.meshRenderer && !(shadowPass && !this.castShadows)) {
        // Frustum culling
        // if (this.meshRenderer.isFullyOpaque() == opaquePass && (!camera.frustum || !_aabb || _aabb.isInsideFrustum(camera.frustum))) {
        if (!this.isCulled) {
          if (settings.materialOverride && true) {
            // Get type of override material (basic, instanced or skinned)
            var selectedOverrideMaterial = settings.materialOverride;
            if (this.meshRenderer instanceof Renderer.MeshInstanceRenderer) {
              selectedOverrideMaterial = settings.materialOverrideInstanced;
            }
            else if (this.meshRenderer instanceof Renderer.SkinnedMeshRenderer) {
              selectedOverrideMaterial = settings.materialOverrideSkinned;
            }

            // Keep track of old materials and override with new
            for (let i = 0; i < this.meshRenderer.materials.length; i++) {
              oldMats[i] = this.meshRenderer.materials[i].programContainer;
              this.meshRenderer.materials[i].programContainer = selectedOverrideMaterial.programContainer;
            }

            // Render
            this.meshRenderer.render(camera, this.transform.worldMatrix, shadowPass, opaquePass, this.prevModelMatrix);

            // Revert to old materials
            for (let i = 0; i < this.meshRenderer.materials.length; i++) {
              this.meshRenderer.materials[i].programContainer = oldMats[i];
            }
          }
          else {
            // console.time("MeshRenderer.render() - " + this.name);
            // this.meshRenderer.setShadowQuality?.(this.receiveShadows ? 2 : 0, opaquePass);
            this.meshRenderer.render(camera, this.transform.worldMatrix, shadowPass, opaquePass, this.prevModelMatrix, { downscaledPass, shadowQuality: this.receiveShadows ? 2 : 0 });
            // console.timeEnd("MeshRenderer.render() - " + this.name);
          }
        }
      }

      // if (!shadowPass) {
      // if (this.meshRenderer) this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass);

      for (var component of _components) {
        component.render?.(camera, this.transform.worldMatrix, shadowPass, opaquePass, this.prevModelMatrix, { downscaledPass });
      }
      // }
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].render(camera, settings);
    }

    if (!shadowPass && !this.isCulled) {
      this.updatePrevModelMatrix();
    }
  };

  this.updatePrevModelMatrix = function() {
    // this.prevModelMatrix = Matrix.copy(this.transform.worldMatrix);
    Matrix.copy(this.transform.worldMatrix, this.prevModelMatrix); // this does not work???! maybe because the getter of worldMatrix is not called? it works now :) (prevModelMatrix was a reference to transform.worldMatrix instead of copy)
  };

  this.getChildStructure = function(level = 0, lastChild = []) {
    var output = "";
    
    if (level === 0) {
      output += `Parent: ${this.parent?.name}\n⋮\n`;
    }

    output += this.name;

    if (!this.visible) {
      output += " (Not visible)";
    }

    if (!this.active) {
      output += " (Not active)";
    }

    var list = [];
    for (let i = 0; i < this.getAllComponents().length; i++) {
      var component = this.getAllComponents()[i];
      var isLast = i == this.getAllComponents().length - 1 && this.children.length == 0;

      let spacing = "";
      for (let j = 0; j < lastChild.length; j++) {
        spacing += lastChild[j] ? "   " : "|  ";
      }
      spacing += isLast ? "└──" : "├──";

      let entry = spacing + "(COMPONENT) " + component.componentType ?? `No type: ${component.constructor.name}`;
      list.push(entry);
    }

    if (this.meshRenderer) {
      let spacing = "";
      for (let j = 0; j < lastChild.length; j++) {
        spacing += lastChild[j] ? "   " : "|  ";
      }
      spacing += "└──";

      list.push(spacing + `(COMPONENT) ${this.meshRenderer.constructor.name}`);
    }

    if (this.animationController) {
      let spacing = "";
      for (let j = 0; j < lastChild.length; j++) {
        spacing += lastChild[j] ? "   " : "|  ";
      }
      spacing += "└──";

      list.push(spacing + `(COMPONENT) ${this.animationController.constructor.name}`);
    }

    if (this.children.length > 0 || list.length > 0) {
      output += "\n";
    }

    for (let i = 0; i < this.children.length; i++) {
      var thisIsLastChild = i == this.children.length - 1;

      var spacing = "";
      for (let j = 0; j < lastChild.length; j++) {
        spacing += lastChild[j] ? "   " : "|  ";
      }
      spacing += thisIsLastChild ? "└──" : "├──";

      var newChildList = [...lastChild];
      newChildList.push(thisIsLastChild);
      list.push(spacing + this.children[i].getChildStructure(level + 1, newChildList));
    }
    output += list.join("\n");

    if (level == 1 && !lastChild[lastChild.length - 1]) {
      output += "\n|";
    }

    return output;
  };
}

function def(current, d) {
  return typeof current == "undefined" ? d : current;
}

export {
  GameObject
};