import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScoutOportunidades() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/scout?tab=oportunidades");
  }, [setLocation]);

  return null;
}
