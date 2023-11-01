import { ClosestPointOnLineSegment, getTriangleNormal } from "./algebra.mjs";
import Matrix from "./matrix.mjs";
import Vector from "./vector.mjs";

const CONTINUE = 0;
const DONE = 1;
const PENETRATION = 2;

let vclipData;

export function VClip(geometryA, geometryB) {
  vclipData = new VClipData();

  const v1 = geometryA.vertices[0];
  const v2 = geometryB.vertices[0];

  // Start somewhere
  VVState(v1, v2);

  if (vclipData.featureA.geometry == null || vclipData.featureB.geometry == null || vclipData.featureA.geometry == vclipData.featureB.geometry) {
    throw new Error("Geometry");
  }

  // Swap features so featureA is on geometryA and featureB is on geometryB
  if (vclipData.featureA.geometry !== geometryA) {
    const temp = vclipData.featureA;
    vclipData.featureA = vclipData.featureB;
    vclipData.featureB = temp;
  }

  if (vclipData.status === PENETRATION && vclipData.featureA.geometry == geometryA) {
    // Swap penetration data POV
    Vector.set(vclipData.penetrationPoint, Vector.add(vclipData.penetrationPoint, Vector.multiply(vclipData.penetrationNormal, -vclipData.penetrationDepth)));
    Vector.negateTo(vclipData.penetrationNormal);
  }

  return vclipData.copy();
}

export function computeDistance(featureA, featureB) {
  const pa = new Vector();
  const pb = new Vector();

  if (featureA instanceof Vertex && featureB instanceof Vertex) {
    Vector.set(pa, featureA.position);
    Vector.set(pb, featureB.position);
  }
  else if (featureA instanceof Vertex && featureB instanceof Edge) {
    Vector.set(pa, featureA.position);
    ClosestPointOnLineSegment(featureB.a.position, featureB.b.position, pa, pb);
  }
  else if (featureA instanceof Edge && featureB instanceof Vertex) {
    const reversed = computeDistance(featureB, featureA);
    Vector.set(pa, reversed.pointB);
    Vector.set(pb, reversed.pointA);
  }
  else if (featureA instanceof Vertex && featureB instanceof Face) {
    Vector.set(pa, featureA.position);

    const origin = featureB.getOrigin();
    const t = Vector.subtract(pa, origin);
    Vector.projectOnPlane(t, featureB.getNormal(), pb);
    Vector.addTo(pb, origin);
  }
  else if (featureA instanceof Face && featureB instanceof Vertex) {
    const reversed = computeDistance(featureB, featureA);
    Vector.set(pa, reversed.pointB);
    Vector.set(pb, reversed.pointA);
  }
  else if (featureA instanceof Edge && featureB instanceof Edge) {
    const normA = Vector.tangent(featureA.b.position, featureA.a.position);
    const normB = Vector.tangent(featureB.b.position, featureB.a.position);
    const c = Vector.normalize(Vector.cross(normA, normB));
    const d = Vector.subtract(featureB.a.position, featureA.a.position);

    const rB = Vector.copy(d);
    Vector.subtractTo(rB, Vector.multiply(normA, Vector.dot(d, normA)));
    Vector.subtractTo(rB, Vector.multiply(c, Vector.dot(d, c)));
    let tB = -Vector.length(rB) / Vector.dot(normB, Vector.normalize(rB));

    const rA = Vector.copy(d);
    Vector.subtractTo(rA, Vector.multiply(normB, Vector.dot(d, normB)));
    Vector.subtractTo(rA, Vector.multiply(c, Vector.dot(d, c)));
    let tA = Vector.length(rA) / Vector.dot(normA, Vector.normalize(rA));

    // console.log({normA, normB, c, d, rA, rB, tA, tB});

    if (Vector.lengthSqr(c) <= 1e-6) {
      const getSignedDistanceToPlane = function(point, origin, normal) {
        return Vector.dot(normal, Vector.subtract(point, origin));
      };

      const d = getSignedDistanceToPlane(featureB.a.position, featureA.a.position, normA);
      const t = Vector.distance(featureA.a.position, featureA.b.position);
      tA = t;
      tB = d - t;
    }

    Vector.set(pa, featureA.a.position);
    Vector.addTo(pa, Vector.multiply(normA, tA));

    Vector.set(pb, featureB.a.position);
    Vector.addTo(pb, Vector.multiply(normB, tB));
  }

  const vector = Vector.subtract(pb, pa);
  const distance = Vector.length(vector);

  return {
    pointA: pa,
    pointB: pb,
    distance,
    vector
  };
}

