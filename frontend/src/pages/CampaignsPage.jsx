import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Page, Card, DataTable, Button, Badge,
  Layout, Text, BlockStack, InlineStack,
  InlineGrid, Spinner, Tabs, Modal, Banner,
  EmptyState, Box, Divider, TextField, Pagination, Tooltip
} from "@shopify/polaris";
import { BACKEND_URL, SHOP } from "../App";
import { authFetch } from "../utils/authFetch";
import { formatUkDate, formatUkTime, formatUkDateTime } from "../utils/ukTime";
import { truncateName } from "../utils/truncate";

const PAGE_SIZE = 20;

export default function CampaignsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState([]);
  const [counts, setCounts] = useState({ total: 0, running: 0, upcoming: 0, ended: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [endingCampaign, setEndingCampaign] = useState(null);
  const [confirmEndModal, setConfirmEndModal] = useState(null);
  const [viewCampaign, setViewCampaign] = useState(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, page]);

  useEffect(() => {
    setPage(1);
  }, [selectedTab]);

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
      const res = await authFetch(`${BACKEND_URL}/api/campaigns?shop=${SHOP}&status=${status}&page=${page}`);
      const data = await res.json();
      if (data.campaigns) setCampaigns(data.campaigns);
      if (data.counts) setCounts(data.counts);
      if (data.totalPages) setTotalPages(data.totalPages);
    } catch (err) {
      console.error("Failed to fetch campaigns", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleEndCampaign(campaignId) {
    setEndingCampaign(campaignId);
    setConfirmEndModal(null);
    setMessage({ type: "info", text: "Ending campaign and restoring prices…" });

    try {
      const res = await authFetch(`${BACKEND_URL}/api/campaigns/${campaignId}/end`, {
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
    return (
      <BlockStack gap="050">
        <Text variant="bodyMd">{formatUkDate(value)}</Text>
        <Text variant="bodySm" tone="subdued">{formatUkTime(value)} UK</Text>
      </BlockStack>
    );
  }

  const rows = campaigns.map(campaign => [
    <Button variant="plain" onClick={() => setViewCampaign(campaign)}>
      <Text variant="bodyMd" fontWeight="semibold">{campaign.name}</Text>
    </Button>,
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

      {viewCampaign && (
        <CampaignDetailModal
          campaign={viewCampaign}
          onClose={() => setViewCampaign(null)}
        />
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
                  <>
                    <DataTable
                      columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                      headings={["Campaign", "Status", "Discount", "Products", "Starts", "Ends", ""]}
                      rows={rows}
                      increasedTableDensity
                    />
                    <Box padding="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text tone="subdued" variant="bodySm">
                          Page {page} of {totalPages} · {PAGE_SIZE} per page
                        </Text>
                        <Pagination
                          hasPrevious={page > 1}
                          onPrevious={() => setPage(p => Math.max(1, p - 1))}
                          hasNext={page < totalPages}
                          onNext={() => setPage(p => p + 1)}
                          label={`${page} / ${totalPages}`}
                        />
                      </InlineStack>
                    </Box>
                  </>
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

function CampaignDetailModal({ campaign, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    authFetch(`${BACKEND_URL}/api/campaigns/${campaign.id}?shop=${SHOP}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error || "Failed to load campaign");
          setData(null);
        } else {
          setData(body);
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaign.id]);

  const items = useMemo(() => data?.items || [], [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(i =>
      (i.product_title || "").toLowerCase().includes(q) ||
      (i.variant_title || "").toLowerCase().includes(q) ||
      (i.sku || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const productName = (name) => {
    const { display, truncated } = truncateName(name);
    const label = <Text variant="bodyMd" fontWeight="medium">{display}</Text>;
    return truncated ? <Tooltip content={name}>{label}</Tooltip> : label;
  };

  const rows = filtered.map(it => [
    productName(it.product_title),
    <Text variant="bodyMd">{it.variant_title && it.variant_title !== "Default Title" ? it.variant_title : "—"}</Text>,
    <Text variant="bodySm" tone="subdued">{it.sku || "—"}</Text>,
    <Text variant="bodyMd">£{it.original_price.toFixed(2)}</Text>,
    <Text variant="bodyMd" tone="critical">−£{it.discount_amount.toFixed(2)}</Text>,
    <Text variant="bodyMd" tone="success" fontWeight="semibold">£{it.sale_price.toFixed(2)}</Text>,
    it.is_restored
      ? <Badge tone="neutral">Restored</Badge>
      : <Badge tone={campaign.status === "active" ? "success" : "info"}>
          {campaign.status === "active" ? "On sale" : campaign.status === "scheduled" ? "Pending" : "—"}
        </Badge>
  ]);

  const statusBadgeFor = (status) => {
    const cfg = {
      active: { tone: "success", label: "Running" },
      scheduled: { tone: "info", label: "Upcoming" },
      completed: { tone: "neutral", label: "Ended" },
      cancelled: { tone: "critical", label: "Cancelled" }
    }[status] || { tone: "neutral", label: status };
    return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
  };

  const discountLabel = campaign.discount_type === "fixed"
    ? `£${campaign.discount_value} off each variant`
    : `${campaign.discount_percentage}% off each variant`;

  return (
    <Modal
      open
      onClose={onClose}
      title={campaign.name}
      size="large"
      secondaryActions={[{ content: "Close", onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="300">
            <DetailField label="Status" value={statusBadgeFor(campaign.status)} />
            <DetailField label="Discount" value={<Text fontWeight="semibold">{discountLabel}</Text>} />
            <DetailField
              label="Starts"
              value={<Text>{formatUkDateTime(campaign.start_time)} <Text as="span" tone="subdued" variant="bodySm">UK</Text></Text>}
            />
            <DetailField
              label="Ends"
              value={campaign.end_time
                ? <Text>{formatUkDateTime(campaign.end_time)} <Text as="span" tone="subdued" variant="bodySm">UK</Text></Text>
                : <Text tone="subdued">No end time</Text>}
            />
          </InlineGrid>

          <Divider />

          {loading ? (
            <Box padding="800">
              <BlockStack gap="200" align="center" inlineAlign="center">
                <Spinner />
                <Text tone="subdued">Loading products…</Text>
              </BlockStack>
            </Box>
          ) : error ? (
            <Banner tone="critical">{error}</Banner>
          ) : items.length === 0 ? (
            <EmptyState
              heading="No products in this campaign"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>This campaign has no variants attached.</p>
            </EmptyState>
          ) : (
            <BlockStack gap="300">
              <TextField
                label=""
                labelHidden
                value={search}
                onChange={setSearch}
                placeholder="Search by product, variant, or SKU…"
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearch("")}
              />

              <InlineStack align="space-between" blockAlign="center">
                <Text tone="subdued" variant="bodySm">
                  Showing {filtered.length} of {items.length} variant{items.length === 1 ? "" : "s"}
                  {data?.source === "live" && " · live preview (campaign not started yet)"}
                </Text>
              </InlineStack>

              {filtered.length === 0 ? (
                <Box padding="800">
                  <Text tone="subdued" alignment="center">No products match "{search}".</Text>
                </Box>
              ) : (
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text", "text"]}
                  headings={["Product", "Variant", "SKU", "Original", "Discount", "Sale price", "State"]}
                  rows={rows}
                  increasedTableDensity
                />
              )}
            </BlockStack>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

function DetailField({ label, value }) {
  return (
    <BlockStack gap="050">
      <Text variant="bodySm" tone="subdued" fontWeight="medium">{label.toUpperCase()}</Text>
      <Box>{value}</Box>
    </BlockStack>
  );
}
