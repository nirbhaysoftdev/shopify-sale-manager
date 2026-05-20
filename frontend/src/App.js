import { AppProvider, Page, Banner, Card, Text, BlockStack } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import { Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import CampaignsPage from "./pages/CampaignsPage";
import CreateCampaignPage from "./pages/CreateCampaignPage";
import { initAppBridge, getInitError, getShop } from "./utils/authFetch";

export const BACKEND_URL = window.location.origin;
export const SHOP = new URLSearchParams(window.location.search).get("shop") || "";

function NotEmbeddedNotice({ reason }) {
  return (
    <Page title="Sale Campaign Manager">
      <Card>
        <BlockStack gap="300">
          <Banner tone="warning">Open this app from your Shopify admin.</Banner>
          <Text variant="bodyMd">
            This app must be loaded inside the Shopify admin. To install it on
            your store, visit:
          </Text>
          <Text variant="bodyMd" fontWeight="semibold">
            {window.location.origin}/auth?shop=&lt;your-store&gt;.myshopify.com
          </Text>
          {reason && (
            <Text variant="bodySm" tone="subdued">Details: {reason}</Text>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const shop = getShop();
    const instance = initAppBridge();
    if (!shop || !instance) {
      setError(getInitError()?.message || "App must be opened from Shopify admin.");
      return;
    }
    setReady(true);
  }, []);

  return (
    <AppProvider i18n={enTranslations}>
      {!ready ? (
        <NotEmbeddedNotice reason={error} />
      ) : (
        <Routes>
          <Route path="/" element={<CampaignsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/create" element={<CreateCampaignPage />} />
        </Routes>
      )}
    </AppProvider>
  );
}

export default App;
