import { saturate } from "./helper.mjs";
import Vector from "./vector.mjs";

function triangleTriangleIntersection(a, b) {
  let AIntersections = [];

  for (let i = 0; i < 3; i++) {
    let origin = a[i];
    let diff = Vector.subtract(a[(i + 1) % 3], a[i]);
    let direction = Vector.normalize(diff);
    let len = Vector.length(diff);

    let hit = rayToTriangle(origin, direction, b[0], b[1], b[2]);
    if (hit && hit.distance >= 0 && hit.distance <= len) {
      AIntersections.push({
        hit: hit,
        from: a[i],
        to: a[(i + 1) % 3]
      });

      if (window.gldebug) window.gldebug.Point(hit.point, 0.02);
    }
  }

  // if (AIntersections.length == 2) {
  //   return;
  //   let prev = [];
  //   let commonVertex;
  //   for (let intersection of AIntersections) {
  //     if (prev.includes(intersection.from)) {
  //       commonVertex = intersection.from;
  //       break;
  //     }
  //     if (prev.includes(intersection.to)) {
  //       commonVertex = intersection.to;
  //       break;
  //     }

  //     prev.push(intersection.from);
  //     prev.push(intersection.to);
  //   }

  //   if (commonVertex) {
  //     let closestEdge1 = null;
  //     let closestDistance1 = Infinity;
  //     for (let i = 0; i < 3; i++) {
  //       let d = ClosestDistanceToLineSegment(b[i], b[(i + 1) % 3], AIntersections[0].hit.point);
  //       if (d < closestDistance1) {
  //         closestDistance1 = d;
  //         closestEdge1 = [ b[i], b[(i + 1) % 3] ];
  //       }
  //     }

  //     let closestEdge2 = null;
  //     let closestDistance2 = Infinity;
  //     for (let i = 0; i < 3; i++) {
  //       let d = ClosestDistanceToLineSegment(b[i], b[(i + 1) % 3], AIntersections[1].hit.point);
  //       if (d < closestDistance2) {
  //         closestDistance2 = d;
  //         closestEdge2 = [ b[i], b[(i + 1) % 3] ];
  //       }
  //     }

  //     // let depth = Vector.dot(getTriangleNormal(b), Vector.subtract(commonVertex, b[0]));
  //     let depth = Vector.distance(commonVertex, closestPointToTriangle(commonVertex, b[0], b[1], b[2])) * Math.sign(Vector.dot(getTriangleNormal(b), Vector.subtract(commonVertex, b[0])));

  //     if (depth < 0) {
  //       if (Math.abs(depth) > Math.min(closestDistance1, closestDistance2)) {
  //         let output = [
  //           {
  //             depth: -closestDistance1,
  //             point: AIntersections[0].hit.point,
  //             normal: Vector.normalize(Vector.subtract(ClosestPointOnLineSegment(closestEdge1[0], closestEdge1[1], AIntersections[0].hit.point), AIntersections[0].hit.point)),
  //           },
  //           {
  //             depth: -closestDistance2,
  //             point: AIntersections[1].hit.point,
  //             normal: Vector.normalize(Vector.subtract(ClosestPointOnLineSegment(closestEdge2[0], closestEdge2[1], AIntersections[1].hit.point), AIntersections[1].hit.point)),
  //           }
  //         ];
  //         return output;
  //       }

  //       return [
  //         {
  //           depth,
  //           point: commonVertex,
  //           // normal: getTriangleNormal(b),
  //           normal: Vector.normalize(Vector.subtract(commonVertex, closestPointToTriangle(commonVertex, b[0], b[1], b[2]))),
  //         }
  //       ];
  //     }
  //     else if (depth > 0) {
  //       let otherVertices = [...a];
  //       otherVertices.splice(otherVertices.indexOf(commonVertex), 1);

  //       let output = [
  //         {
  //           depth: Vector.dot(getTriangleNormal(b), Vector.subtract(otherVertices[0], b[0])),
  //           point: otherVertices[0],
  //           normal: getTriangleNormal(b)
  //         },
  //         {
  //           depth: Vector.dot(getTriangleNormal(b), Vector.subtract(otherVertices[1], b[0])),
  //           point: otherVertices[1],
  //           normal: getTriangleNormal(b)
  //         }
  //       ];

  //       if (Math.min(Math.abs(output[0].depth), Math.abs(output[1].depth)) > Math.min(closestDistance1, closestDistance2)) {
  //         let output = [
  //           {
  //             depth: -closestDistance1,
  //             point: AIntersections[0].hit.point,
  //             normal: Vector.normalize(Vector.subtract(ClosestPointOnLineSegment(closestEdge1[0], closestEdge1[1], AIntersections[0].hit.point), AIntersections[0].hit.point)),
  //           },
  //           {
  //             depth: -closestDistance2,
  //             point: AIntersections[1].hit.point,
  //             normal: Vector.normalize(Vector.subtract(ClosestPointOnLineSegment(closestEdge2[0], closestEdge2[1], AIntersections[1].hit.point), AIntersections[1].hit.point)),
  //           }
  //         ];
  //         return output;
  //       }

  //       return output;
  //     }
  //   }
  // }

  if (AIntersections.length == 2) {
    let aboveClosestDistance = -Infinity;
    let aboveClosestData;
    let belowClosestDistance = -Infinity;
    let belowClosestData;

    for (let vertex of a) {
      let distanceToTriangle = Vector.dot(Vector.subtract(vertex, b[0]), getTriangleNormal(b));
      if (closestPointOnTriangle(vertex, b[0], b[1], b[2])) {
        // if (distanceToTriangle > 0) {
        //   if (Math.abs(distanceToTriangle) > aboveClosestDistance) {
        //     aboveClosestDistance = Math.abs(distanceToTriangle);
        //     aboveClosestData = {
        //       point: vertex,
        //       normal: Vector.negate(getTriangleNormal(b)),
        //       depth: -Math.abs(distanceToTriangle)
        //     };
        //   }
        // }
        // else {
        if (distanceToTriangle <= 0) {
          if (Math.abs(distanceToTriangle) > belowClosestDistance) {
            belowClosestDistance = Math.abs(distanceToTriangle);
            belowClosestData = {
              point: vertex,
              normal: getTriangleNormal(b),
              depth: -Math.abs(distanceToTriangle)
            };
          }
        }
      }
    }

    let edgeClosestDistance = Infinity;
    let edgeClosestData;

    // for (let i = 0; i < 3; i++) {
    //   let d1 = ClosestDistanceToLineSegment(b[i], b[(i + 1) % 3], AIntersections[0].hit.point);
    //   let d2 = ClosestDistanceToLineSegment(b[i], b[(i + 1) % 3], AIntersections[1].hit.point);

    //   if (d1 > d2) {
    //     if (d1 < edgeClosestDistance) {
    //       let edgePoint = ClosestPointOnLineSegment(b[i], b[(i + 1) % 3], AIntersections[0].hit.point);
    //       edgeClosestDistance = d1;
    //       edgeClosestData = {
    //         depth: -d1,
    //         point: AIntersections[0].hit.point,
    //         normal: Vector.normalize(Vector.subtract(edgePoint, AIntersections[0].hit.point))
    //       };
    //     }
    //   }
    //   else {
    //     if (d2 < edgeClosestDistance) {
    //       let edgePoint = ClosestPointOnLineSegment(b[i], b[(i + 1) % 3], AIntersections[1].hit.point);
    //       edgeClosestDistance = d2;
    //       edgeClosestData = {
    //         depth: -d2,
    //         point: AIntersections[1].hit.point,
    //         normal: Vector.normalize(Vector.subtract(edgePoint, AIntersections[1].hit.point))
    //       };
    //     }
    //   }
    // }

    console.log(aboveClosestData, belowClosestData);

    if (aboveClosestData || belowClosestData) {
      if (Math.min(aboveClosestDistance, belowClosestDistance) < edgeClosestDistance) {
        if ((aboveClosestDistance < belowClosestDistance && aboveClosestData) || !belowClosestData) {
          return [ aboveClosestData ];
        }
        else {
          return [ belowClosestData ];
        }
      }
      else {
        console.log("test1", edgeClosestData)
        return [ edgeClosestData ];
      }
    }
    // else {
    //   console.log("test2", edgeClosestData)
    //   return [ edgeClosestData ];
    // }
  }

  let BIntersections = [];

  for (let i = 0; i < 3; i++) {
    let origin = b[i];
    let diff = Vector.subtract(b[(i + 1) % 3], b[i]);
    let direction = Vector.normalize(diff);
    let len = Vector.length(diff);

    let hit = rayToTriangle(origin, direction, a[0], a[1], a[2]);
    if (hit && hit.distance >= 0 && hit.distance <= len) {
      BIntersections.push({
        hit: hit,
        from: b[i],
        to: b[(i + 1) % 3]
      });
    }
  }

  if (AIntersections.length == 1 && BIntersections.length == 1) {
    let closestData = null;
    let closestDistance = Infinity;
    for (let i = 0; i < 3; i++) {
      let d = ClosestDistanceToLineSegment(a[i], a[(i + 1) % 3], BIntersections[0].hit.point);
      if (d < closestDistance) {
        closestDistance = d;
        let point = ClosestPointOnLineSegment(a[i], a[(i + 1) % 3], BIntersections[0].hit.point);
        closestData = {
          edge: [ a[i], a[(i + 1) % 3] ],
          normal: Vector.normalize(Vector.subtract(BIntersections[0].hit.point, point)),
          point,
          depth: -Vector.distance(point, BIntersections[0].hit.point)
        };
      }
    }

    for (let i = 0; i < 3; i++) {
      let d = ClosestDistanceToLineSegment(b[i], b[(i + 1) % 3], AIntersections[0].hit.point);
      if (d < closestDistance) {
        closestDistance = d;
        let point = ClosestPointOnLineSegment(b[i], b[(i + 1) % 3], AIntersections[0].hit.point);
        closestData = {
          edge: [ b[i], b[(i + 1) % 3] ],
          normal: Vector.negate(Vector.normalize(Vector.subtract(AIntersections[0].hit.point, point))),
          point: AIntersections[0].hit.point,
          depth: -Vector.distance(point, AIntersections[0].hit.point)
        };
      }
    }

    return [
      {
        depth: closestData.depth,
        point: closestData.point,
        normal: closestData.normal
      }
    ];

    // let depth1 = -Vector.distance(AIntersections[0].hit.point, BIntersections[0].hit.point);
    // let depth2 = -Vector.distance(AIntersections[0].hit.point, BIntersections[0].hit.point);

    // let normal = Vector.normalize(Vector.subtract(BIntersections[0].hit.point, AIntersections[0].hit.point));
    // let point = AIntersections[0].hit.point;

    // console.log({normal, point, depth});

    // return [
    //   {
    //     depth: depth1,
    //     point,
    //     normal
    //   }
    // ];
  }

  if (BIntersections.length == 2) {
    // console.warn("2 b inters not implemented");
    // return;

    console.info("2 b inters", a, b);

    const reverseCollision = triangleTriangleIntersection(b, a);
    console.log(reverseCollision)
    if (!reverseCollision) {
      return null;
    }
    console.log("not null");

    const data = reverseCollision[0];

    const point = Vector.add(data.point, Vector.multiply(data.normal, data.depth));
    const normal = Vector.negate(data.normal);
    const depth = data.depth;

    return [
      {
        depth,
        point,
        normal
      }
    ];
  }

  if (BIntersections.length > 2) {
    console.error("hhhhm");
  }

  // for (let vertex of a) {
  //   let v = Vector.subtract(vertex, b[0]);
  //   let C = Vector.distance(v, Vector.projectOnPlane(v, getTriangleNormal(b))) * Math.sign(Vector.dot(v, getTriangleNormal(b)));
  //   if (C <= 0) {
  //     return {
  //       depth: C,
  //       point: vertex,
  //       normal: getTriangleNormal(b),
  //     };
  //   }
  // }

  return null;
}

