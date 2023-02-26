import * as ENUMS from "./constants.mjs";
import { Transform } from "./transform.mjs";
import Renderer from "./renderer.mjs";
import Matrix from "./matrix.mjs";

function GameObject(name = "Unnamed", options = {}) {
  var _this = this;

  this.name = name;
  this.children = def(options.children, []); 
  this.parent = null;

  this.transform = new Transform(options.matrix, options.position, options.rotation, options.scale);
  this.transform.gameObject = this;
  this.prevModelMatrix = this.transform.worldMatrix;

  this.customData = {};
  this.layer = 0b1;
  this.visible = def(options.visible, true);
  this.castShadows = def(options.castShadows, true);
  this.receiveShadows = def(options.receiveShadows, true);
  this.runUpdate = def(options.runUpdate, true);
  this.active = def(options.active, true);

  this.animationController = null;
  var _components = [];

  var oldMats;
  var _meshRenderer;
  Object.defineProperty(this, "meshRenderer", {
    get: function() {
      return _meshRenderer;
    },
    set: function(val) {
      _meshRenderer = val;

      if (_meshRenderer && _meshRenderer.materials) {
        oldMats = new Array(_meshRenderer.materials.length);
      }
    }
  });
  this.meshRenderer = def(options.meshRenderer, null);

  this.traverse = function(func) {
    func(this);
    for (var child of this.children) {
      child.traverse(func);
    }
  };

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

  this.getComponents = function() {
    return _components;
  };

  this.addComponent = function(comp) {
    comp.gameObject = this;
    _components.push(comp);
    comp.onAdd?.();

    return comp;
  };

  this.removeComponent = function(comp) {
    _components.splice(_components.indexOf(comp), 1);
    delete comp.gameObject;

    return comp;
  };

  this.findComponents = function(type) {
    return _components.filter((c) => c.constructor.name === type);
  };

  this.getComponent = function(type) {
    return _components.find((c) => c.constructor.name === type);
  };

  // Bruh
  this.copy = function(__parent = true) {
    var newThis = new GameObject(this.name + (__parent ? " (Copy)" : ""));
    newThis.layer = this.layer;
    newThis.visible = this.visible;
    newThis.castShadows = this.castShadows;
    newThis.transform.matrix = _this.transform.matrix;
 
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

  this.getChildrenWithCustomData = function(key) {
    var output = [];

    this.traverse(o => {
      if (o.customData && key in o.customData) {
        output.push(o);
      }
    });

    return output;
  };

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

  this.getChildren = function(name, recursive = false, exactMatch = true) {
    if (recursive) {
      var found = [];
      
      this.traverse(o => {
        if ((exactMatch && o.name === name) || (!exactMatch && o.name.indexOf(name) !== -1)) {
          found.push(o);
        }
      });

      return found;
    }
    else {
      return this.children.every(e => (exactMatch && e.name === name) || (!exactMatch && e.name.indexOf(name) !== -1));
    }
  };

  this.addChild = function(child) {
    if (child.parent == null) {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    throw new Error("Can't add child! Child already has parent");
  };
  this.add = this.addChild;

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
    }
  };

  this.setParent = function(parent) {
    if (this.parent != null) {
      this.parent.removeChild(this);
    }

    this.parent = parent;
    parent.children.push(this);
  };

  this.delete = function() {
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

  this.update = function(dt) {
    if (!this.runUpdate || !this.active) return;

    if (this.animationController) {
      this.animationController.update(dt);
    }

    this.meshRenderer?.update?.(dt);

    for (var component of _components) {
      component.update?.(dt);
    }

    for (var i = 0; i < this.children.length; i++) {
      this.children[i].update(dt);
    }
  };

  this.render = function(camera, settings = {}) {
  // this.render = function(camera, materialOverride, shadowPass = false, opaquePass = true) {
    if (this.visible && this.active) {
      var shadowPass = settings.renderPass ? ENUMS.RENDERPASS.SHADOWS & settings.renderPass : false;
      var opaquePass = settings.renderPass ? ENUMS.RENDERPASS.ALPHA & settings.renderPass ? false : true : true;

      if (shadowPass && !this.castShadows) {
        return;
      }

      var cameraLayer = camera.layer ?? 0b1111111111111111;
      if (cameraLayer & this.layer) {
        var currentMatrix = this.transform.worldMatrix;

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
            this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass, this.prevModelMatrix);

            // Revert to old materials
            for (let i = 0; i < this.meshRenderer.materials.length; i++) {
              this.meshRenderer.materials[i].programContainer = oldMats[i];
            }
          }
          else {
            this.meshRenderer.setShadowQuality?.(this.receiveShadows ? 2 : 0, opaquePass);
            this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass, this.prevModelMatrix);
          }
        }

        // if (!shadowPass) {
        // if (this.meshRenderer) this.meshRenderer.render(camera, currentMatrix, shadowPass, opaquePass);

        for (var component of _components) {
          component.render?.(camera, currentMatrix, shadowPass, opaquePass);
        }
        // }
      }

      for (var i = 0; i < this.children.length; i++) {
        this.children[i].render(camera, settings);
      }

      if (!shadowPass) {
        this.prevModelMatrix = Matrix.copy(this.transform.worldMatrix);
      }
    }
  };

  this.getChildStructure = function(level = 0, lastChild = []) {
    var output = this.name;

    if (!this.visible) {
      output += " (Not visible)";
    }

    if (this.children.length > 0) {
      output += "\n";
    }

    var list = [];
    for (var i = 0; i < this.children.length; i++) {
      var thisIsLastChild = i == this.children.length - 1;

      var spacing = "";
      for (var j = 0; j < lastChild.length; j++) {
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