import Vector from "./vector.js";

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

function rayToTriangle(rayOrigin, rayVector, a, b, c) {
  var EPSILON = 0.0000001;
  var vertex0 = a;
  var vertex1 = b;
  var vertex2 = c;

  var h, s, q;
  var a,f,u,v;

  var edge1 = Vector.subtract(vertex1, vertex0);
  var edge2 = Vector.subtract(vertex2, vertex0);
  var h = Vector.cross(rayVector, edge2);
  var a = Vector.dot(edge1, h);

  if (a > -EPSILON && a < EPSILON)
    return false;

  var f = 1 / a;
  var s = Vector.subtract(rayOrigin, vertex0);
  var u = Vector.dot(s, h) * f;
  if (u < 0.0 || u > 1.0)
    return false;

  var q = Vector.cross(s, edge1);
  var v = f * Vector.dot(rayVector, q);
  if (v < 0.0 || u + v > 1.0)
    return false;

  var t = f * Vector.dot(edge2, q);
  if (t > EPSILON) {
    return {
      point: Vector.add(rayOrigin, Vector.multiply(rayVector, t)),
      distance: t
    };
  }
  else
    return false;
}

function rayToPlane(origin, direction, planePosition, planeNormal, line = false) {
  var denom = Vector.dot(direction, planeNormal);
  if (Math.abs(denom) < 1e-6) return false;
  var d = Vector.dot(Vector.subtract(planePosition, origin), planeNormal) / denom;
  if (d < 0 && !line) return false;
  return d;
}

// function AABBToTriangle(box, triangle) {
//   // Triangle vertices
//   for (var i = 0; i < 3; i++) {
//     if (box.pointInside(triangle[i])) {
//       return true;
//     }
//   }

//   var triangleMin, triangleMax;
//   var boxMin, boxMax;

//   var boxVertices = box.getVertices();

//   // Test the box normals (x-, y- and z-axes)
//   var boxNormals = [
//     new Vector(1,0,0),
//     new Vector(0,1,0),
//     new Vector(0,0,1)
//   ];
//   var coords = ["x", "y", "z"];

//   for (var i = 0; i < 3; i++) {
//     var [triangleMin, triangleMax] = Project(triangle, boxNormals[i]);

//     if (triangleMax < box.bl[coords[i]] || triangleMin > box.tr[coords[i]]) // check <<
//       return false; // No intersection possible.
//   }

//   // Test the triangle normal
//   var triangleNormal = getTriangleNormal(triangle);
//   var triangleOffset = Vector.dot(triangleNormal, triangle[0]);
//   var [boxMin, boxMax] = Project(boxVertices, triangleNormal);
//   if (boxMax < triangleOffset || boxMin > triangleOffset)
//     return false; // No intersection possible.

//   // Test the nine edge cross-products
//   var triangleEdges = [
//     Vector.subtract(triangle[0], triangle[1]),
//     Vector.subtract(triangle[1], triangle[2]),
//     Vector.subtract(triangle[2], triangle[0])
//   ];
//   for (var i = 0; i < 3; i++) {
//     for (var j = 0; j < 3; j++) {
//       // The box normals are the same as it's edge tangents
//       var axis = Vector.cross(triangleEdges[i], boxNormals[i]);
//       var [boxMin, boxMax] = Project(boxVertices, axis);
//       var [triangleMin, triangleMax] = Project(triangle, axis);
//       if (boxMax <= triangleMin || boxMin >= triangleMax)
//         return false; // No intersection possible
//     }
//   }

//   // No separating axis found.
//   return true;
// }

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

/* Bruh - Slow? Prolly */
function AABBToTriangle(box, triangle) {
  // Triangle vertices
  for (var i = 0; i < 3; i++) {
    if (box.pointInside(triangle[i])) {
      return true;
    }
  }

  // Triangle edges
  for (var i = 0; i < 3; i++) {
    var origin = triangle[i];
    var diff = Vector.subtract(triangle[(i + 1) % 3], triangle[i]);
    var direction = Vector.normalize(diff);
    var len = Vector.length(diff);

    var hit = rayToAABB(origin, direction, box);
    if (hit && Math.min(Math.abs(hit.min), Math.abs(hit.max)) <= len) {
      return true;
    }
  }

  // AABB edges
  var vertices = box.getVertices();
  var edges = box.getEdges();

  for (var i = 0; i < edges.length; i++) {
    var v1 = vertices[edges[i][0]];
    var v2 = vertices[edges[i][1]];

    var origin = v1;
    var diff = Vector.subtract(v2, v1);
    var direction = Vector.normalize(diff);
    var len = Vector.length(diff);

    var hit = rayToTriangle(origin, direction, triangle[0], triangle[1], triangle[2]);
    if (hit && hit.distance <= len) {
      return true;
    }
  }

  return false;
}

