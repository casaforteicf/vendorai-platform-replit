import { useEffect } from "react";
import { useLocation } from "wouter";

const VIDEO_ROUTE_PREFIX = "/content-studio/video";

export function VideoRouteThemeSync() {
  const [location] = useLocation();

  useEffect(() => {
    const isVideoRoute = location === VIDEO_ROUTE_PREFIX || location.startsWith(`${VIDEO_ROUTE_PREFIX}/`);
    document.body.classList.toggle("vendorai-video-route", isVideoRoute);

    return () => {
      document.body.classList.remove("vendorai-video-route");
    };
  }, [location]);

  return null;
}
