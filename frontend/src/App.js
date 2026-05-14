import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import { Routes, Route, useNavigate } from "react-router-dom";
import CampaignsPage from "./pages/CampaignsPage";
import CreateCampaignPage from "./pages/CreateCampaignPage";

export const BACKEND_URL = window.location.origin;
export const SHOP = new URLSearchParams(window.location.search).get("shop") || "thespiritsembassy-dev.myshopify.com";

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <Routes>
        <Route path="/" element={<CampaignsPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/create" element={<CreateCampaignPage />} />
      </Routes>
    </AppProvider>
  );
}

export default App;