function VVState(v1, v2) {
  for (const neighborEdge of v1.neighborEdges) {
    const vp = getVoronoiPlane(v1, neighborEdge);
    const violate = vp.signedDistanceToPoint(v2.position) < 0;
    if (violate) {
      // console.log("1");
      return VEState(v2, neighborEdge);
    }
  }

  for (const neighborEdge of v2.neighborEdges) {
    const vp = getVoronoiPlane(v2, neighborEdge);
    const violate = vp.signedDistanceToPoint(v1.position) < 0;
    if (violate) {
      // console.log("2")
      return VEState(v1, neighborEdge);
    }
  }

  // console.log("burh")

  vclipData.featureA = v1;
  vclipData.featureB = v2;
  vclipData.status = DONE;
  return DONE;
}

function VEState(vertex, edge) {
  let vp = getVoronoiPlane(edge.a, edge);
  Vector.negateTo(vp.normal);
  let violate = vp.signedDistanceToPoint(vertex.position) < 0;
  if (violate) {
    return VVState(vertex, edge.a);
  }

  // console.log("bruh1")

  vp = getVoronoiPlane(edge.b, edge);
  Vector.negateTo(vp.normal);
  violate = vp.signedDistanceToPoint(vertex.position) < 0;
  if (violate) {
    return VVState(vertex, edge.b);
  }

  // console.log("bruh2")

  for (const face of edge.neighborFaces) {
    const vp = getVoronoiPlane(edge, face);
    // renderPlane(vp.origin, vp.normal);
    const violate = vp.signedDistanceToPoint(vertex.position) < 0;
    if (violate) {
      return VFState(vertex, face);
    }
  }
  // throw new Error();

  // console.log("bruh3")

  const clip = clipEdge(edge, vertex, vertex.neighborEdges);

  // console.log(clip);

  if (clip.NMin == clip.NMax && clip.NMin != null) {
    return EEState(clip.NMin, edge);
  }
  
  if (clip.NMin != null && checkDistancePrime(edge, vertex, clip.lambdaMin)) {
    return EEState(clip.NMin, edge);
  }
  else if (clip.NMax != null && !checkDistancePrime(edge, vertex, clip.lambdaMax)) {
    return EEState(clip.NMax, edge);
  }

  vclipData.featureA = vertex;
  vclipData.featureB = edge;
  vclipData.status = DONE;
  return DONE;
}

function VFState(vertex, face) {
  let dMin = 0;
  let E0 = null;

  for (const edge of face.edges) {
    const vp = getVoronoiPlane(face, edge);
    const distance = vp.signedDistanceToPoint(vertex.position);
    if (distance < dMin) {
      dMin = distance;
      E0 = edge;
    }
  }

  if (E0 != null) {
    return VEState(vertex, E0);
  }

  const facePlane = face.getPlane();
  const dh = facePlane.signedDistanceToPoint(vertex.position);
  for (const edge of vertex.neighborEdges) {
    // if (vertex != edge.b) {
    //   throw new Error("Vertex != edge.b");
    // }

    const other = edge.getOtherVertex(vertex);

    const dt = facePlane.signedDistanceToPoint(other.position);
    // console.log(dt, dh);
    if (dh * dt < 0) {
      return EFState(edge, face);
    }
    else {
      if (Math.abs(dh) - 0.00001 > Math.abs(dt)) {
        return EFState(edge, face); // here
      }
    }
  }

  if (dh > 0) {
    vclipData.featureA = vertex;
    vclipData.featureB = face;
    vclipData.status = DONE;
    return DONE;
  }

  // console.log("min")

  return handleLocalMin(vertex, face);
}

