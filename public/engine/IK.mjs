import Vector from "./vector.mjs";
import Matrix from "./matrix.mjs";
import Quaternion from "./quaternion.mjs";
import { GameObject } from "./gameObject.mjs";

export function IK(bones, side = 1) {
  var _this = this;

  const debug = false;

  this.updateRate = 1;
  this.updateOffset = 0;

  this.bones = bones;
  this.points = [];

  for (var i = 0; i < this.bones.length; i++) {
    this.points[i] = Matrix.getPosition(this.bones[i].transform.worldMatrix);
  }

  this.armLength = Vector.distance(this.points[0], this.points[1]);

  this.startObject = new GameObject("IKStart");
  this.endObject = new GameObject("IKEnd");
  this.controlAngle = 0;

  this.onAdd = function() {
    this.gameObject.addChild(this.startObject);
    this.gameObject.addChild(this.endObject);

    var m = Matrix.inverse(this.gameObject.transform.worldMatrix);
    this.startObject.transform.position = Matrix.transformVector(m, Vector.copy(this.points[0]));
    this.endObject.transform.position = Matrix.transformVector(m, Vector.copy(this.points[this.points.length - 1]));
  };

  // this.copy = function() {
  //   const ik = new IK(this.bones, side);
  //   ik.controlAngle = this.controlAngle;

  //   return ik;
  // };

  this.update = function(frameTime, frameNumber) {
    if (frameNumber % this.updateRate !== this.updateOffset) {
      return;
    }

    if (this.bones.length == 3) {
      solve3BoneIK();
    }
    else {
      solveFullIK();
    }
    
    setBoneTransforms();

    if (debug) {
      for (var i = 0; i < this.points.length; i++) {
        window.glDebugger.Point(this.points[i], 0.05, [0, 0, i / (this.points.length - 1), 1]);
      }
      window.glDebugger.Point(this.startObject.transform.worldPosition, 0.06, [0, 1, 0, 1]);
      window.glDebugger.Point(this.endObject.transform.worldPosition, 0.06, [1, 0, 0, 1]);
    }
  };

  var setBoneTransforms = () => {
    const up = this.startObject.transform.up;
    // const up = Vector.up();

    for (let i = 0; i < this.bones.length; i++) {
      if (i <= this.bones.length - 2) {
        const m = Matrix.lookAt(this.points[i], this.points[i + 1], up);

        Matrix.rotateY(m, -Math.PI / 2 * side, m);

        this.bones[i].transform.worldMatrix = m;
        // this.bones[i].transform.matrix = this.bones[i].transform.matrix;

        if (debug) {
          window.glDebugger.Line(this.points[i], this.points[i + 1], [1, 1, 0]);
        }
      }
      else {
        this.bones[i].transform.worldMatrix = this.endObject.transform.worldMatrix;
        
        // const m = Matrix.lookInDirection(this.points[i], this.endObject.transform.forward, new Vector(0, 1, 0));
        // // const m = Matrix.lookInDirection(this.points[i], this.gameObject.transform.forward, new Vector(0, 1, 0));
        
        // let p = this.bones[i].parent.transform.worldMatrix;
        // let x = Matrix.multiply(Matrix.inverse(p), m);

        // Matrix.setScale(x, Vector.fill(1));

        // Matrix.rotateZ(x, -Math.PI / 2 * side, x);
        // Matrix.rotateY(x, -Math.PI / 2 * side, x);

        // this.bones[i].transform.matrix = x;
      }

      Matrix.setScale(this.bones[i].transform.matrix, Vector.fill(1));
      this.bones[i].transform.matrix = this.bones[i].transform.matrix;
    }

    // for (let i = 0; i < this.bones.length; i++) {
    //   if (i <= this.bones.length - 2) {
    //     let m = Matrix.lookAt(this.points[i], this.points[i + 1], new Vector(0, 1, 0));
    //     // var p = this.bones[i].parent.transform.worldMatrix;
    //     // var x = Matrix.multiply(Matrix.inverse(p), m);

    //     // Matrix.setScale(x, Vector.fill(1));

    //     // Matrix.rotateX(x, -Math.PI / 2, x);
    //     // Matrix.rotateY(x, -Math.PI, x);

    //     // this.bones[i].transform.matrix = x;

    //     this.bones[i].transform.worldMatrix = m;
    //     Matrix.setScale(this.bones[i].transform.matrix, Vector.fill(1));
    //     // Matrix.rotateX(this.bones[i].transform.matrix, -Math.PI / 2, this.bones[i].transform.matrix);
    //     Matrix.rotateY(this.bones[i].transform.matrix, Math.PI / 2, this.bones[i].transform.matrix);
    //   }
    //   else {
    //     let m = Matrix.lookAt(this.points[i], Vector.add(this.points[i], this.gameObject.transform.forward), new Vector(0, 1, 0));
    //     // let m = Matrix.translate(this.points[i]);
    //     let p = this.bones[i].parent.transform.worldMatrix;
    //     let x = Matrix.multiply(Matrix.inverse(p), m);

    //     Matrix.setScale(x, Vector.fill(1));

    //     // Matrix.rotateX(x, Math.PI / 2, x);
    //     Matrix.rotateY(x, -Math.PI / 2, x);

    //     this.bones[i].transform.matrix = x;
    //   }
    // }
  };

  var solve3BoneIK = () => {
    const up = this.startObject.transform.up;
    // const up = Vector.up();

    var A = this.startObject.transform.worldPosition;
    var B = this.endObject.transform.worldPosition;

    Vector.set(this.points[0], A);

    var ABDistanceSqr = Vector.distanceSqr(A, B);
    if (Math.sqrt(ABDistanceSqr) < 2 * this.armLength) {
      let d = Math.sqrt(Math.pow(this.armLength, 2) - ABDistanceSqr / 4);
      let mid = Vector.average(
        this.startObject.transform.worldPosition,
        this.endObject.transform.worldPosition,
      );
      let ABNorm = Vector.normalize(Vector.subtract(A, B));
      let v = Vector.normalize(Vector.projectOnPlane(Quaternion.QxV(Quaternion.angleAxis(Math.PI / 2, up), ABNorm), up));
      v = Quaternion.QxV(Quaternion.angleAxis(this.controlAngle, ABNorm), v);
      let x = Vector.add(mid, Vector.multiply(v, d));

      Vector.set(this.points[1], x);
      Vector.set(this.points[2], B);
    }
    else {
      let v = Vector.normalize(Vector.subtract(B, A));
      Vector.set(this.points[1], Vector.add(A, Vector.multiply(v, this.armLength)));
      Vector.set(this.points[2], Vector.add(A, Vector.multiply(v, this.armLength * 2)));
    }
  };

  var solveFullIK = () => {
    for (let i = this.points.length - 1; i >= 0; i--) {
      let p = this.points[i];

      if (i == this.points.length - 1) {
        Vector.set(p, this.endObject.transform.worldPosition);
      }
      else {
        moveTo(p, this.points[i + 1]);
      }
    }

    var offset = Vector.subtract(this.startObject.transform.worldPosition, this.points[0]);
    for (let i = this.points.length - 1; i >= 0; i--) {
      let p = this.points[i];
      Vector.addTo(p, offset);
    }
  };

  function moveTo(point, position) {
    var dir = Vector.normalize(Vector.subtract(point, position));
    Vector.set(point, Vector.add(position, Vector.multiply(dir, _this.armLength)));
  }
}