function AABBToAABB(a, b) {
  return a.tr.x >= b.bl.x && a.bl.x <= b.tr.x && 
         a.tr.y >= b.bl.y && a.bl.y <= b.tr.y && 
         a.tr.z >= b.bl.z && a.bl.z <= b.tr.z;
}

function closestPointToTriangle(p, a, b, c) {
  p = closestPointOnPlane(p, a, getTriangleNormal([a, b, c]));

  if (closestPointOnTriangle(p, a, b, c) != null) {
    return Vector.copy(p);
  }

  var c1 = ClosestPointOnLineSegment(a, b, p);
  var c2 = ClosestPointOnLineSegment(b, c, p);
  var c3 = ClosestPointOnLineSegment(c, a, p);

  var mag1 = Vector.lengthSqr(Vector.subtract(p, c1));
  var mag2 = Vector.lengthSqr(Vector.subtract(p, c2));
  var mag3 = Vector.lengthSqr(Vector.subtract(p, c3));

  var min = Math.min(mag1, mag2);
  min = Math.min(min, mag3);

  if (min == mag1) {
    return c1;
  }
  else if (min == mag2) {
    return c2;
  }
  return c3;
}

function closestPointOnPlane(point, planePosition, planeNormal) {
  return Vector.add(point, Vector.multiply(planeNormal, Vector.dot(planeNormal, Vector.subtract(point, planePosition))));
}