function EEState(edge1, edge2) {
  let status = EEStateSub(edge1, edge2);
  if (status !== CONTINUE) return status;

  status = EEStateSub(edge2, edge1);
  if (status !== CONTINUE) return status;

  vclipData.featureA = edge1;
  vclipData.featureB = edge2;
  vclipData.status = DONE;
  return DONE;
}

function EEStateSub(edge1, edge2) {
  {
    const clip = clipEdge(edge2, edge1, edge1.neighborVertices);
    
    if (clip.NMin == clip.NMax && clip.NMax != null) {
      return VEState(clip.NMin, edge2);
    }
    if (clip.NMin != null && checkDistancePrime(edge2, clip.NMin, clip.lambdaMin)) {
      return VEState(clip.NMin, edge2);
    }
    else if (clip.NMax != null && !checkDistancePrime(edge2, clip.NMax, clip.lambdaMax)) {
      return VEState(clip.NMax, edge2);
    }
  }

  {
    const clip = clipEdge(edge2, edge1, edge1.neighborFaces);
    
    if (clip.NMin == clip.NMax && clip.NMax != null) {
      return EFState(edge2, clip.NMin);
    }
    if (clip.NMin != null && checkDistancePrime(edge2, clip.NMin, clip.lambdaMin)) {
      return EFState(edge2, clip.NMin);
    }
    else if (clip.NMax != null && !checkDistancePrime(edge2, clip.NMax, clip.lambdaMax)) {
      return EFState(edge2, clip.NMax);
    }
  }

  return CONTINUE;
}

function EFState(edge, face) {
  // console.log("ef")

  const clip = clipEdge(edge, face, face.edges);
  if (!clip.status) {
    return EEState(edge, clip.NMin);
  }

  const facePlane = face.getPlane();
  const dMin = facePlane.signedDistanceToPoint(edge.lerp(clip.lambdaMin));
  const dMax = facePlane.signedDistanceToPoint(edge.lerp(clip.lambdaMax));

  // (Only) one point is under the face
  if (dMin * dMax <= 0) {
    // const dh = facePlane.signedDistanceToPoint(edge.b.position);
    // const dt = facePlane.signedDistanceToPoint(edge.a.position);
    // const lambdaPenetration = dt / (dt - dh);

    let depth = null;
    const point = new Vector();

    if (dMin <= 0) {
      Vector.set(point, edge.lerp(clip.lambdaMin));
      // Vector.set(point, edge.a.position);
      depth = dMin;
    }
    else if (dMax <= 0) {
      Vector.set(point, edge.lerp(clip.lambdaMax));
      // Vector.set(point, edge.b.position);
      depth = dMax;
    }

    vclipData.featureA = edge;
    vclipData.featureB = face;
    vclipData.status = PENETRATION;
    vclipData.penetrationDepth = depth;
    vclipData.penetrationPoint = point;
    vclipData.penetrationNormal = face.getNormal();
    return PENETRATION;
  }

  if (checkDistancePrime(edge, face, clip.lambdaMin)) {
    if (clip.NMin != null) {
      return EEState(edge, clip.NMin);
    }
    else {
      return VFState(edge.a, face);
    }
  }
  else {
    if (clip.NMax != null) {
      return EEState(edge, clip.NMax);
    }
    else {
      return VFState(edge.b, face); // here
    }
  }
}

function handleLocalMin(vertex, face) {
  let dMax = -Infinity;
  let F0 = null;

  for (const otherFace of face.geometry.faces) {
    const plane = otherFace.getPlane();
    const distance = plane.signedDistanceToPoint(vertex.position);
    if (distance > dMax) {
      dMax = distance;
      F0 = otherFace;
    }
  }

  if (dMax <= 0) {
    // console.log("bruh");
    vclipData.featureA = vertex;
    vclipData.featureB = face;
    vclipData.status = PENETRATION;
    vclipData.penetrationDepth = dMax;
    vclipData.penetrationPoint = vertex.position;
    vclipData.penetrationNormal = F0.getNormal();
    return PENETRATION;
  }

  return VFState(vertex, F0);
}

