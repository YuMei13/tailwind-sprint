declare module "@mapbox/mapbox-gl-directions" {
  export default class MapboxDirections {
    constructor(options: {
      accessToken: string | undefined;
      alternatives?: boolean;
      geometries?: "geojson" | "polyline" | "polyline6";
      profile?: string;
      controls?: {
        inputs?: boolean;
        instructions?: boolean;
        profileSwitcher?: boolean;
      };
    });
    addTo(map: unknown): void;
  }
}
