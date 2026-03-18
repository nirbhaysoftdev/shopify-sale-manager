import { AppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";

function App() {
  return (
    <AppProvider i18n={enTranslations}>
      <div style={{ padding: "20px" }}>
        <h1>Sale Campaign Manager</h1>
        <p>✅ App is running successfully!</p>
      </div>
    </AppProvider>
  );
}

export default App;