/**
 * @returns {Plane}
 */
function getVoronoiPlane(X, Y) {
  if (X instanceof Vertex && Y instanceof Edge) {
    if (!(X == Y.a || X == Y.b)) {
      throw new Error();
    }

    const normal = X == Y.a ?
      Vector.normalize(Vector.subtract(Y.a.position, Y.b.position)) :
      Vector.normalize(Vector.subtract(Y.b.position, Y.a.position));
    const origin = X.position;

    return new Plane(normal, origin);
  }
  else if (X instanceof Face && Y instanceof Edge) {
    const face = X;
    const edge = Y;

    const normal = Vector.cross(face.getNormal(), edge.getAB());
    Vector.normalizeTo(normal);

    if (Vector.dot(normal, face.getOrigin()) - Vector.dot(normal, edge.b.position) < 0) {
      Vector.negateTo(normal);
    }

    const origin = edge.a.position;
    return new Plane(normal, origin);
  }
  else if (X instanceof Edge && Y instanceof Vertex) {
    const vp = getVoronoiPlane(Y, X);
    Vector.negateTo(vp.normal);
    return vp;
  }
  else if (X instanceof Edge && Y instanceof Face) {
    const face = Y;
    const edge = X;

    const normal = Vector.cross(face.getNormal(), edge.getAB());
    Vector.normalizeTo(normal);

    if (Vector.dot(normal, face.getOrigin()) - Vector.dot(normal, edge.b.position) > 0) {
      Vector.negateTo(normal);
    }

    const origin = edge.a.position;
    return new Plane(normal, origin);
  }
  else {
    console.log(X, Y);
    throw new Error("Invalid VP");
  }
}

function clipEdge(edge, X, S) {
  let lambdaMin = 0;
  let lambdaMax = 1;
  let NMin = null;
  let NMax = null;

  for (const feature of S) {
    const vp = getVoronoiPlane(X, feature);
    const da = vp.signedDistanceToPoint(edge.a.position);
    const db = vp.signedDistanceToPoint(edge.b.position);

    if (da < 0 && db < 0) {
      NMin = feature;
      NMax = feature;
      return { lambdaMin, lambdaMax, NMin, NMax, status: false };
    }
    else if (da < 0) {
      const lambda = da / (da - db);
      if (lambda > lambdaMin) {
        lambdaMin = lambda;
        NMin = feature;
        if (lambdaMin > lambdaMax) {
          return { lambdaMin, lambdaMax, NMin, NMax, status: false };
        }
      }
    }
    else if (db < 0) {
      const lambda = da / (da - db);
      if (lambda < lambdaMax) {
        lambdaMax = lambda;
        NMax = feature;
        if (lambdaMin > lambdaMax) {
          return { lambdaMin, lambdaMax, NMin, NMax, status: false };
        }
      }
    }
  }

  return { lambdaMin, lambdaMax, NMin, NMax, status: true };
}

function checkDistancePrime(edge, vertexOrFace, lambda) {
  if (!(edge instanceof Edge)) {
    throw new Error("edge must be 'Edge'");
  }

  if (vertexOrFace instanceof Vertex) {
    const u = edge.getAB();
    const v = Vector.subtract(edge.lerp(lambda), vertexOrFace.position);
    return Vector.dot(u, v) > 0;
  }
  else if (vertexOrFace instanceof Face) {
    const e = edge.lerp(lambda);
    const distance = vertexOrFace.getPlane().signedDistanceToPoint(e);
    const dPrime = Vector.dot(edge.getAB(), vertexOrFace.getNormal());

    if (distance > 0) {
      return dPrime > 0;
    }
    else {
      return dPrime < 0;
    }
  }
  else {
    throw new Error("Must be vertex or face");
  }
}