function closestPointOnTriangle(p, a, b, c) {
  var n = Vector.normalize(Vector.cross(Vector.subtract(b, a), Vector.subtract(c, a)));
  var dist = Vector.dot(p, n) - Vector.dot(a, n);
  var proj = Vector.add(p, Vector.multiply(n, -dist));

  var v0x = c.x - a.x;
  var v0y = c.y - a.y;
  var v0z = c.z - a.z;
  var v1x = b.x - a.x;
  var v1y = b.y - a.y;
  var v1z = b.z - a.z;
  var v2x = proj.x - a.x;
  var v2y = proj.y - a.y;
  var v2z = proj.z - a.z;

  var dot00 = v0x * v0x + v0y * v0y + v0z * v0z;
  var dot01 = v0x * v1x + v0y * v1y + v0z * v1z;
  var dot02 = v0x * v2x + v0y * v2y + v0z * v2z;
  var dot11 = v1x * v1x + v1y * v1y + v1z * v1z;
  var dot12 = v1x * v2x + v1y * v2y + v1z * v2z;

  var denom = (dot00 * dot11 - dot01 * dot01);
  if (Math.abs(denom) < 1.0e-30) {
      return null;
  }

  var invDenom = 1 / denom;
  var u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  var v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  if ((u >= 0) && (v >= 0) && (u + v < 1)) {
    return proj;
  } else {
    return null;
  }
}

