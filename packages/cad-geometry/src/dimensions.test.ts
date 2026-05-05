import { describe, it, expect } from "vitest";
import {
  buildAlignedDimensionGeometry,
  buildAngularDimensionGeometry,
  buildDiameterDimensionGeometry,
  buildLinearDimensionGeometry,
  buildRadiusDimensionGeometry,
  formatDimensionValue
} from "./dimensions";

describe("Dimensions Geometry", () => {
  const defaultStyle = {
    textHeight: 12,
    arrowSize: 6,
    extensionOffset: 2,
    extensionOvershoot: 3,
    precision: 2,
    unitSuffix: " mm"
  };

  describe("formatDimensionValue", () => {
    it("formats value correctly", () => {
      expect(formatDimensionValue(10.567, 2, " mm")).toBe("10.57 mm");
      expect(formatDimensionValue(10, 0, "")).toBe("10");
    });
  });

  describe("buildLinearDimensionGeometry", () => {
    it("builds horizontal dimension correctly", () => {
      const def = {
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 50, y: 10 },
        dimensionLinePoint: { x: 30, y: 30 },
        orientation: "horizontal" as const
      };

      const result = buildLinearDimensionGeometry(def, defaultStyle);
      expect(result.measuredValue).toBeCloseTo(40);
      expect(result.dimensionLine.start).toEqual({ x: 10, y: 30 });
      expect(result.dimensionLine.end).toEqual({ x: 50, y: 30 });
      expect(result.textRotation).toBe(0);
    });

    it("builds vertical dimension correctly", () => {
      const def = {
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 10, y: 50 },
        dimensionLinePoint: { x: 30, y: 30 },
        orientation: "vertical" as const
      };

      const result = buildLinearDimensionGeometry(def, defaultStyle);
      expect(result.measuredValue).toBeCloseTo(40);
      expect(result.dimensionLine.start).toEqual({ x: 30, y: 10 });
      expect(result.dimensionLine.end).toEqual({ x: 30, y: 50 });
      expect(result.textRotation).toBeCloseTo(-Math.PI / 2);
    });

    it("auto resolves to horizontal when pulled vertically", () => {
      const def = {
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 50, y: 20 }, // dx = 40, dy = 10
        dimensionLinePoint: { x: 30, y: 100 }, // pulling strongly in Y -> measure X
        orientation: "auto" as const
      };
      const result = buildLinearDimensionGeometry(def, defaultStyle);
      expect(result.measuredValue).toBeCloseTo(40); // Horizontal measurement
    });
  });

  describe("buildAlignedDimensionGeometry", () => {
    it("builds aligned dimension parallel to segment", () => {
      const def = {
        firstPoint: { x: 10, y: 10 },
        secondPoint: { x: 40, y: 50 }, // distance = 50 (30,40,50 triangle)
        dimensionLinePoint: { x: 0, y: 100 } // pulled arbitrarily
      };

      const result = buildAlignedDimensionGeometry(def, defaultStyle);
      expect(result.measuredValue).toBeCloseTo(50);
      // The text rotation should match the segment angle or be readable
      // Angle of (30, 40) is atan2(40, 30) = ~53 degrees
      const angle = Math.atan2(40, 30);
      expect(result.textRotation).toBeCloseTo(angle);
    });
  });

  describe("circular and angular dimensions", () => {
    it("builds a radius dimension with R prefix", () => {
      const result = buildRadiusDimensionGeometry({
        center: { x: 0, y: 0 },
        radius: 5,
        leaderEndPoint: { x: 10, y: 0 }
      }, defaultStyle);

      expect(result.measuredValue).toBe(5);
      expect(result.formattedText).toBe("R 5.00 mm");
      expect(result.dimensionLine.end).toEqual({ x: 5, y: 0 });
    });

    it("builds a diameter dimension with diameter prefix", () => {
      const result = buildDiameterDimensionGeometry({
        center: { x: 0, y: 0 },
        radius: 5,
        leaderEndPoint: { x: 10, y: 0 }
      }, defaultStyle);

      expect(result.measuredValue).toBe(10);
      expect(result.formattedText).toBe("\u00d8 10.00 mm");
      expect(result.dimensionLine.start).toEqual({ x: -5, y: 0 });
      expect(result.dimensionLine.end).toEqual({ x: 5, y: 0 });
    });

    it("builds a right angular dimension in degrees", () => {
      const result = buildAngularDimensionGeometry({
        vertex: { x: 0, y: 0 },
        firstPoint: { x: 10, y: 0 },
        secondPoint: { x: 0, y: 10 },
        arcPoint: { x: 5, y: 5 }
      }, defaultStyle);

      expect(result.measuredValue).toBeCloseTo(90);
      expect(result.formattedText).toBe("90.00\u00b0");
    });
  });
});
