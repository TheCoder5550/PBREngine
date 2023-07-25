import Vector from "../engine/vector.mjs";
import Matrix from "../engine/matrix.mjs";
import Quaternion from "../engine/quaternion.mjs";
import { GameObject } from "../engine/gameObject.mjs";
import { MeshCollider } from "../engine/physics.mjs";

export default function City(scene, houseMeshRenderer) {
  const renderer = scene.renderer;
  
  this.generate = function(data, dataWidth, dataHeight, settings = {}) {
    generateRoadNetwork(data, dataWidth, dataHeight, settings);
  };

  function generateRoadNetwork(data, dataWidth, dataHeight, settings = {}) {
    const material = settings.material ?? renderer.CreateLitMaterial();
    const asphaltMaterial = settings.asphaltMaterial ?? material;
    const chunkSize = settings.chunkSize ?? 25;
    
    const flatIndex = (i, j) => i * dataWidth + j;

    const indicesToPosition = (i, j) => {
      return new Vector(i * chunkSize, 0.04, j * chunkSize);
    };

    const hasRoad = (i, j) => {
      if (i < 0 || i >= dataWidth || j < 0 || j >= dataHeight) {
        return false;
      }

      return data[flatIndex(i, j)] === 1;
    };

    const generateChunk = (i, j) => {
      const position = indicesToPosition(i, j);

      if (data[flatIndex(i, j)] === 2) {
        houseMeshRenderer.addInstance(Matrix.translate(position));
        return;
      }

      if (!hasRoad(i, j)) {
        return;
      }

      let neighbours = 0;
      neighbours += hasRoad(i - 1, j);
      neighbours += hasRoad(i + 1, j);
      neighbours += hasRoad(i, j - 1);
      neighbours += hasRoad(i, j + 1);

      if (neighbours === 4) {
        generate4wayIntersection(position, { material: asphaltMaterial, chunkSize });
        return;
      }

      if (neighbours === 3) {
        const isAEmpty = !hasRoad(i + 1, j);
        const isBEmpty = !hasRoad(i, j + 1);
        const isCEmpty = !hasRoad(i - 1, j);
        const isDEmpty = !hasRoad(i, j - 1);

        const piece = generate3wayIntersection(position, { material, chunkSize });
        if (isAEmpty)      piece.transform.rotation = Quaternion.euler(0, 0, 0);
        else if (isBEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 0.5, 0);
        else if (isCEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI, 0);
        else if (isDEmpty) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 1.5, 0);

        return;
      }

      if (neighbours === 2) {
        const straightA = hasRoad(i - 1, j) && hasRoad(i + 1, j);
        const straightB = hasRoad(i, j - 1) && hasRoad(i, j + 1);
        const isStraight = straightA || straightB;

        if (isStraight) {
          const piece = generateStraightRoad(position, { material, chunkSize });
          if (straightB) {
            piece.transform.rotation = Quaternion.euler(0, Math.PI / 2, 0);
          }
        }
        else {
          const isTurnA = hasRoad(i, j - 1) && hasRoad(i - 1, j);
          const isTurnB = hasRoad(i, j - 1) && hasRoad(i + 1, j);
          const isTurnC = hasRoad(i, j + 1) && hasRoad(i + 1, j);
          const isTurnD = hasRoad(i, j + 1) && hasRoad(i - 1, j);

          const piece = generateTurn(position, { material, chunkSize });
          if (isTurnA)      piece.transform.rotation = Quaternion.euler(0, 0, 0);
          else if (isTurnB) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 0.5, 0);
          else if (isTurnC) piece.transform.rotation = Quaternion.euler(0, -Math.PI, 0);
          else if (isTurnD) piece.transform.rotation = Quaternion.euler(0, -Math.PI * 1.5, 0);
        }

        return;
      }
    };

    for (let i = 0; i < dataWidth; i++) {
      for (let j = 0; j < dataHeight; j++) {
        generateChunk(i, j);
      }
    }
  }

  function generateTurn(position, settings = {}) {
    const gameObject = new GameObject("Turn");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;

    const offset = new Vector(-chunkSize / 2, 0, -chunkSize / 2);

    for (let i = 0; i < cornerResolution; i++) {
      const angle = i / (cornerResolution - 1) * Math.PI / 2;
      const y = offset.y;

      let cornerRadius = (chunkSize - roadWidth) / 2;
      let x = offset.x + Math.cos(angle) * cornerRadius;
      let z = offset.z + Math.sin(angle) * cornerRadius;
      vertices.push(x, y, z);

      cornerRadius = (chunkSize - roadWidth) / 2 + roadWidth;
      x = offset.x + Math.cos(angle) * cornerRadius;
      z = offset.z + Math.sin(angle) * cornerRadius;
      vertices.push(x, y, z);

      const distanceAlongRoad = i / (cornerResolution - 1);
      uvs.push(0, distanceAlongRoad);
      uvs.push(1, distanceAlongRoad);
    }

    for (let i = 0; i < cornerResolution - 1; i++) {
      indices.push(
        i * 2 + 0,
        i * 2 + 2,
        i * 2 + 1,

        i * 2 + 2,
        i * 2 + 3,
        i * 2 + 1,
      );
    }

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generateStraightRoad(position, settings = {}) {
    const gameObject = new GameObject("Straight road");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const uvStretch = Math.round(chunkSize / roadWidth);

    vertices.push(
      -chunkSize / 2,
      0,
      -roadWidth / 2
    );
    vertices.push(
      chunkSize / 2,
      0,
      -roadWidth / 2
    );
    vertices.push(
      chunkSize / 2,
      0,
      roadWidth / 2
    );
    vertices.push(
      -chunkSize / 2,
      0,
      roadWidth / 2
    );

    uvs.push(0, 0);
    uvs.push(0, 1 * uvStretch);
    uvs.push(1, 1 * uvStretch);
    uvs.push(1, 0);

    indices.push(
      0,
      2,
      1
    );
    indices.push(
      0,
      3,
      2
    );

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generate4wayIntersection(position, settings = {}) {
    const gameObject = new GameObject("4-way intersection");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;
    const cornerRadius = (chunkSize - roadWidth) / 2;

    const createCorner = (position, angleOffset) => {
      const vertexOffset = vertices.length / 3;

      const angle = angleOffset + Math.PI / 4;
      const diagonal = Math.sqrt(2) * cornerRadius;
      const x = position.x + Math.cos(angle) * diagonal;
      const z = position.z + Math.sin(angle) * diagonal;
      vertices.push(
        x,
        position.y,
        z
      );
      uvs.push(x / roadWidth, z / roadWidth);

      for (let i = 0; i < cornerResolution; i++) {
        let angle = angleOffset + i / (cornerResolution - 1) * Math.PI / 2;
        let x = position.x + Math.cos(angle) * cornerRadius;
        let y = position.y;
        let z = position.z + Math.sin(angle) * cornerRadius;
        vertices.push(x, y, z);
        uvs.push(x / roadWidth, z / roadWidth);
      }

      for (let i = 0; i < cornerResolution - 1; i++) {
        indices.push(
          vertexOffset + 0,
          vertexOffset + i + 1,
          vertexOffset + i + 2
        );
      }
    };

    const createRoad = (a, b) => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - a / 2,
        0,
        0 - b / 2
      );
      vertices.push(
        0 + a / 2,
        0,
        0 - b / 2
      );
      vertices.push(
        0 + a / 2,
        0,
        0 + b / 2
      );
      vertices.push(
        0 - a / 2,
        0,
        0 + b / 2
      );

      uvs.push(
        (0 - a / 2) / roadWidth,
        (0 - b / 2) / roadWidth
      );
      uvs.push(
        (0 + a / 2) / roadWidth,
        (0 - b / 2) / roadWidth
      );
      uvs.push(
        (0 + a / 2) / roadWidth,
        (0 + b / 2) / roadWidth
      );
      uvs.push(
        (0 - a / 2) / roadWidth,
        (0 + b / 2) / roadWidth
      );

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    createCorner(new Vector(-chunkSize / 2, 0, -chunkSize / 2), 0);
    createCorner(new Vector(-chunkSize / 2, 0, chunkSize / 2), -Math.PI / 2);
    createCorner(new Vector(chunkSize / 2, 0, -chunkSize / 2), Math.PI / 2);
    createCorner(new Vector(chunkSize / 2, 0, chunkSize / 2), Math.PI);

    createRoad(chunkSize, roadWidth);
    createRoad(roadWidth, chunkSize);

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }

  function generate3wayIntersection(position, settings = {}) {
    const gameObject = new GameObject("3-way intersection");

    const indices = [];
    const vertices = [];
    const uvs = [];

    const material = settings.material ?? renderer.CreateLitMaterial();
    const chunkSize = settings.chunkSize ?? 20;
    const roadWidth = settings.roadWidth ?? 12;
    const cornerResolution = settings.cornerResolution ?? 15;
    const cornerRadius = (chunkSize - roadWidth) / 2;

    const createCorner = (position, angleOffset) => {
      const vertexOffset = vertices.length / 3;

      const angle = angleOffset + Math.PI / 4;
      const diagonal = Math.sqrt(2) * cornerRadius;
      const x = position.x + Math.cos(angle) * diagonal;
      const z = position.z + Math.sin(angle) * diagonal;
      vertices.push(
        x,
        position.y,
        z
      );
      uvs.push(x / roadWidth, z / roadWidth);

      for (let i = 0; i < cornerResolution; i++) {
        let angle = angleOffset + i / (cornerResolution - 1) * Math.PI / 2;
        let x = position.x + Math.cos(angle) * cornerRadius;
        let y = position.y;
        let z = position.z + Math.sin(angle) * cornerRadius;
        vertices.push(x, y, z);
        uvs.push(x / roadWidth, z / roadWidth);
      }

      for (let i = 0; i < cornerResolution - 1; i++) {
        indices.push(
          vertexOffset + 0,
          vertexOffset + i + 1,
          vertexOffset + i + 2
        );
      }
    };

    const createMainRoad = () => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - roadWidth / 2,
        0,
        0 - chunkSize / 2
      );
      vertices.push(
        0 + roadWidth / 2,
        0,
        0 - chunkSize / 2
      );
      vertices.push(
        0 + roadWidth / 2,
        0,
        0 + chunkSize / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 + chunkSize / 2
      );

      uvs.push(0, 0);
      uvs.push(1, 0);
      uvs.push(1, 1);
      uvs.push(0, 1);

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    const createSmallRoad = () => {
      const vertexOffset = vertices.length / 3;

      vertices.push(
        0 - chunkSize / 2,
        0,
        0 - roadWidth / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 - roadWidth / 2
      );
      vertices.push(
        0 - roadWidth / 2,
        0,
        0 + roadWidth / 2
      );
      vertices.push(
        0 - chunkSize / 2,
        0,
        0 + roadWidth / 2
      );

      uvs.push(0, 0);
      uvs.push(0, 1);
      uvs.push(1, 1);
      uvs.push(1, 0);

      indices.push(
        vertexOffset + 0,
        vertexOffset + 2,
        vertexOffset + 1
      );
      indices.push(
        vertexOffset + 0,
        vertexOffset + 3,
        vertexOffset + 2
      );
    };

    createCorner(new Vector(-chunkSize / 2, 0, -chunkSize / 2), 0);
    createCorner(new Vector(-chunkSize / 2, 0, chunkSize / 2), -Math.PI / 2);

    createMainRoad();
    createSmallRoad();

    const meshData = new renderer.MeshData({
      indices: {
        bufferData: new Uint32Array(indices),
        target: renderer.gl.ELEMENT_ARRAY_BUFFER
      },
      position: {
        bufferData: new Float32Array(vertices),
        size: 3
      },
      uv: {
        bufferData: new Float32Array(uvs),
        size: 2
      }
    });
    meshData.recalculateNormals();
    meshData.recalculateTangents();

    gameObject.transform.position = position;
    gameObject.meshRenderer = new renderer.MeshRenderer(material, meshData);
    gameObject.addComponent(new MeshCollider());

    scene.add(gameObject);

    return gameObject;
  }
}