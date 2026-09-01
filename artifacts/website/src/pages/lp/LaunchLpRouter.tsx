import { useParams } from "wouter";
import LpRouter from "./LpPage";
import CanonicalLaunchPackPage from "./CanonicalLaunchPackPage";
import { getCanonicalLaunchPack } from "./launchPackData";

export default function LaunchLpRouter() {
  const { slug = "" } = useParams<{ slug: string }>();
  return getCanonicalLaunchPack(slug) ? <CanonicalLaunchPackPage /> : <LpRouter />;
}