function rayToAABB(origin, direction, AABB) {
  var dirfrac = {
    x: 1 / direction.x,
    y: 1 / direction.y,
    z: 1 / direction.z
  };

  var t1 = (AABB.bl.x - origin.x) * dirfrac.x;
  var t2 = (AABB.tr.x - origin.x) * dirfrac.x;
  var t3 = (AABB.bl.y - origin.y) * dirfrac.y;
  var t4 = (AABB.tr.y - origin.y) * dirfrac.y;
  var t5 = (AABB.bl.z - origin.z) * dirfrac.z;
  var t6 = (AABB.tr.z - origin.z) * dirfrac.z;

  var tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
  var tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

  if (tmax < 0) return false;
  if (tmin > tmax) return false;
  return {
    min: tmin,
    max: tmax
  };
}

function getTriangleNormal(triangle) {
  return Vector.normalize(Vector.cross(Vector.subtract(triangle[1], triangle[0]), Vector.subtract(triangle[2], triangle[0])));
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
        distsq = best_distsq;
        best_point = point2;
        intersection_vec = d;
      }
  
      d = Vector.subtract(center, point3);
      var distsq = Vector.dot(d, d);
      if (distsq < best_distsq) {
        distsq = best_distsq;
        best_point = point3; 
        intersection_vec = d;
      }
    }
  
    var len = Vector.length(intersection_vec);  // vector3 length calculation: sqrt(dot(v, v))
    var penetration_normal = Vector.normalize(intersection_vec);  // normalize
    var penetration_depth = radius - len; // radius = sphere radius
    return {
      normal: penetration_normal,
      depth: penetration_depth,
      point: Vector.add(center, Vector.multiply(penetration_normal, -len))
    };
  }

  return false;
}

function capsuleToTriangle(base, tip, radius, p0, p1, p2, doubleSided = false) {
  // Compute capsule line endpoints A, B like before in capsule-capsule case:
  var CapsuleNormal = Vector.normalize(Vector.subtract(tip, base));
  var LineEndOffset = Vector.multiply(CapsuleNormal, radius);
  var A = Vector.add(base, LineEndOffset);
  var B = Vector.subtract(tip, LineEndOffset);
  
  // Then for each triangle, ray-plane intersection:
  //  N is the triangle plane normal (it was computed in sphere – triangle intersection case)
  var N = getTriangleNormal([p0, p1, p2]);

  var line_plane_intersection;
  var d = Math.abs(Vector.dot(N, CapsuleNormal));
  if (Math.abs(d) < 0.00001) {
    line_plane_intersection = Vector.copy(A);
  }
  else {
    var t = Vector.dot(N, Vector.divide(Vector.subtract(p0, base), d));
    line_plane_intersection = Vector.add(base, Vector.multiply(CapsuleNormal, t));
  }

  // console.log(d, N, t, line_plane_intersection, p0, p1, p2);
  
  var reference_point = closestPointToTriangle(line_plane_intersection, p0, p1, p2);
  // var reference_point = {find closest point on triangle to line_plane_intersection};

  // console.log(base, A, B, reference_point);

  // The center of the best sphere candidate:
  var center = ClosestPointOnLineSegment(A, B, reference_point);

  return sphereToTriangle(center, radius, p0, p1, p2, doubleSided);
}

function ClosestPointOnLineSegment(A, B, Point) {
  var AB = Vector.subtract(B, A);
  var t = Vector.dot(Vector.subtract(Point, A), AB) / Vector.dot(AB, AB);
  return Vector.add(A, Vector.multiply(AB, saturate(t))); // saturate(t) can be written as: min((max(t, 0), 1)
}

function saturate(t) {
  return Math.max(0, Math.min(1, t));
}

export {
  AABBToAABB,
  closestPointToTriangle,
  closestPointOnPlane,
  closestPointOnTriangle,
  rayToTriangle,
  rayToPlane,
  AABBToTriangle,
  rayToAABB,
  getTriangleNormal,
  sphereToTriangle,
  capsuleToTriangle,
  ClosestPointOnLineSegment
}