export function MeshGeometry(matrix, meshData) {
  if (!Matrix.isMatrix(matrix)) {
    throw new Error("matrix is not 'Matrix'");
  }

  // if (!(meshData instanceof renderer.MeshData)) {
  //   throw new Error("meshData is not 'MeshData'");
  // }

  this.localVertexPositions = [];
  this.vertices = [];
  this.edges = [];
  this.faces = [];

  const indexReroute = {};

  const getVertexPosition = (buffer, offset) => {
    const p = new Vector(
      buffer[offset],
      buffer[offset + 1],
      buffer[offset + 2]
    );
    // Matrix.transformVector(matrix, p, p);
    return p;
  };

  const createVertex = (buffer, index) => {
    const vertexPosition = getVertexPosition(buffer, index);

    const foundIndex = this.vertices.findIndex(v => Vector.distance(v.position, vertexPosition) < 0.001);
    if (foundIndex !== -1) {
      indexReroute[index / 3] = foundIndex;
      return this.vertices[foundIndex];
    }

    const vertex = new Vertex(vertexPosition);
    this.vertices.push(vertex);

    indexReroute[index / 3] = this.vertices.length - 1;

    return vertex;
  };

  const rerouteIndex = (index) => {
    if (index in indexReroute) {
      return indexReroute[index];
    }

    return index;
  };

  const createEdge = (indexA, indexB) => {
    indexA = rerouteIndex(indexA);
    indexB = rerouteIndex(indexB);

    const va = this.vertices[indexA];
    const vb = this.vertices[indexB];

    const existingEdge = edgeExists(va, vb);
    if (existingEdge) {
      return existingEdge;
    }

    const edge = new Edge(va, vb);
    this.edges.push(edge);
    return edge;
  };

  const edgeExists = (vertexA, vertexB) => {
    return this.edges.find(e => (e.a == vertexA && e.b == vertexB) || (e.b == vertexA && e.a == vertexB));
  };

  for (let i = 0; i < meshData.data.position.bufferData.length; i += 3) {
    createVertex(meshData.data.position.bufferData, i);
  }

  for (let i = 0; i < meshData.data.indices.bufferData.length; i += 3) {
    const indexA = meshData.data.indices.bufferData[i];
    const indexB = meshData.data.indices.bufferData[i + 1];
    const indexC = meshData.data.indices.bufferData[i + 2];

    const normal = getTriangleNormal([
      getVertexPosition(meshData.data.position.bufferData, indexA * 3),
      getVertexPosition(meshData.data.position.bufferData, indexB * 3),
      getVertexPosition(meshData.data.position.bufferData, indexC * 3)
    ]);

    const edgeA = createEdge(indexA, indexB);
    const edgeB = createEdge(indexB, indexC);
    const edgeC = createEdge(indexC, indexA);

    const face = new Face([ edgeA, edgeB, edgeC ]);
    face.normal = normal;
    face.localNormal = Vector.copy(normal);
    this.faces.push(face);
  }

  // console.log(this.vertices, this.edges, this.faces);

  for (const face of this.faces) {
    face.geometry = this;
  }
  for (const edge of this.edges) {
    edge.geometry = this;
  }
  for (const vertex of this.vertices) {
    vertex.geometry = this;
  }

  // Store neighboring edges for each vertex
  for (const vertex of this.vertices) {
    for (const edge of this.edges) {
      if (edge.isConnectedToVertex(vertex)) {
        vertex.neighborEdges.push(edge);
      }
    }
  }

  // Store neighboring faces for each edge
  for (const edge of this.edges) {
    for (const face of this.faces) {
      if (face.isConnectedToEdge(edge)) {
        edge.neighborFaces.push(face);
      }
    }
  }

  for (let i = 0; i < this.vertices.length; i++) {
    this.localVertexPositions[i] = Vector.copy(this.vertices[i].position);
    
    const p = this.vertices[i].position;
    Matrix.transformVector(matrix, p, p);

    // window.Debug.CreatePoint(p);
  }

  for (const face of this.faces) {
    Matrix.transformDirection(matrix, face.localNormal, face.normal);

    // window.Debug.CreateVector(face.getOrigin(), face.getNormal());
  }

  const _rotationMatrix = new Matrix();

  this.updateMatrix = function(matrix) {
    for (let i = 0; i < this.localVertexPositions.length; i++) {
      Matrix.transformVector(matrix, this.localVertexPositions[i], this.vertices[i].position);
    }

    Matrix.getRotationMatrix(matrix, _rotationMatrix);

    for (const face of this.faces) {
      Matrix.transformVector(_rotationMatrix, face.localNormal, face.normal);
    }
  };
}