{
  let edge1 = new Vector();
  let edge2 = new Vector();
  let h = new Vector();
  let s = new Vector();
  let q = new Vector();
  let point = new Vector();

  var rayToTriangle = function(rayOrigin, rayVector, vertex0, vertex1, vertex2) {
    var EPSILON = 0.0000001;

    Vector.subtract(vertex1, vertex0, edge1);
    Vector.subtract(vertex2, vertex0, edge2);
    Vector.cross(rayVector, edge2, h);
    var a = Vector.dot(edge1, h);

    if (a > -EPSILON && a < EPSILON)
      return false;

    var f = 1 / a;
    Vector.subtract(rayOrigin, vertex0, s);
    var u = Vector.dot(s, h) * f;
    if (u < 0.0 || u > 1.0)
      return false;

    Vector.cross(s, edge1, q);
    var v = f * Vector.dot(rayVector, q);
    if (v < 0.0 || u + v > 1.0)
      return false;

    var t = f * Vector.dot(edge2, q);
    if (t > EPSILON) {
      Vector.set(point, rayVector);
      Vector.multiplyTo(point, t);
      Vector.addTo(point, rayOrigin);

      // bruh gc !
      return {
        point: Vector.copy(point),
        distance: t
      };
    }
    else
      return false;
  };
}

// function rayToTriangle(rayOrigin, rayVector, a, b, c) {
//   var EPSILON = 0.0000001;
//   var vertex0 = a;
//   var vertex1 = b;
//   var vertex2 = c;

//   var edge1 = Vector.subtract(vertex1, vertex0);
//   var edge2 = Vector.subtract(vertex2, vertex0);
//   var h = Vector.cross(rayVector, edge2);
//   var a = Vector.dot(edge1, h);

//   if (a > -EPSILON && a < EPSILON)
//     return false;

