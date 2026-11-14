import { Navigate, useNavigate } from "react-router-dom";
import { PlanetPath } from "../components/PlanetPath";
import { useStore } from "../context/Store";

export function PlanetsPage() {
  const store = useStore();
  const navigate = useNavigate();
  const profile = store.profiles.find((item) => item.id === store.activeProfileId);
  const cleared = profile?.arenasCleared ?? 0;

  if (store.playMode !== "named" || !profile?.passwordHash) return <Navigate to="/" replace />;

  return (
    <PlanetPath
      cleared={cleared}
      run={profile.arenaRun?.planetId ? profile.arenaRun : undefined}
      onOpen={(arenaId) => navigate("/arena", { state: { arenaId } })}
    />
  );
}
