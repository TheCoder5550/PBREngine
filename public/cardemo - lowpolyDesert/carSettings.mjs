import { Car } from "../car.js";

export const myLowpolySportsCar = {
  name: "Lowpoly Sports Car",
  model: "myLowpolyCar.glb",
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
    suspensionTravel: 0.1 * 1.5,
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