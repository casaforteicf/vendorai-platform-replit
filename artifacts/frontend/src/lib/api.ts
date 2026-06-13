import { setAuthTokenGetter } from "@workspace/api-client-react";

export function setupApiClient() {
  setAuthTokenGetter(() => localStorage.getItem("vendorai_token"));
}
