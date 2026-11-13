import { CommercialDataProvider } from "./CommercialDataProvider";
import { App } from "./App";

export function AuthGate() {
  return <CommercialDataProvider><App /></CommercialDataProvider>;
}