//   var f = 1 / a;
//   var s = Vector.subtract(rayOrigin, vertex0);
//   var u = Vector.dot(s, h) * f;
//   if (u < 0.0 || u > 1.0)
//     return false;

//   var q = Vector.cross(s, edge1);
//   var v = f * Vector.dot(rayVector, q);
//   if (v < 0.0 || u + v > 1.0)
//     return false;

//   var t = f * Vector.dot(edge2, q);
//   if (t > EPSILON) {
//     return {
//       point: Vector.add(rayOrigin, Vector.multiply(rayVector, t)),
//       distance: t
//     };
//   }
//   else
//     return false;
// }

function rayToPlane(origin, direction, planePosition, planeNormal, line = false) {
  var denom = Vector.dot(direction, planeNormal);
  if (Math.abs(denom) < 1e-6) return false;
  var d = Vector.dot(Vector.subtract(planePosition, origin), planeNormal) / denom;
  if (d < 0 && !line) return false;
  return d;
}

var boxNormals = [
  new Vector(1,0,0),
  new Vector(0,1,0),
  new Vector(0,0,1)
];
var coords = ["x", "y", "z"];

// This function might be correct...
function AABBToTriangle(box, triangle) {
  // Triangle vertices
  for (var i = 0; i < 3; i++) {
    if (pointInsideAABB(box, triangle[i])) {
    // if (box.pointInside(triangle[i])) {
      return true;
    }
  }

  var triangleMin, triangleMax;
  var boxMin, boxMax;

  // var boxVertices = box.getVertices();
  var boxVertices = getAABBVertices(box);

  // Test the box normals (x-, y- and z-axes)
  for (var i = 0; i < 3; i++) {
    var [triangleMin, triangleMax] = Project(triangle, boxNormals[i]);

    if (triangleMax < box.bl[coords[i]] || triangleMin > box.tr[coords[i]]) // check <<
      return false; // No intersection possible.
  }

  // Test the triangle normal
  var triangleNormal = getTriangleNormal(triangle);
  var triangleOffset = Vector.dot(triangleNormal, triangle[0]);
  var [boxMin, boxMax] = Project(boxVertices, triangleNormal);
  if (boxMax < triangleOffset || boxMin > triangleOffset)
    return false; // No intersection possible.

  // Test the nine edge cross-products
  var triangleEdges = [
    Vector.subtract(triangle[0], triangle[1]),
    Vector.subtract(triangle[1], triangle[2]),
    Vector.subtract(triangle[2], triangle[0])
  ];
  for (var i = 0; i < 3; i++) {
    for (var j = 0; j < 3; j++) {
      // The box normals are the same as it's edge tangents
      var axis = Vector.cross(triangleEdges[i], boxNormals[i]);
      var [boxMin, boxMax] = Project(boxVertices, axis);
      var [triangleMin, triangleMax] = Project(triangle, axis);
      if (boxMax < triangleMin || boxMin > triangleMax)
      // if (boxMax <= triangleMin || boxMin >= triangleMax)
        return false; // No intersection possible
    }
  }

  // No separating axis found.
  return true;
}

function Project(points, axis) {
  var min = Infinity;
  var max = -Infinity;
  for (var p of points) {
    var val = Vector.dot(axis, p);
    if (val < min) min = val;
    if (val > max) max = val;
  }

  return [min, max];
}

function AABBTriangleToAABB(a, b, c, aabb) {
  return Math.max(a.x, b.x, c.x) >= aabb.bl.x && Math.min(a.x, b.x, c.x) <= aabb.tr.x && 
         Math.max(a.y, b.y, c.y) >= aabb.bl.y && Math.min(a.y, b.y, c.y) <= aabb.tr.y && 
         Math.max(a.z, b.z, c.z) >= aabb.bl.z && Math.min(a.z, b.z, c.z) <= aabb.tr.z;
}