export function CubeGeometry(matrix = Matrix.identity(), scale = Vector.one()) {
  this.localVertexPositions = [
    new Vector(-scale.x / 2, -scale.y / 2, -scale.z / 2),
    new Vector(scale.x / 2, -scale.y / 2, -scale.z / 2),
    new Vector(scale.x / 2, scale.y / 2, -scale.z / 2),
    new Vector(-scale.x / 2, scale.y / 2, -scale.z / 2),

    new Vector(-scale.x / 2, -scale.y / 2, scale.z / 2),
    new Vector(scale.x / 2, -scale.y / 2, scale.z / 2),
    new Vector(scale.x / 2, scale.y / 2, scale.z / 2),
    new Vector(-scale.x / 2, scale.y / 2, scale.z / 2),
  ];

  this.vertices = [
    new Vertex(Matrix.transformVector(matrix, new Vector(-scale.x / 2, -scale.y / 2, -scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(scale.x / 2, -scale.y / 2, -scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(scale.x / 2, scale.y / 2, -scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(-scale.x / 2, scale.y / 2, -scale.z / 2))),

    new Vertex(Matrix.transformVector(matrix, new Vector(-scale.x / 2, -scale.y / 2, scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(scale.x / 2, -scale.y / 2, scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(scale.x / 2, scale.y / 2, scale.z / 2))),
    new Vertex(Matrix.transformVector(matrix, new Vector(-scale.x / 2, scale.y / 2, scale.z / 2))),
  ];

  this.updateMatrix = function(matrix) {
    for (let i = 0; i < this.localVertexPositions.length; i++) {
      Matrix.transformVector(matrix, this.localVertexPositions[i], this.vertices[i].position);
    }
  };

  this.edges = [
    new Edge(this.vertices[0], this.vertices[1]),
    new Edge(this.vertices[1], this.vertices[2]),
    new Edge(this.vertices[2], this.vertices[3]),
    new Edge(this.vertices[3], this.vertices[0]),

    new Edge(this.vertices[4], this.vertices[5]),
    new Edge(this.vertices[5], this.vertices[6]),
    new Edge(this.vertices[6], this.vertices[7]),
    new Edge(this.vertices[7], this.vertices[4]),

    new Edge(this.vertices[0], this.vertices[4]),
    new Edge(this.vertices[1], this.vertices[5]),
    new Edge(this.vertices[2], this.vertices[6]),
    new Edge(this.vertices[3], this.vertices[7]),
  ];

  this.faces = [
    new Face([
      this.edges[0],
      this.edges[1],
      this.edges[2],
      this.edges[3],
    ], true),
    new Face([
      this.edges[4],
      this.edges[5],
      this.edges[6],
      this.edges[7],
    ]),
    new Face([
      this.edges[0],
      this.edges[9],
      this.edges[4],
      this.edges[8],
    ]),
    new Face([
      this.edges[1],
      this.edges[10],
      this.edges[5],
      this.edges[9],
    ]),
    new Face([
      this.edges[2],
      this.edges[11],
      this.edges[6],
      this.edges[10],
    ]),
    new Face([
      this.edges[3],
      this.edges[8],
      this.edges[7],
      this.edges[11],
    ]),
  ];

  for (const face of this.faces) {
    face.geometry = this;
  }
  for (const edge of this.edges) {
    edge.geometry = this;
  }
  for (const vertex of this.vertices) {
    vertex.geometry = this;
  }

  // Store neighboring edges for each vertex
  for (const vertex of this.vertices) {
    for (const edge of this.edges) {
      if (edge.isConnectedToVertex(vertex)) {
        vertex.neighborEdges.push(edge);
      }
    }
  }

  // Store neighboring faces for each edge
  for (const edge of this.edges) {
    for (const face of this.faces) {
      if (face.isConnectedToEdge(edge)) {
        edge.neighborFaces.push(face);
      }
    }
  }
}

function Vertex(position) {
  this.geometry = null;
  this.position = Vector.copy(position);
  this.neighborEdges = [];

  this.render = function() {
    window.Debug.Point(this.position, 0.02, [1, 0, 0]);
  };
}

function Edge(a, b) {
  this.geometry = null;
  this.a = a;
  this.b = b;
  this.neighborVertices = [ this.a, this.b ];
  this.neighborFaces = [];

  this.getAB = function() {
    return Vector.subtract(this.b.position, this.a.position);
  };

  this.lerp = function(lambda) {
    return Vector.lerp(this.a.position, this.b.position, lambda);
  };

  this.isConnectedToVertex = function(vertex) {
    return this.a === vertex || this.b === vertex;
  };

  this.getOtherVertex = function(vertex) {
    if (vertex == this.a) {
      return this.b;
    }
    else if (vertex == this.b) {
      return this.a;
    }

    throw new Error("Vertex is not part of edge");
  };

  this.render = function() {
    window.Debug.Vector(this.a.position, Vector.subtract(this.b.position, this.a.position), 1, [1, 1, 0]);

    this.a.render();
    this.b.render();
  };
}

function Face(edges, invertNormal = false) {
  this.geometry = null;
  this.edges = edges;
  this.vertices = [...new Set(this.edges.map(e => [ e.a, e.b ]).flat())];
  this.normal = null;

  this.isConnectedToEdge = function(edge) {
    return this.edges.includes(edge);
  };

  // bruh hopefully always works
  this.getNormal = function() {
    if (this.normal) {
      return Vector.copy(this.normal);
    }

    const normal = getTriangleNormal([
      this.vertices[0].position,
      this.vertices[1].position,
      this.vertices[2].position
    ]);
    if (invertNormal) {
      Vector.negateTo(normal);
    }
    return normal;
  };

  this.getOrigin = function() {
    const sum = this.vertices.map(v => v.position).reduce((a, b) => Vector.add(a, b), Vector.zero());
    Vector.divideTo(sum, this.vertices.length);
    return sum;
  };

  this.getPlane = function() {
    const normal = this.getNormal();
    const origin = this.getOrigin();
    return new Plane(normal, origin);
  };

  this.render = function() {
    for (const edge of this.edges) {
      edge.render();
    }
  };
}

function Plane(normal, origin) {
  this.normal = normal;
  this.origin = origin;

  if (!Vector.isVectorIsh(normal)) {
    throw new Error("Normal must be vector");
  }

  if (!Vector.isVectorIsh(origin)) {
    throw new Error("Origin must be vector");
  }

  this.signedDistanceToPoint = function(point) {
    if (!Vector.isVectorIsh(point)) {
      throw new Error("Point is not vector");
    }

    const v = Vector.subtract(point, this.origin);
    return Vector.dot(v, this.normal);
  };
}

function VClipData() {
  this.featureA = null;
  this.featureB = null;
  this.status = null;
  this.penetrationDepth = null;
  this.penetrationPoint = null;
  this.penetrationNormal = null;

  this.copy = function() {
    const c = new VClipData();
    c.featureA = this.featureA;
    c.featureB = this.featureB;
    c.status = this.status;
    c.penetrationDepth = this.penetrationDepth;
    c.penetrationPoint = this.penetrationPoint;
    c.penetrationNormal = this.penetrationNormal;

    return c;
  };
}