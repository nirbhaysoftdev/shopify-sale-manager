import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Page, Card, DataTable, Button, Badge,
  Layout, Text, BlockStack, InlineStack,
  InlineGrid, Spinner, Tabs, Modal, Banner,
  EmptyState, Box, Divider
} from "@shopify/polaris";
import { BACKEND_URL, SHOP } from "../App";

export default function CampaignsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [counts, setCounts] = useState({ total: 0, running: 0, upcoming: 0, ended: 0 });
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [endingCampaign, setEndingCampaign] = useState(null);
  const [confirmEndModal, setConfirmEndModal] = useState(null);
  const [message, setMessage] = useState(null);

  const tabStatuses = ["all", "running", "upcoming", "ended"];

  const tabs = [
    { id: "all", content: "All" },
    { id: "running", content: "Running" },
    { id: "upcoming", content: "Upcoming" },
    { id: "ended", content: "Ended" }
  ];

  useEffect(() => {
    fetchCampaigns();
  }, [selectedTab]);

  // Pick up the pending banner from CreateCampaignPage navigation, listen for
  // the create resolution event, and consume any toast left in sessionStorage.
  useEffect(() => {
    const consumeToast = () => {
      const raw = sessionStorage.getItem("campaign-toast");
      if (!raw) return false;
      sessionStorage.removeItem("campaign-toast");
      try { setMessage(JSON.parse(raw)); } catch {}
      return true;
    };

    if (location.state?.pendingCreate) {
      setMessage({
        type: "info",
        text: `Creating "${location.state.pendingCreate.name}"…`
      });
      navigate(location.pathname, { replace: true, state: null });
    }

    consumeToast();

    const onResolved = () => {
      consumeToast();
      fetchCampaigns();
    };
    window.addEventListener("campaign:create-resolved", onResolved);
    return () => window.removeEventListener("campaign:create-resolved", onResolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCampaigns() {
    setLoading(true);
    try {
      const status = tabStatuses[selectedTab];
      const res = await fetch(`${BACKEND_URL}/api/campaigns?shop=${SHOP}&status=${status}`);
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      console.error("Failed to fetch campaigns", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEndCampaign(campaignId) {
    // Close the modal immediately so the page is interactive while the work
    // runs in the background. The row's "End now" button keeps its loading
    // state via `endingCampaign` until the API call resolves.
    setEndingCampaign(campaignId);
    setConfirmEndModal(null);
    setMessage({ type: "info", text: "Ending campaign and restoring prices…" });

    try {
      const res = await fetch(`${BACKEND_URL}/api/campaigns/${campaignId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: SHOP })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Campaign ended and prices restored." });
        fetchCampaigns();
      } else {
        setMessage({ type: "critical", text: data.error || "Failed to end campaign" });
      }
    } catch (err) {
      setMessage({ type: "critical", text: "Failed to end campaign" });
    } finally {
      setEndingCampaign(null);
    }
  }

  function getStatusBadge(status) {
    const config = {
      active: { tone: "success", label: "Running" },
      scheduled: { tone: "info", label: "Upcoming" },
      completed: { tone: "neutral", label: "Ended" },
      cancelled: { tone: "critical", label: "Cancelled" }
    };
    const c = config[status] || { tone: "neutral", label: status };
    return <Badge tone={c.tone}>{c.label}</Badge>;
  }

  function formatDiscount(campaign) {
    if (campaign.discount_type === "fixed") {
      return <Text variant="bodyMd" fontWeight="medium">£{campaign.discount_value} off</Text>;
    }
    return <Text variant="bodyMd" fontWeight="medium">{campaign.discount_percentage}% off</Text>;
  }

  function formatDate(value, fallback = null) {
    if (!value) return fallback;
    const d = new Date(value);
    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return (
      <BlockStack gap="050">
        <Text variant="bodyMd">{date}</Text>
        <Text variant="bodySm" tone="subdued">{time}</Text>
      </BlockStack>
    );
  }

  const rows = campaigns.map(campaign => [
    <Text variant="bodyMd" fontWeight="semibold">{campaign.name}</Text>,
    getStatusBadge(campaign.status),
    formatDiscount(campaign),
    <Badge tone="info">{`${campaign.variant_count || 0} variants`}</Badge>,
    formatDate(campaign.start_time),
    formatDate(campaign.end_time, <Text tone="subdued">No end time</Text>),
    (campaign.status === "active" || campaign.status === "scheduled") ? (
      <Button
        tone="critical"
        variant="plain"
        size="slim"
        loading={endingCampaign === campaign.id}
        onClick={() => setConfirmEndModal(campaign)}
      >
        End now
      </Button>
    ) : <Text tone="subdued">—</Text>
  ]);

  return (
    <Page
      title="Sale Campaigns"
      subtitle="Schedule, monitor, and end discount campaigns across your store."
      primaryAction={{
        content: "Create campaign",
        onAction: () => navigate("/campaigns/create")
      }}
    >
      {message && (
        <Box paddingBlockEnd="400">
          <Banner tone={message.type} onDismiss={() => setMessage(null)}>
            {message.text}
          </Banner>
        </Box>
      )}

      {confirmEndModal && (
        <Modal
          open={!!confirmEndModal}
          onClose={() => setConfirmEndModal(null)}
          title="End campaign now?"
          primaryAction={{
            content: "End and restore prices",
            destructive: true,
            loading: endingCampaign === confirmEndModal.id,
            onAction: () => handleEndCampaign(confirmEndModal.id)
          }}
          secondaryActions={[{
            content: "Keep running",
            onAction: () => setConfirmEndModal(null)
          }]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <Text>
                Are you sure you want to end <Text as="span" fontWeight="semibold">{confirmEndModal.name}</Text>?
              </Text>
              <Text tone="subdued">
                All {confirmEndModal.variant_count} variant prices will be restored to their original values immediately. This action cannot be undone.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <InlineGrid columns={{ xs: 2, sm: 2, md: 4 }} gap="400">
              <StatCard label="All campaigns" value={counts.total} hint="All-time" />
              <StatCard label="Running" value={counts.running} hint="Live right now" tone="success" />
              <StatCard label="Upcoming" value={counts.upcoming} hint="Scheduled" tone="info" />
              <StatCard label="Ended" value={counts.ended} hint="Completed" />
            </InlineGrid>

            <Card padding="0">
              <Box paddingInline="400" paddingBlockStart="200">
                <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} fitted />
              </Box>
              <Divider />
              <Box>
                {loading ? (
                  <Box padding="1600">
                    <BlockStack gap="200" align="center" inlineAlign="center">
                      <Spinner size="large" />
                      <Text tone="subdued">Loading campaigns…</Text>
                    </BlockStack>
                  </Box>
                ) : campaigns.length === 0 ? (
                  <EmptyState
                    heading={selectedTab === 0 ? "Create your first campaign" : "Nothing to show here"}
                    action={selectedTab === 0 ? {
                      content: "Create campaign",
                      onAction: () => navigate("/campaigns/create")
                    } : undefined}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      {selectedTab === 0
                        ? "Plan a sale, pick the variants, and we will start and stop it on time — automatically."
                        : "Try a different tab to see your other campaigns."}
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                    headings={["Campaign", "Status", "Discount", "Products", "Starts", "Ends", ""]}
                    rows={rows}
                    increasedTableDensity
                  />
                )}
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Box paddingBlockStart="800" />
    </Page>
  );
}

function StatCard({ label, value, hint, tone }) {
  const accent = {
    success: "var(--p-color-text-success)",
    info: "var(--p-color-text-info)",
    critical: "var(--p-color-text-critical)"
  }[tone];

  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="bodySm" tone="subdued" fontWeight="medium">
          {label.toUpperCase()}
        </Text>
        <div style={{ color: accent }}>
          <Text variant="heading2xl" as="p" fontWeight="bold">
            {value ?? 0}
          </Text>
        </div>
        {hint && <Text variant="bodySm" tone="subdued">{hint}</Text>}
      </BlockStack>
    </Card>
  );
}
