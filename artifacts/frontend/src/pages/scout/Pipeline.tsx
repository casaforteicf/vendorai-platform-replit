import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScoutPipeline() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/scout?tab=acoes");
  }, [setLocation]);

  return null;
}
