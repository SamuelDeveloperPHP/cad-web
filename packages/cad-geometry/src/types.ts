export type Point2D = Readonly<{
  x: number;
  y: number;
}>;

export type Vector2D = Readonly<{
  x: number;
  y: number;
}>;

export type Matrix2D = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;

export type BoundingBox = Readonly<{
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;

export type GeometryId = string;

export type LineGeometry = Readonly<{
  type: "line";
  id?: GeometryId;
  start: Point2D;
  end: Point2D;
}>;

export type SegmentGeometry = Readonly<{
  type: "segment";
  id?: GeometryId;
  start: Point2D;
  end: Point2D;
}>;

export type PolylineGeometry = Readonly<{
  type: "polyline";
  id?: GeometryId;
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

export type RectangleGeometry = Readonly<{
  type: "rectangle";
  id?: GeometryId;
  origin: Point2D;
  width: number;
  height: number;
  rotation: number;
}>;

export type CircleGeometry = Readonly<{
  type: "circle";
  id?: GeometryId;
  center: Point2D;
  radius: number;
}>;

export type ArcGeometry = Readonly<{
  type: "arc";
  id?: GeometryId;
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}>;

export type GeometryEntity =
  | LineGeometry
  | SegmentGeometry
  | PolylineGeometry
  | RectangleGeometry
  | CircleGeometry
  | ArcGeometry;