function AABBTriangleToAABBTriangle(a, b, c, u, v, w) {
  return Math.max(a.x, b.x, c.x) >= Math.min(u.x, v.x, w.x) && Math.min(a.x, b.x, c.x) <= Math.max(u.x, v.x, w.x) && 
         Math.max(a.y, b.y, c.y) >= Math.min(u.y, v.y, w.y) && Math.min(a.y, b.y, c.y) <= Math.max(u.y, v.y, w.y) && 
         Math.max(a.z, b.z, c.z) >= Math.min(u.z, v.z, w.z) && Math.min(a.z, b.z, c.z) <= Math.max(u.z, v.z, w.z);
}

function pointInsideAABB(aabb, point) {
  return point.x >= aabb.bl.x && point.y >= aabb.bl.y && point.z >= aabb.bl.z &&
         point.x <= aabb.tr.x && point.y <= aabb.tr.y && point.z <= aabb.tr.z;
}

function getAABBVertices(aabb) {
  return [
    {x: aabb.bl.x, y: aabb.bl.y, z: aabb.bl.z},
    {x: aabb.tr.x, y: aabb.bl.y, z: aabb.bl.z},
    {x: aabb.tr.x, y: aabb.bl.y, z: aabb.tr.z},
    {x: aabb.bl.x, y: aabb.bl.y, z: aabb.tr.z},
    {x: aabb.bl.x, y: aabb.tr.y, z: aabb.bl.z},
    {x: aabb.tr.x, y: aabb.tr.y, z: aabb.bl.z},
    {x: aabb.tr.x, y: aabb.tr.y, z: aabb.tr.z},
    {x: aabb.bl.x, y: aabb.tr.y, z: aabb.tr.z},
  ];
}

var aabbEdges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
];

/* Bruh - Slow? Prolly */
// function AABBToTriangle(box, triangle) {
//   if (typeof window != "undefined") window.AABBToTriangleCalls++;

//   // Triangle vertices
//   for (var i = 0; i < 3; i++) {
//     if (pointInsideAABB(box, triangle[i])) {
//       return true;
//     }
//   }

//   // Triangle edges
//   for (var i = 0; i < 3; i++) {
//     var origin = triangle[i];
//     var diff = Vector.subtract(triangle[(i + 1) % 3], triangle[i]);
//     var direction = Vector.normalize(diff);
//     var len = Vector.length(diff);

//     var hit = rayToAABB(origin, direction, box);
//     if (hit && Math.min(Math.abs(hit.min), Math.abs(hit.max)) <= len) {
//       return true;
//     }
//   }

//   // AABB edges
//   var vertices = getAABBVertices(box);
//   var edges = aabbEdges;

//   for (var i = 0; i < edges.length; i++) {
//     var v1 = vertices[edges[i][0]];
//     var v2 = vertices[edges[i][1]];

//     var origin = v1;
//     var diff = Vector.subtract(v2, v1);
//     var direction = Vector.normalize(diff);
//     var len = Vector.length(diff);

//     var hit = rayToTriangle(origin, direction, triangle[0], triangle[1], triangle[2]);
//     if (hit && hit.distance <= len) {
//       return true;
//     }
//   }

//   return false;
// }

const _aabb = {
  bl: new Vector(),
  tr: new Vector(),
};
function rayToAABBTriangle(origin, direction, p1, p2, p3) {
  _aabb.bl.x = Math.min(p1.x, p2.x, p3.x);
  _aabb.bl.y = Math.min(p1.y, p2.y, p3.y);
  _aabb.bl.z = Math.min(p1.z, p2.z, p3.z);
  _aabb.tr.x = Math.max(p1.x, p2.x, p3.x);
  _aabb.tr.y = Math.max(p1.y, p2.y, p3.y);
  _aabb.tr.z = Math.max(p1.z, p2.z, p3.z);

  return rayToAABB(origin, direction, _aabb);
}

const rayToAABBResponse = {
  min: 0,
  max: 0,
};
function rayToAABB(origin, direction, AABB) {
  const t1 = (AABB.bl.x - origin.x) / direction.x;
  const t2 = (AABB.tr.x - origin.x) / direction.x;
  const t3 = (AABB.bl.y - origin.y) / direction.y;
  const t4 = (AABB.tr.y - origin.y) / direction.y;
  const t5 = (AABB.bl.z - origin.z) / direction.z;
  const t6 = (AABB.tr.z - origin.z) / direction.z;

  const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));
  if (tmax < 0) return false;

  const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
  if (tmin > tmax) return false;

  rayToAABBResponse.min = tmin;
  rayToAABBResponse.max = tmax;

  return rayToAABBResponse;
}

