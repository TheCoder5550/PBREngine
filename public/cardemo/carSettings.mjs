import { Car, Wing } from "../car.js";
import Vector from "../engine/vector.mjs";

var aventador = {
  name: "Lamborghini Aventador",
  model: "../assets/models/aventador.glb",
  settings: {
    drivetrain: "RWD",
    torque: 700,
    gearChangeTime: 0.15,

    friction: 1.2,
    forwardFriction: 1,
    sidewaysFriction: 1.05,

    maxSteerAngle: 40,
    steerVelocity: 100,

    suspensionForce: 90_000,
    suspensionDamping: 3000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,

    ABS: true,
    differential: Car.ENUMS.DIFFERENTIAL.LSD,

    wings: [
      new Wing(new Vector(0, 0.5, -2.3), 0.4),
      new Wing(new Vector(0, -0.4, 2.2), 0.42),
    ],

    camera: {
      followDistance: 4,
      followHeight: 0.25,
      pitch: 0.1,
    },
  },
};

var drift = {
  name: "Toyota ae86",
  model: "../assets/models/toyota_ae86.glb",//"../assets/models/volvov70.glb",
  settings: {
    mass: 1000,
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1 * 0.9,
    sidewaysFriction: 1.1,
    maxSteerAngle: 70, //53
    torque: 400,

    suspensionForce: 90_000,
    suspensionDamping: 3000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,
    antiRoll: 16_000,

    ABS: false,
    TCS: false,
    differential: Car.ENUMS.DIFFERENTIAL.LSD,

    camera: {
      followDistance: 4,
      followHeight: 0.25,
      pitch: 0.1,
    },
  },
};

var drift2 = JSON.parse(JSON.stringify(drift));
drift2.model = "../assets/models/FocE.glb";

var ranger = {
  name: "Ford Ranger",
  model: "../assets/models/ford_ranger_police.glb",
  settings: {
    mass: 1900,

    drivetrain: "RWD",
    differentialRatio: 7,

    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 40,
    torque: 500,

    suspensionForce: 45_000,
    suspensionDamping: 4000,
    suspensionTravel: 0.3,
    rideHeightOffset: 0.3,
    antiRoll: 15_000,

    TCS: true,
    ABS: true,

    camera: {
      followDistance: 4,
      followHeight: 0.25,
      pitch: 0.1,
    },
  },
};

export {
  aventador,
  drift,
  drift2,
  ranger
};