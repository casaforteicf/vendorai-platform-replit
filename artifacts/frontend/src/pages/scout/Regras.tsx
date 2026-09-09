import { useEffect } from "react";
import { useLocation } from "wouter";

export default function ScoutRegras() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/scout?tab=config");
  }, [setLocation]);

  return null;
}