function getTriangleArea(a, b, c) {
  var ab = Vector.subtract(b, a);
  var ac = Vector.subtract(c, a);
  return Vector.length(Vector.cross(ab, ac)) / 2;
}

const _v1 = new Vector();
const _v2 = new Vector();

function getTriangleNormal(triangle, dst) {
  dst = dst || new Vector();

  Vector.subtract(triangle[1], triangle[0], _v1);
  Vector.subtract(triangle[2], triangle[0], _v2);
  Vector.cross(_v1, _v2, dst);
  Vector.normalizeTo(dst);

  return dst;

  // return Vector.normalize(Vector.cross(Vector.subtract(triangle[1], triangle[0]), Vector.subtract(triangle[2], triangle[0])));
}

function sphereToTriangle(center, radius, p0, p1, p2, doubleSided = false) {
  var N = getTriangleNormal([p0, p1, p2]);
  var dist = Vector.dot(Vector.subtract(center, p0), N); // signed distance between sphere and plane
  if (!doubleSided && dist < 0)
    return false; // can pass through back side of triangle (optional)
  if (dist < -radius || dist > radius)
    return false; // no intersection

  var point0 = Vector.subtract(center, Vector.multiply(N, dist)); // projected sphere center on triangle plane

  // Now determine whether point0 is inside all triangle edges: 
  var c0 = Vector.cross(Vector.subtract(point0, p0), Vector.subtract(p1, p0));
  var c1 = Vector.cross(Vector.subtract(point0, p1), Vector.subtract(p2, p1));
  var c2 = Vector.cross(Vector.subtract(point0, p2), Vector.subtract(p0, p2));
  var inside = Vector.dot(c0, N) <= 0 && Vector.dot(c1, N) <= 0 && Vector.dot(c2, N) <= 0;

  var radiussq = radius * radius; // sphere radius squared
 
  // Edge 1:
  var point1 = ClosestPointOnLineSegment(p0, p1, center);
  var v1 = Vector.subtract(center, point1);
  var distsq1 = Vector.dot(v1, v1);
  var intersects = distsq1 < radiussq;
  
  // Edge 2:
  var point2 = ClosestPointOnLineSegment(p1, p2, center);
  var v2 = Vector.subtract(center, point2);
  var distsq2 = Vector.dot(v2, v2);
  intersects |= distsq2 < radiussq;
  
  // Edge 3:
  var point3 = ClosestPointOnLineSegment(p2, p0, center);
  var v3 = Vector.subtract(center, point3);
  var distsq3 = Vector.dot(v3, v3);
  intersects |= distsq3 < radiussq;

  if (inside || intersects) {
    var best_point = point0;
    var intersection_vec;
  
    if (inside) {
      intersection_vec = Vector.subtract(center, point0);
    }
    else {
      var d = Vector.subtract(center, point1);
      var best_distsq = Vector.dot(d, d);
      best_point = point1;
      intersection_vec = d;
  
      d = Vector.subtract(center, point2);
      var distsq = Vector.dot(d, d);
      if (distsq < best_distsq) {
        best_distsq = distsq;
        best_point = point2;
        intersection_vec = d;
      }
  
      d = Vector.subtract(center, point3);
      distsq = Vector.dot(d, d);
      if (distsq < best_distsq) {
        best_distsq = distsq;
        best_point = point3;
        intersection_vec = d;
      }
    }
  
    var len = Vector.length(intersection_vec);  // vector3 length calculation: sqrt(dot(v, v))
    var penetration_normal = Vector.normalize(intersection_vec);  // normalize
    if (Vector.lengthSqr(penetration_normal) < 0.01 * 0.01) {
      penetration_normal = N;
    }
    var penetration_depth = radius - len; // radius = sphere radius
    return {
      normal: penetration_normal,
      depth: penetration_depth,
      point: best_point
    };
  }

  return false;
}

