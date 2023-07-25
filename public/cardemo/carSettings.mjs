import { Car, Wing } from "../car.js";
import Vector from "../engine/vector.mjs";

const aventador = {
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

const drift = {
  name: "Toyota ae86",
  model: "../assets/models/toyota_ae86.glb",//"../assets/models/volvov70.glb",
  settings: {
    mass: 1000,
    drivetrain: "RWD",
    friction: 0.9,
    forwardFriction: 1,
    sidewaysFriction: 1,
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

const drift2 = JSON.parse(JSON.stringify(drift));
drift2.settings.maxSteerAngle = 85;
drift2.model = "../assets/models/FocE.glb";

const gtr = JSON.parse(JSON.stringify(drift));
gtr.model = "../assets/models/nissanGTR.glb";
// gtr.model = "../cargame/nissanGTR2.glb";

const ranger = {
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

const skyline = {
  name: "Nissan Skyline R32 GT-R",
  model: "../assets/models/skyline.glb",
  settings: {
    mass: 1400,
    gearRatios: [2.66, 1.78, 1.3, 1, 0.74, 0.6],
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 45,
    torque: 400 * 1.5,

    suspensionForce: 90_000,
    suspensionDamping: 2000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,
    antiRoll: 10_000,

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

const M3_E30 = {
  name: "BMW M3 Coupe (E30) 1986",
  model: "../assets/models/M3_E30.glb",
  settings: {
    mass: 1000,
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 50,
    torque: 600,

    suspensionForce: 90_000,
    suspensionDamping: 4000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,
    antiRoll: 10_000,

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

const crownVic = {
  name: "Police car",
  model: "../assets/models/crownvic.glb",
  settings: {
    mass: 1700,
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 45,
    torque: 400 * 1.5,

    suspensionForce: 60_000,
    suspensionDamping: 4000,
    suspensionTravel: 0.15,
    rideHeightOffset: 0.1,
    antiRoll: 9_000,

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

const bus = {
  name: "Nagoya City Bus",
  model: "../assets/models/bus.glb",
  settings: {
    mass: 7000,
    drivetrain: "RWD",
    maxSteerAngle: 45,
    torque: 350 * 10,

    friction: 0.5,
    forwardFriction: 1,
    sidewaysFriction: 1,

    suspensionForce: 200_000,
    suspensionDamping: 8000,
    suspensionTravel: 0.2,
    rideHeightOffset: 0.08,
    antiRoll: 50_000,

    // COMOffset: {x: 0, y: -1, z: 0},

    ABS: true,
    TCS: false,
    differential: Car.ENUMS.DIFFERENTIAL.LSD,

    camera: {
      followDistance: 7,
      followHeight: 0.25,
      pitch: 0.1,
    },
  },
};

const audiRS6 = {
  name: "Audi RS6",
  model: "../assets/models/audi_rs6.glb",
  settings: {
    mass: 2000,
    drivetrain: "AWD",
    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 45,
    torque: 550,

    suspensionForce: 130_000,
    suspensionDamping: 5000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,
    antiRoll: 10_000,

    ABS: true,
    TCS: false,
    differential: Car.ENUMS.DIFFERENTIAL.LSD,

    camera: {
      followDistance: 4,
      followHeight: 0.25,
      pitch: 0.1,
    },
  },
};

export const lowpolySportsCar = {
  name: "Lowpoly Sports Car",
  model: "../assets/models/cars/lowpolySportsCar.glb",
  settings: {
    mass: 1400,
    gearRatios: [2.66, 1.78, 1.3, 1, 0.74, 0.6],
    drivetrain: "RWD",
    friction: 1,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 40,
    torque: 350,

    suspensionForce: 120_000,
    suspensionDamping: 4000,
    suspensionTravel: 0.1,
    rideHeightOffset: 0.08,
    antiRoll: 10_000,

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

export const lowpolyJeep = {
  name: "Lowpoly Jeep",
  model: "../assets/models/cars/lowpolyJeep.glb",
  settings: {
    mass: 1700,
    drivetrain: "RWD",
    offroadFriction: 1,
    friction: 0.8,
    forwardFriction: 1,
    sidewaysFriction: 1,
    maxSteerAngle: 45,
    torque: 400,

    COMOffset: new Vector(0, -0.5, 0),
    suspensionForce: 60_000,
    suspensionDamping: 4000,
    suspensionTravel: 0.15,
    rideHeightOffset: 0.1,
    antiRoll: 9_000,

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

export {
  aventador,
  drift,
  drift2,
  gtr,
  skyline,
  ranger,
  bus,
  audiRS6,
  M3_E30,
  crownVic
};