function capsuleToTriangle(A, B, radius, p0, p1, p2, doubleSided = false) {
  // Compute capsule line endpoints A, B like before in capsule-capsule case:
  var CapsuleNormal = Vector.normalize(Vector.subtract(B, A));
  var LineEndOffset = Vector.multiply(CapsuleNormal, radius);
  var base = Vector.subtract(A, LineEndOffset);
  var tip = Vector.add(B, LineEndOffset);
  
  // Then for each triangle, ray-plane intersection:
  //  N is the triangle plane normal (it was computed in sphere – triangle intersection case)
  var N = getTriangleNormal([p0, p1, p2]);

  var line_plane_intersection;
  var d = Vector.dot(N, CapsuleNormal);
  // Parallel edge case
  if (Math.abs(d) < 0.00001) {
    line_plane_intersection = Vector.copy(A);
  }
  else {
    var t = Vector.dot(N, Vector.divide(Vector.subtract(p0, base), d));
    line_plane_intersection = Vector.add(base, Vector.multiply(CapsuleNormal, t));
  }

  // console.log(d, N, t, line_plane_intersection, p0, p1, p2);
  


  // var reference_point = closestPointToTriangle(line_plane_intersection, p0, p1, p2);
  // var reference_point = {find closest point on triangle to line_plane_intersection};

  var c0 = Vector.cross(Vector.subtract(line_plane_intersection, p0), Vector.subtract(p1, p0));
  var c1 = Vector.cross(Vector.subtract(line_plane_intersection, p1), Vector.subtract(p2, p1));
  var c2 = Vector.cross(Vector.subtract(line_plane_intersection, p2), Vector.subtract(p0, p2));
  var inside = Vector.dot(c0, N) <= 0 && Vector.dot(c1, N) <= 0 && Vector.dot(c2, N) <= 0;

  var reference_point;
  if (inside) {
    reference_point = line_plane_intersection;
  }
  else {
    // Edge 1:
    var point1 = ClosestPointOnLineSegment(p0, p1, line_plane_intersection);
    var v1 = Vector.subtract(line_plane_intersection, point1);
    var distsq = Vector.dot(v1, v1);
    var best_distsq = distsq;
    reference_point = point1;
    
    // Edge 2:
    var point2 = ClosestPointOnLineSegment(p1, p2, line_plane_intersection);
    var v2 = Vector.subtract(line_plane_intersection, point2);
    var distsq = Vector.dot(v2, v2);
    if (distsq < best_distsq) {
      reference_point = point2;
      best_distsq = distsq;
    }
    
    // Edge 3:
    var point3 = ClosestPointOnLineSegment(p2, p0, line_plane_intersection);
    var v3 = Vector.subtract(line_plane_intersection, point3);
    var distsq = Vector.dot(v3, v3);
    if (distsq < best_distsq) {
      reference_point = point3;
      best_distsq = distsq;
    }
  }












  // The center of the best sphere candidate:
  var center = ClosestPointOnLineSegment(A, B, reference_point);

  return sphereToTriangle(center, radius, p0, p1, p2, doubleSided);
}

function ClosestDistanceToLineSegment(a, b, point) {
  return Vector.distance(ClosestPointOnLineSegment(a, b, point), point);
}

function ClosestPointOnLineSegment(A, B, Point) {
  var AB = Vector.subtract(B, A);
  var t = Vector.dot(Vector.subtract(Point, A), AB) / Vector.dot(AB, AB);
  return Vector.add(A, Vector.multiply(AB, saturate(t))); // saturate(t) can be written as: min((max(t, 0), 1)
}

function distanceBetweenRayAndPoint(ray, point) {
  var RP = Vector.subtract(point, ray.origin);
  var p = Vector.dot(ray.direction, RP);
  return Math.sqrt(Vector.lengthSqr(RP) - p * p);
}

export {
  triangleTriangleIntersection,
  AABBToAABB,
  closestPointToTriangle,
  closestPointOnPlane,
  closestPointOnTriangle,
  rayToTriangle,
  rayToPlane,
  AABBTriangleToAABB,
  AABBTriangleToAABBTriangle,
  AABBToTriangle,
  rayToAABBTriangle,
  rayToAABB,
  getTriangleArea,
  getTriangleNormal,
  sphereToTriangle,
  capsuleToTriangle,
  ClosestPointOnLineSegment,
  distanceBetweenRayAndPoint
};